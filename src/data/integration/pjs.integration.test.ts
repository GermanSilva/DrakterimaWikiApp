import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { pickOwnerPatch } from '../../campaign/pjOwnerFields'
import { createDataLayer, type DataLayer } from '../index'
import type { FlatEntity } from '../types'
import { createAdminClient, createTestUser, type TestUser } from './testUsers'

const env = inject('supabase')

/**
 * H8a: who can change what on a character, through the REAL data layer and the real guard / RLS.
 * The hub UI only ever offers an owner the identity fields; this proves the database rejects the rest
 * even if a payload were forged, and that the allowed path (incl. the merged `sections_updated`) works.
 */
describe('characters (pjs): owner, other players and DM against the local stack', () => {
  let dm: TestUser
  let owner: TestUser
  let other: TestUser
  let dmData: DataLayer
  let ownerData: DataLayer
  let otherData: DataLayer
  let campaignId = ''
  let mine: FlatEntity // owned by `owner`
  let theirs: FlatEntity // owned by `other`
  const created: TestUser[] = []

  async function newUser(label: string) {
    const user = await createTestUser(env, label)
    created.push(user)
    return user
  }

  async function cleanup() {
    const admin = createAdminClient(env)
    if (campaignId) {
      await admin.from('campaigns').delete().eq('id', campaignId)
      campaignId = ''
    }
    for (const u of created.splice(0)) await admin.auth.admin.deleteUser(u.id)
  }

  beforeAll(async () => {
    try {
      dm = await newUser('pj-dm')
      owner = await newUser('pj-owner')
      other = await newUser('pj-other')
      dmData = createDataLayer(dm.client)
      ownerData = createDataLayer(owner.client)
      otherData = createDataLayer(other.client)
      const campaign = await dmData.campaigns.createCampaign(`h8a-${randomBytes(4).toString('hex')}`, 'H8a integration')
      campaignId = campaign.id
      mine = await dmData.entity('pjs').create(campaignId, {
        nombre: 'Eldric', clase: 'Paladin', nivel: 3, stat_hp: 20, trasfondo: 'antes', custom_fields: { magralita: 'vieja' },
        sections_updated: { equipo: '2026-01-01T00:00:00.000Z' },
      })
      theirs = await dmData.entity('pjs').create(campaignId, { nombre: 'Maisie', clase: 'Maga', nivel: 2 })
      for (const [user, pj] of [[owner, mine], [other, theirs]] as const) {
        const invite = await dmData.campaigns.createInvite({ campaign_id: campaignId, role: 'player', character_id: pj.id })
        await createDataLayer(user.client).campaigns.acceptInvite(invite.code)
      }
    } catch (e) {
      await cleanup().catch(() => undefined)
      throw e
    }
  })

  afterAll(cleanup)

  it('the owner updates identity fields, a custom field and the unread stamps (merged, other stamps kept)', async () => {
    const updated = await ownerData.entity('pjs').update(mine.id, {
      jugador: 'Ana',
      clase: 'Clérigo',
      trasfondo: 'ahora',
      custom_fields: { magralita: 'nueva' },
      sections_updated: { general: '2026-02-01T00:00:00.000Z', narrativa: '2026-02-01T00:00:00.000Z' },
    })
    expect(updated).toMatchObject({ jugador: 'Ana', clase: 'Clérigo', trasfondo: 'ahora', nivel: 3, stat_hp: 20 })
    expect(updated.custom_fields).toEqual({ magralita: 'nueva' })
    expect(updated.sections_updated).toEqual({
      equipo: '2026-01-01T00:00:00.000Z', // merged, not replaced
      general: '2026-02-01T00:00:00.000Z',
      narrativa: '2026-02-01T00:00:00.000Z',
    })
  })

  it('everything the UI never offers an owner is rejected by the database (permission), all or nothing', async () => {
    const own = ownerData.entity('pjs')
    const forbidden: Record<string, unknown>[] = [
      { nivel: 20 },
      { monedas: { cp: 0, sp: 0, ep: 0, gp: 1_000_000, pp: 0 } },
      { monedas_guardado: { gp: 5 } },
      { estado: 'borrador' },
      { owner_id: other.id },
      { stat_hp: 999 }, // a data key outside the identity subset
      { experiencia: 999 },
      { hechizos: [{ id: 1, nombre: 'Deseo', nivel: 9 }] },
    ]
    for (const patch of forbidden) {
      await expect(own.update(mine.id, patch), JSON.stringify(patch)).rejects.toMatchObject({ kind: 'permission' })
    }
    // an allowed edit riding together with a forbidden one is rejected as a whole
    await expect(own.update(mine.id, { clase: 'Brujo', nivel: 19 })).rejects.toMatchObject({ kind: 'permission' })
    const after = await dmData.entity('pjs').get(mine.id)
    expect(after).toMatchObject({ clase: 'Clérigo', nivel: 3, stat_hp: 20, estado: 'publicado' })
    expect(after?.monedas).toEqual({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 })
  })

  it('a forged owner payload is exactly what the UI-side filter strips', () => {
    const forged = { clase: 'x', nivel: 20, monedas: { gp: 9 }, estado: 'secreto', owner_id: 'u', stat_hp: 1, trasfondo: 'ok' }
    expect(Object.keys(pickOwnerPatch(forged)).sort()).toEqual(['clase', 'trasfondo'])
  })

  it('an owner cannot delete the character, and another player cannot edit it at all', async () => {
    await expect(ownerData.entity('pjs').remove(mine.id)).rejects.toMatchObject({ kind: 'permission' })
    await expect(otherData.entity('pjs').update(mine.id, { clase: 'Hackeado' })).rejects.toMatchObject({ kind: 'permission' })
    await expect(otherData.entity('pjs').update(mine.id, { sections_updated: { general: 'x' } })).rejects.toMatchObject({ kind: 'permission' })
    expect(await dmData.entity('pjs').get(mine.id)).toMatchObject({ clase: 'Clérigo' })
    // and a player can not create characters
    await expect(ownerData.entity('pjs').create(campaignId, { nombre: 'Intruso' })).rejects.toMatchObject({ kind: 'permission' })
  })

  it('hostile custom_fields / sections_updated from an owner are rejected; future stamps are clamped; a stale client cannot move a stamp back', async () => {
    const own = ownerData.entity('pjs')
    const future = new Date(Date.now() + 86_400_000).toISOString()
    for (const patch of [
      { custom_fields: 'texto' },
      { custom_fields: { a: { b: 1 } } },
      { custom_fields: { a: 'x'.repeat(9000) } },
      { sections_updated: { inventado: new Date().toISOString() } },
      { sections_updated: { dm: new Date().toISOString() } },
      { sections_updated: { stats: 'tomorrow' } },
      { sections_updated: { stats: 12345 } },
    ]) {
      await expect(own.update(mine.id, patch as Record<string, unknown>), JSON.stringify(patch).slice(0, 60)).rejects.toMatchObject({ kind: 'permission' })
    }
    // a device clock that is ahead does not break the save: the future stamp is clamped to the server time
    const ahead = await own.update(mine.id, { sections_updated: { habilidades: future } })
    expect(Date.parse((ahead.sections_updated as Record<string, string>).habilidades)).toBeLessThanOrEqual(Date.now() + 1000)
    // per-key max merge on the client: an older stamp does not overwrite the stored one
    const stored = (await dmData.entity('pjs').get(mine.id))?.sections_updated as Record<string, string>
    const merged = await own.update(mine.id, { sections_updated: { narrativa: '2001-01-01T00:00:00.000Z', stats: new Date().toISOString() } })
    expect((merged.sections_updated as Record<string, string>).narrativa).toBe(stored.narrativa)
    expect(Date.parse((merged.sections_updated as Record<string, string>).stats)).toBeGreaterThan(Date.parse(stored.narrativa) - 1)
  })

  it('the DM edits everything of a character: level, mechanics, coins (both purses) and DM notes', async () => {
    const dmPjs = dmData.entity('pjs')
    const updated = await dmPjs.update(mine.id, {
      nivel: 4,
      stat_hp: 33,
      monedas: { cp: 1, sp: 2, ep: 0, gp: 30, pp: 1 },
      monedas_guardado: { cp: 0, sp: 0, ep: 0, gp: 500, pp: 0 },
      sections_updated: { equipo: '2026-03-01T00:00:00.000Z' },
    })
    expect(updated).toMatchObject({ nivel: 4, stat_hp: 33, clase: 'Clérigo' })
    expect(updated.monedas).toEqual({ cp: 1, sp: 2, ep: 0, gp: 30, pp: 1 })
    expect(updated.monedas_guardado).toMatchObject({ gp: 500 })
    expect((updated.sections_updated as Record<string, string>).equipo).toBe('2026-03-01T00:00:00.000Z')
    await dmData.dmNotes.upsert(campaignId, 'pjs', mine.id, { notas: 'solo para el DM' })
    expect((await dmData.dmNotes.get('pjs', mine.id))?.notas).toBe('solo para el DM')
  })

  it('DM notes of a character are invisible to its owner and to other players', async () => {
    expect(await ownerData.dmNotes.get('pjs', mine.id)).toBeNull()
    expect(await otherData.dmNotes.get('pjs', mine.id)).toBeNull()
    expect(await ownerData.dmNotes.list(campaignId, 'pjs')).toEqual([])
    await expect(ownerData.dmNotes.upsert(campaignId, 'pjs', mine.id, { notas: 'mío' })).rejects.toMatchObject({ kind: 'permission' })
  })

  it('an owner keeps seeing their own draft character; other players do not see it', async () => {
    await dmData.entity('pjs').update(mine.id, { estado: 'borrador' })
    expect(await ownerData.entity('pjs').get(mine.id)).toMatchObject({ nombre: 'Eldric', estado: 'borrador' })
    expect((await ownerData.entity('pjs').list(campaignId)).map((p) => p.id)).toContain(mine.id)
    expect(await otherData.entity('pjs').get(mine.id)).toBeNull()
    expect((await otherData.entity('pjs').list(campaignId)).map((p) => p.id)).not.toContain(mine.id)
    // the owner may still edit identity while it is a draft
    expect(await ownerData.entity('pjs').update(mine.id, { raza: 'Elfo' })).toMatchObject({ raza: 'Elfo', estado: 'borrador' })
  })

  it('unread state per section is the viewer\'s own: writable by the viewer, never by someone else', async () => {
    await ownerData.readState.markSeen(campaignId, 'pjs', mine.id, 'equipo', new Date('2026-04-01T00:00:00Z'))
    const ownRows = await ownerData.readState.list(campaignId)
    expect(ownRows.find((r) => r.entity_id === mine.id && r.section === 'equipo')?.seen_at).toContain('2026-04-01')
    expect((await otherData.readState.list(campaignId)).some((r) => r.entity_id === mine.id)).toBe(false)
    expect((await dmData.readState.list(campaignId)).some((r) => r.entity_id === mine.id)).toBe(false)
  })
})
