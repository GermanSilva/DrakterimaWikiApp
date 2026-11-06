import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDataLayer, type DataLayer } from '../index'
import type { FlatEntity } from '../types'
import { createAdminClient, createTestUser, type TestUser } from './testUsers'

const env = inject('supabase')

const SHEET = {
  roles: {},
  categories: [
    {
      key: 'c',
      label: 'C',
      sections: [
        {
          key: 'alpha',
          label: 'Alpha',
          blocks: [],
          items: [
            {
              kind: 'table', type: 'habilidad', key: 'hechizos', label: 'Hechizos', editableBy: 'player',
              categories: [{ key: 'truco', label: 'Truco' }, { key: 'nivel1', label: 'Nivel 1' }],
              columns: [
                { key: 'escuela', label: 'Escuela', type: 'short', editableBy: 'player', scope: 'entry' },
                { key: 'preparado', label: 'Preparado', type: 'boolean', editableBy: 'player', scope: 'character' },
                { key: 'usos', label: 'Usos', type: 'number', editableBy: 'player', scope: 'character' },
              ],
            },
            {
              kind: 'table', type: 'habilidad', key: 'rasgos', label: 'Rasgos', editableBy: 'dm',
              columns: [
                { key: 'fuente', label: 'Fuente', type: 'short', editableBy: 'dm' },
                { key: 'usada', label: 'Usada', type: 'boolean', editableBy: 'dm', scope: 'character' },
              ],
            },
          ],
        },
      ],
    },
  ],
}

/**
 * G6a: the shared action collection through the REAL data layer and RLS: the DM sees and writes everything, a player sees only
 * the entries linked to their character plus their private ones and writes only character-scope link state, an outsider nothing.
 */
