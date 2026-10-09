import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { COLUMN_LIST_ENTRIES, ENTITY_TABLES } from '../columns'
import { ConflictError, DataError } from '../errors'
import { createDataLayer, type DataLayer } from '../index'
import { entitySource, subscribeToTable } from '../realtime'
import type { FlatEntity } from '../types'
import { createAdminClient, createTestUser, type TestUser } from './testUsers'

const env = inject('supabase')

function waitFor<T>(register: (done: (v: T) => void) => void, ms = 10000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
    register((v) => {
      clearTimeout(timer)
      resolve(v)
    })
  })
}

describe('data layer against the local Supabase stack', () => {
  let dm: TestUser
  let player: TestUser
  let stranger: TestUser
  let dmData: DataLayer
  let playerData: DataLayer
  let strangerData: DataLayer
  let campaignId: string
  let slug: string
  let pj: FlatEntity
  let pub: FlatEntity
  let shared: FlatEntity
  let hidden: FlatEntity
  let draft: FlatEntity

  /** An id that exists in no table (bigint identity ids start at 1 and never get this high here). */
  const MISSING_ID = 2147483647
  const createdUsers: TestUser[] = []

  /**
   * Deletes the campaign and users. Idempotent: what was deleted is forgotten, so a second call
   * (setup failure + afterAll) only retries leftovers; "user not found" counts as already deleted.
   * Every other error is logged and the first one is rethrown.
   */
  async function cleanup() {
    const admin = createAdminClient(env)
    const failures: string[] = []
    if (campaignId) {
      const { error } = await admin.from('campaigns').delete().eq('id', campaignId) // cascades to everything
      if (error) failures.push(`delete campaign ${campaignId}: ${error.message}`)
      else campaignId = ''
    }
    for (const u of [...createdUsers]) {
      const { error } = await admin.auth.admin.deleteUser(u.id)
      if (error && error.status !== 404 && !/not found/i.test(error.message)) {
        failures.push(`delete user ${u.email}: ${error.message}`)
      } else {
        createdUsers.splice(createdUsers.indexOf(u), 1)
      }
    }
    if (failures.length > 0) {
      console.error(['INTEGRATION TEARDOWN FAILED, leftovers in the local DB:', ...failures].join('\n'))
      throw new Error(`teardown failed: ${failures[0]}`)
    }
  }

  async function newUser(label: string): Promise<TestUser> {
    const user = await createTestUser(env, label)
    createdUsers.push(user) // sequential: a later failure still cleans up the earlier users
    return user
  }

  beforeAll(async () => {
    try {
      await setup()
    } catch (e) {
      await cleanup().catch(() => undefined) // already reported by cleanup()
      throw e
    }
  })

  async function setup() {
    dm = await newUser('dm')
    player = await newUser('player')
    stranger = await newUser('stranger')
    dmData = createDataLayer(dm.client)
    playerData = createDataLayer(player.client)
    strangerData = createDataLayer(stranger.client)

    slug = `h4-${randomBytes(4).toString('hex')}`
    const campaign = await dmData.campaigns.createCampaign(slug, 'H4 integration')
    campaignId = campaign.id

    const pnjs = dmData.entity('pnjs')
    pub = await pnjs.create(campaignId, { nombre: 'Publico', rol: 'herrero', descripcion: 'visible para todos' })
    shared = await pnjs.create(campaignId, { nombre: 'Compartido', estado: 'secreto', rol: 'espia' })
    hidden = await pnjs.create(campaignId, { nombre: 'Oculto', estado: 'secreto' })
    draft = await pnjs.create(campaignId, { nombre: 'Borrador', estado: 'borrador' })
    pj = await dmData.entity('pjs').create(campaignId, { nombre: 'Heroe', clase: 'Guerrero', nivel: 3 })

    const invite = await dmData.campaigns.createInvite({ campaign_id: campaignId, role: 'player', character_id: pj.id })
    const accepted = await playerData.campaigns.acceptInvite(invite.code)
    expect(accepted).toMatchObject({ joined: true, claimed: true, slug, role: 'player', character_id: pj.id })

    await dmData.visibility.setVisibility('pnjs', shared.id, [pj.id])
  }

  afterAll(cleanup)

  it('DM creates a campaign via RPC and sees it with the dm role; players see theirs with the player role', async () => {
    const mineDm = await dmData.campaigns.listMyCampaigns(dm.id)
    expect(mineDm.find((c) => c.id === campaignId)?.role).toBe('dm')
    const minePlayer = await playerData.campaigns.listMyCampaigns(player.id)
    expect(minePlayer.find((c) => c.id === campaignId)?.role).toBe('player')
    expect((await playerData.campaigns.getCampaignBySlug(slug))?.id).toBe(campaignId)

    const members = await dmData.campaigns.listMembers(campaignId)
    expect(members).toHaveLength(2)
    expect(members.every((m) => m.profile !== null)).toBe(true)
  })

  it('a stranger sees nothing of the campaign', async () => {
    expect(await strangerData.campaigns.getCampaignBySlug(slug)).toBeNull()
    expect(await strangerData.entity('pnjs').list(campaignId)).toEqual([])
    expect(await strangerData.entity('pnjs').get(pub.id)).toBeNull()
  })

  it('a player lists only the entities they may see, and rows never carry visible_to', async () => {
    const dmNames = (await dmData.entity('pnjs').list(campaignId)).map((e) => e.nombre).sort()
    expect(dmNames).toEqual(['Borrador', 'Compartido', 'Oculto', 'Publico'])

    const items = await playerData.entity('pnjs').list(campaignId)
    expect(items.map((e) => e.nombre).sort()).toEqual(['Compartido', 'Publico'])
    for (const item of items) {
      expect(item).not.toHaveProperty('visible_to')
      expect(item).not.toHaveProperty('notas')
      expect(item).not.toHaveProperty('secreto')
    }
    expect(await playerData.entity('pnjs').get(draft.id)).toBeNull()
    expect(await playerData.entity('pnjs').get(hidden.id)).toBeNull()
    expect(items.find((e) => e.nombre === 'Publico')).toMatchObject({ rol: 'herrero', campaign_id: campaignId })
  })

  it('selecting * or visible_to directly is denied by column privileges', async () => {
    const star = await player.client.from('pnjs').select('*').eq('campaign_id', campaignId)
    expect(star.error?.code).toBe('42501')
    const col = await player.client.from('pnjs').select('visible_to').eq('campaign_id', campaignId)
    expect(col.error?.code).toBe('42501')
  })

  it('visibility is DM-only through the RPCs', async () => {
    expect(await dmData.visibility.getVisibility('pnjs', [shared.id, hidden.id])).toEqual({
      [shared.id]: [pj.id],
      [hidden.id]: [],
    })
    expect(await playerData.visibility.getVisibility('pnjs', [shared.id])).toEqual({})
    await expect(playerData.visibility.setVisibility('pnjs', shared.id, [])).rejects.toMatchObject({ kind: 'permission' })
  })

  it('patch update keeps the other data keys and rejects a stale base', async () => {
    const pnjs = dmData.entity('pnjs')
    const before = (await pnjs.get(pub.id)) as FlatEntity
    const updated = await pnjs.update(pub.id, { rol: 'capitan' }, { base: before })
    expect(updated).toMatchObject({ rol: 'capitan', descripcion: 'visible para todos', nombre: 'Publico' })

    // the row moved on since `before`: writing from it must conflict, not overwrite
    await expect(pnjs.update(pub.id, { rol: 'otro' }, { base: before })).rejects.toBeInstanceOf(ConflictError)
    expect(await pnjs.get(pub.id)).toMatchObject({ rol: 'capitan' })

    // without a base the repository reads the fresh row itself
    const again = await pnjs.update(pub.id, { extra: 1 })
    expect(again).toMatchObject({ rol: 'capitan', descripcion: 'visible para todos', extra: 1 })

    // column-only patch leaves data untouched
    expect(await pnjs.update(pub.id, { relacion: 'aliado' })).toMatchObject({ relacion: 'aliado', extra: 1 })
  })

  it('DM-private notes live apart and are invisible to players', async () => {
    await dmData.dmNotes.upsert(campaignId, 'pnjs', pub.id, { secreto: 'es un espia', notas: 'n1' })
    await dmData.dmNotes.upsert(campaignId, 'pnjs', pub.id, { notas: 'n2' }) // partial: secreto must survive
    expect(await dmData.dmNotes.get('pnjs', pub.id)).toMatchObject({ secreto: 'es un espia', notas: 'n2' })

    expect(await playerData.dmNotes.get('pnjs', pub.id)).toBeNull()
    await expect(playerData.dmNotes.upsert(campaignId, 'pnjs', pub.id, { notas: 'x' })).rejects.toBeInstanceOf(DataError)
    expect(await playerData.entity('pnjs').get(pub.id)).not.toHaveProperty('secreto')
  })

  it('players cannot write entities, and can only edit identity fields of their own character', async () => {
    await expect(playerData.entity('pnjs').create(campaignId, { nombre: 'x' })).rejects.toMatchObject({ kind: 'permission' })
    await expect(playerData.entity('pnjs').remove(pub.id)).rejects.toBeInstanceOf(DataError)

    const own = playerData.entity('pjs')
    expect(await own.update(pj.id, { clase: 'Mago' })).toMatchObject({ clase: 'Mago' })
    expect(await own.update(pj.id, { trasfondo: 'huerfano' })).toMatchObject({ trasfondo: 'huerfano', clase: 'Mago' })
    await expect(own.update(pj.id, { nivel: 20 })).rejects.toMatchObject({ kind: 'permission' })
  })

  it('lottery is decided server-side and playable once per day per character', async () => {
    const result = await playerData.games.playLoteria(campaignId, pj.id)
    expect(result.roll).toBeGreaterThanOrEqual(1)
    expect(result.roll).toBeLessThanOrEqual(20)
    await expect(playerData.games.playLoteria(campaignId, pj.id)).rejects.toMatchObject({
      kind: 'business',
      reason: 'already_played_today',
    })
    expect((await playerData.games.listLogs(campaignId)).length).toBe(1)
  })

  it('RPC reasons stay distinguishable even when raised with SQLSTATE 42501', async () => {
    await expect(strangerData.games.playLoteria(campaignId, pj.id)).rejects.toMatchObject({
      kind: 'permission',
      reason: 'not_a_member',
    })
    await expect(playerData.visibility.setVisibility('pnjs', pub.id, [])).rejects.toMatchObject({
      kind: 'permission',
      reason: 'dm_only',
    })
  })

  it('player notes and read state are per user', async () => {
    await playerData.playerNotes.upsert({ campaignId, entityType: 'pnjs', entityId: pub.id, text: 'mi nota', characterId: pj.id })
    expect((await playerData.playerNotes.list(campaignId)).map((n) => n.text)).toEqual(['mi nota'])
    expect(await strangerData.playerNotes.list(campaignId)).toEqual([])
    expect((await dmData.playerNotes.list(campaignId)).map((n) => n.text)).toEqual(['mi nota'])

    await playerData.readState.markSeen(campaignId, 'pnjs', pub.id)
    // play_loteria may also write read_state rows (coin-credit unread suppression on the PJ) when the
    // random roll wins, so assert on the row this test created rather than on the total count.
    const seen = (await playerData.readState.list(campaignId)).filter(
      (r) => r.entity_type === 'pnjs' && r.entity_id === pub.id,
    )
    expect(seen).toHaveLength(1)
    expect(await dmData.readState.list(campaignId)).toEqual([])
  })

  it('presence: members touch their own row, only the DM reads them, strangers are refused', async () => {
    await playerData.presence.touch(campaignId)
    await dmData.presence.touch(campaignId)
    await playerData.presence.touch(campaignId) // inside the throttle window: a no-op, not an error
    await expect(strangerData.presence.touch(campaignId)).rejects.toMatchObject({ kind: 'permission', reason: 'not_a_member' })

    const rows = await dmData.presence.list(campaignId)
    expect(rows.map((r) => r.user_id).sort()).toEqual([dm.id, player.id].sort())
    expect(rows.every((r) => Number.isFinite(Date.parse(r.last_seen_at)))).toBe(true)
    expect(await playerData.presence.list(campaignId)).toEqual([]) // not even their own
    expect(await strangerData.presence.list(campaignId)).toEqual([])
  })

  it('campaign config: members read loteria, the DM patches it and other keys survive', async () => {
    const loteria = await dmData.config.get(campaignId, 'loteria')
    expect(loteria?.visibility).toBe('members')
    const patched = await dmData.config.patch(campaignId, 'loteria', { commonMinRoll: 7 })
    expect(patched.value).toMatchObject({ commonMinRoll: 7 })
    expect(Object.keys(patched.value).length).toBeGreaterThan(1) // other keys kept
    expect((await playerData.config.get(campaignId, 'loteria'))?.value).toMatchObject({ commonMinRoll: 7 })
    await expect(playerData.config.patch(campaignId, 'loteria', { commonMinRoll: 1 })).rejects.toMatchObject({
      kind: 'permission',
    })
  })

  it('session_screen: DM-only, created with base null, then guarded by updated_at (a stale base conflicts)', async () => {
    expect(await playerData.config.get(campaignId, 'session_screen')).toBeNull() // RLS hides a dm-visibility row
    const first = await dmData.config.patch(campaignId, 'session_screen', { cards: [{ id: 1, tipo: 'notes', text: 'a' }] }, 'dm', null)
    expect(first.visibility).toBe('dm')
    expect(await playerData.config.get(campaignId, 'session_screen')).toBeNull()
    await expect(dmData.config.patch(campaignId, 'session_screen', { cards: [] }, 'dm', null)).rejects.toMatchObject({ kind: 'conflict' })
    const second = await dmData.config.patch(campaignId, 'session_screen', { cards: [{ id: 1, tipo: 'notes', text: 'b' }] }, 'dm', first.updated_at)
    expect(second.updated_at).not.toBe(first.updated_at)
    // the other tab still holds the first version
    await expect(dmData.config.patch(campaignId, 'session_screen', { cards: [] }, 'dm', first.updated_at)).rejects.toMatchObject({ kind: 'conflict' })
    expect((await dmData.config.get(campaignId, 'session_screen'))?.value).toEqual({ cards: [{ id: 1, tipo: 'notes', text: 'b' }] })
  })

  it('updateCampaign: the DM renames and merges branding under an updated_at guard; a player and a stranger cannot', async () => {
    const before = (await dmData.campaigns.getCampaignBySlug(slug))!
    const first = await dmData.campaigns.updateCampaign(campaignId, { name: 'H4 renamed', branding: { accent_color: '#112233', tagline: 'Hola', mystery: 'kept' } }, before.updated_at)
    expect(first.name).toBe('H4 renamed')
    expect(first.slug).toBe(slug)
    expect(first.updated_at).not.toBe(before.updated_at)
    // unknown keys survive, a null removes a key
    const second = await dmData.campaigns.updateCampaign(campaignId, { branding: { tagline: null } }, first.updated_at)
    expect(second.branding).toEqual({ accent_color: '#112233', mystery: 'kept' })
    // a stale base conflicts and writes nothing
    await expect(dmData.campaigns.updateCampaign(campaignId, { name: 'stale' }, first.updated_at)).rejects.toMatchObject({ kind: 'conflict' })
    expect((await dmData.campaigns.getCampaignBySlug(slug))?.name).toBe('H4 renamed')

    // RLS: a member who is not the DM gets a permission error, a stranger does not even see the row
    await expect(playerData.campaigns.updateCampaign(campaignId, { name: 'player edit' })).rejects.toMatchObject({ kind: 'permission' })
    await expect(strangerData.campaigns.updateCampaign(campaignId, { name: 'stranger edit' })).rejects.toMatchObject({ kind: 'not_found' })
    expect((await dmData.campaigns.getCampaignBySlug(slug))?.name).toBe('H4 renamed')
    // restore the name for the tests that follow
    await dmData.campaigns.updateCampaign(campaignId, { name: 'H4 integration' })
  })

  it('every select list executes against the real schema, and list()/get() work on every entity table (as DM)', async () => {
    for (const { name, table, columns } of COLUMN_LIST_ENTRIES) {
      const { error } = await dm.client
        .from(table as never)
        .select(columns.join(', '))
        .limit(1)
      expect(error, `${name} (${table}): ${error?.message}`).toBeNull()
    }
    for (const table of ENTITY_TABLES) {
      const repo = dmData.entity(table)
      const rows = await repo.list(campaignId)
      expect(Array.isArray(rows), table).toBe(true)
      if (rows.length > 0) expect(await repo.get(rows[0].id), table).toMatchObject({ id: rows[0].id })
      expect(await repo.get(MISSING_ID), table).toBeNull()
    }
  })

  it('realtime delivers INSERT, UPDATE (merged fields) and DELETE to a subscribed player, never visible_to', async () => {
    const source = entitySource(playerData.entity('pnjs'))
    const upserts: { item: FlatEntity; event: string }[] = []
    const deletes: string[] = []
    let notify: () => void = () => undefined
    // resolves once `predicate` holds over what has been received so far
    const until = (predicate: () => boolean, ms?: number) =>
      waitFor<void>((done) => {
        notify = () => predicate() && done()
        notify()
      }, ms)

    let unsubscribe: () => void = () => undefined
    const live = waitFor<void>((done) => {
      unsubscribe = subscribeToTable(player.client, source, campaignId, {
        onUpsert: (item, event) => {
          upserts.push({ item, event })
          notify()
        },
        onDelete: (key) => {
          deletes.push(key)
          notify()
        },
        onStatus: (status) => status === 'live' && done(),
      })
    })
    try {
      await live // nothing is done before the channel is SUBSCRIBED
      const pnjs = dmData.entity('pnjs')

      // SUBSCRIBED can precede the server-side change subscription being active, so the first event
      // may be missed. Probe until one is delivered, then run the real assertions deterministically.
      for (let attempt = 0; attempt < 5 && upserts.length === 0; attempt++) {
        await pnjs.create(campaignId, { nombre: `Sonda ${attempt}` })
        await until(() => upserts.length > 0, 2000).catch(() => undefined)
      }
      expect(upserts.length, 'realtime never delivered a probe event').toBeGreaterThan(0)

      const created = await pnjs.create(campaignId, { nombre: 'Tiempo real', rol: 'bardo', extra: 'k' })
      await until(() => upserts.some((u) => u.item.id === created.id))
      const inserted = upserts.find((u) => u.item.id === created.id)!
      expect(inserted.event).toBe('INSERT')
      expect(inserted.item).toMatchObject({ nombre: 'Tiempo real', rol: 'bardo', campaign_id: campaignId })

      await pnjs.update(created.id, { rol: 'trovador' })
      await until(() => upserts.some((u) => u.event === 'UPDATE' && u.item.id === created.id))
      const updated = upserts.find((u) => u.event === 'UPDATE' && u.item.id === created.id)!
      expect(updated.item).toMatchObject({ nombre: 'Tiempo real', rol: 'trovador', extra: 'k' })

      // rows the player may not see are never delivered; a later visible row proves ordering
      const secret = await pnjs.create(campaignId, { nombre: 'Solo DM', estado: 'borrador' })
      const marker = await pnjs.create(campaignId, { nombre: 'Marcador' })
      await until(() => upserts.some((u) => u.item.id === marker.id))
      expect(upserts.some((u) => u.item.id === secret.id)).toBe(false)
      for (const { item } of upserts) expect(item).not.toHaveProperty('visible_to')

      await pnjs.remove(created.id)
      await until(() => deletes.includes(String(created.id)))
    } finally {
      unsubscribe()
    }
  })
})