describe('action collection (G6a): DM, player and outsider against the local stack', () => {
  let dm: TestUser
  let player: TestUser
  let player2: TestUser
  let outsider: TestUser
  let dmData: DataLayer
  let playerData: DataLayer
  let player2Data: DataLayer
  let outsiderData: DataLayer
  let campaignId = ''
  let mine: FlatEntity
  let theirs: FlatEntity
  const ids: Record<string, number> = {}
  const created: TestUser[] = []

  async function newUser(label: string, hubOwner = false) {
    const user = await createTestUser(env, label, { hubOwner })
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
      dm = await newUser('coll-dm', true)
      player = await newUser('coll-player')
      player2 = await newUser('coll-player2')
      outsider = await newUser('coll-outsider')
      dmData = createDataLayer(dm.client)
      playerData = createDataLayer(player.client)
      player2Data = createDataLayer(player2.client)
      outsiderData = createDataLayer(outsider.client)
      const campaign = await dmData.campaigns.createCampaign(`g6a-${randomBytes(4).toString('hex')}`, 'G6a integration')
      campaignId = campaign.id
      await dmData.campaigns.setSystemProfile(campaignId, { ...(campaign.system_profile as object), sheet: SHEET }, campaign.updated_at)
      mine = await dmData.entity('pjs').create(campaignId, { nombre: 'Eldric' })
      theirs = await dmData.entity('pjs').create(campaignId, { nombre: 'Maisie' })
      for (const [user, pj] of [[player, mine], [player2, theirs]] as const) {
        const invite = await dmData.campaigns.createInvite({ campaign_id: campaignId, role: 'player', character_id: pj.id })
        await createDataLayer(user.client).campaigns.acceptInvite(invite.code)
      }
      const make = async (key: string, input: Parameters<DataLayer['actions']['createAction']>[1]) => {
        ids[key] = (await dmData.actions.createAction(campaignId, input)).id
      }
      await make('luz', { table_key: 'hechizos', category: 'truco', name: 'Luz', extras: { escuela: 'evocacion' } })
      await make('escudo', { table_key: 'hechizos', category: 'nivel1', name: 'Escudo' })
      await make('chispa', { table_key: 'hechizos', category: 'truco', name: 'Chispa' })
      await make('privada', { table_key: 'hechizos', category: 'truco', name: 'Mi truco', private_to_pj: mine.id })
      await make('ajena', { table_key: 'hechizos', category: 'truco', name: 'Truco ajeno', private_to_pj: theirs.id })
      await make('vision', { table_key: 'rasgos', category: 'Raza', name: 'Vision', extras: { fuente: 'elfo' } })
      await dmData.actions.link(campaignId, mine.id, ids.luz)
      await dmData.actions.link(campaignId, mine.id, ids.escudo, { preparado: true })
      await dmData.actions.link(campaignId, mine.id, ids.vision)
      await dmData.actions.link(campaignId, theirs.id, ids.escudo)
      await dmData.actions.link(campaignId, theirs.id, ids.ajena)
    } catch (e) {
      await cleanup().catch(() => undefined)
      throw e
    }
  })

  afterAll(cleanup)

  it('the DM lists every entry and every link of the campaign', async () => {
    expect((await dmData.actions.listActions(campaignId)).map((a) => a.name).sort()).toEqual(['Chispa', 'Escudo', 'Luz', 'Mi truco', 'Truco ajeno', 'Vision'])
    expect(await dmData.actions.listLinks(campaignId)).toHaveLength(5)
  })

  it('a player sees only the entries linked to their character plus their private one', async () => {
    const seen = (await playerData.actions.listActions(campaignId)).map((a) => a.name).sort()
    expect(seen).toEqual(['Escudo', 'Luz', 'Mi truco', 'Vision'])
    expect((await playerData.actions.listLinks(campaignId)).map((l) => l.pj_id)).toEqual([mine.id, mine.id, mine.id])
    const linked = await playerData.actions.listLinkedActions(mine.id)
    expect(linked.map((l) => l.action.name)).toEqual(['Escudo', 'Luz', 'Vision'])
    expect(linked.find((l) => l.action.name === 'Escudo')?.link.state).toEqual({ preparado: true })
    // the other player sees their own pair, never the first player's
    expect((await player2Data.actions.listActions(campaignId)).map((a) => a.name).sort()).toEqual(['Escudo', 'Truco ajeno'])
    expect(await player2Data.actions.listLinkedActions(mine.id)).toEqual([])
  })

  it('an outsider sees nothing', async () => {
    expect(await outsiderData.actions.listActions(campaignId)).toEqual([])
    expect(await outsiderData.actions.listLinks(campaignId)).toEqual([])
    await expect(outsiderData.actions.createAction(campaignId, { table_key: 'hechizos', category: 'truco', name: 'X' })).rejects.toMatchObject({ kind: 'permission' })
  })

  it('a player cannot create, edit, delete, link or unlink', async () => {
    await expect(playerData.actions.createAction(campaignId, { table_key: 'hechizos', category: 'truco', name: 'Mio' })).rejects.toMatchObject({ kind: 'permission' })
    await expect(playerData.actions.updateAction(ids.luz, { name: 'Hackeada' })).rejects.toMatchObject({ kind: 'permission' })
    await expect(playerData.actions.updateAction(ids.privada, { description: 'x' })).rejects.toMatchObject({ kind: 'permission' })
    await expect(playerData.actions.removeAction(ids.luz)).rejects.toMatchObject({ kind: 'permission' })
    await expect(playerData.actions.link(campaignId, mine.id, ids.chispa)).rejects.toMatchObject({ kind: 'permission' })
    await expect(playerData.actions.unlink(mine.id, ids.luz)).rejects.toMatchObject({ kind: 'permission' })
    // an unlinked entry is simply not there for them
    await expect(playerData.actions.updateAction(ids.chispa, { name: 'x' })).rejects.toMatchObject({ kind: 'not_found' })
    expect((await dmData.actions.listActions(campaignId)).find((a) => a.id === ids.luz)?.name).toBe('Luz')
  })

  it('a player writes character-scope state of a player-editable table, merged with what is stored', async () => {
    const row = await playerData.actions.updateLinkState(mine.id, ids.escudo, { usos: 2 })
    expect(row.state).toEqual({ preparado: true, usos: 2 })
    const cleared = await playerData.actions.updateLinkState(mine.id, ids.escudo, { usos: null })
    expect(cleared.state).toEqual({ preparado: true, usos: null })
  })

  it('a player is refused everything else on link state, with the stable reasons', async () => {
    await expect(playerData.actions.updateLinkState(mine.id, ids.luz, { usos: 'muchos' })).rejects.toMatchObject({ kind: 'validation', reason: 'invalid_link_state' })
    await expect(playerData.actions.updateLinkState(mine.id, ids.luz, { escuela: 'x' })).rejects.toMatchObject({ kind: 'validation', reason: 'invalid_link_state' })
    await expect(playerData.actions.updateLinkState(mine.id, ids.luz, { inventado: 1 })).rejects.toMatchObject({ kind: 'validation', reason: 'invalid_link_state' })
    // a character column of a DM table is closed to the player
    await expect(playerData.actions.updateLinkState(mine.id, ids.vision, { usada: true })).rejects.toMatchObject({ kind: 'permission', reason: 'link_state_not_writable' })
    // the link of another character is invisible
    await expect(playerData.actions.updateLinkState(theirs.id, ids.escudo, { usos: 1 })).rejects.toMatchObject({ kind: 'not_found' })
    const stored = (await dmData.actions.listLinks(campaignId)).find((l) => l.pj_id === mine.id && l.action_id === ids.vision)
    expect(stored?.state).toEqual({})
  })

  it('the DM writes the state of a DM table; a stale base is a conflict', async () => {
    const before = (await dmData.actions.listLinks(campaignId)).find((l) => l.pj_id === mine.id && l.action_id === ids.vision)
    const row = await dmData.actions.updateLinkState(mine.id, ids.vision, { usada: true }, { base: before })
    expect(row.state).toEqual({ usada: true })
    await expect(dmData.actions.updateLinkState(mine.id, ids.vision, { usada: false }, { base: before })).rejects.toMatchObject({ name: 'ConflictError' })
  })

  it('the DM edits entries; validation reasons and the dedupe key surface as typed errors', async () => {
    const edited = await dmData.actions.updateAction(ids.luz, { description: 'Una luz.', extras: { escuela: 'abjuracion' } })
    expect(edited).toMatchObject({ description: 'Una luz.', extras: { escuela: 'abjuracion' } })
    await expect(dmData.actions.createAction(campaignId, { table_key: 'hechizos', category: 'truco', name: 'luz' })).rejects.toMatchObject({ kind: 'conflict' })
    await expect(dmData.actions.createAction(campaignId, { table_key: 'hechizos', category: 'nivel9', name: 'X' })).rejects.toMatchObject({ reason: 'invalid_action_category' })
    await expect(dmData.actions.createAction(campaignId, { table_key: 'nope', category: '', name: 'X' })).rejects.toMatchObject({ reason: 'action_not_in_sheet' })
    await expect(dmData.actions.createAction(campaignId, { table_key: 'hechizos', category: 'truco', name: 'X', extras: { usos: 1 } })).rejects.toMatchObject({ reason: 'invalid_action_extras' })
    await expect(dmData.actions.link(campaignId, mine.id, ids.ajena)).rejects.toMatchObject({ reason: 'action_private_to_other_character' })
    await expect(dmData.actions.link(campaignId, mine.id, ids.luz)).rejects.toMatchObject({ kind: 'conflict' })
  })

  it('unlinking and deleting cascade: the player stops seeing the entry', async () => {
    await dmData.actions.unlink(mine.id, ids.luz)
    expect((await playerData.actions.listActions(campaignId)).map((a) => a.name)).not.toContain('Luz')
    await dmData.actions.removeAction(ids.escudo)
    expect((await playerData.actions.listLinkedActions(mine.id)).map((l) => l.action.name)).toEqual(['Vision'])
    expect((await player2Data.actions.listActions(campaignId)).map((a) => a.name)).toEqual(['Truco ajeno'])
  })

  it('deleting a character removes the entries private to it', async () => {
    await dmData.entity('pjs').remove(theirs.id)
    expect((await dmData.actions.listActions(campaignId)).map((a) => a.name)).not.toContain('Truco ajeno')
  })
})
