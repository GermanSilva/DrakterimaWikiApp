import { describe, expect, it } from 'vitest'
import { createActionCollectionRepository } from './actionCollectionRepository'
import { ACTION_COLUMNS, ACTION_LINK_COLUMNS, join } from './columns'
import { ConflictError, DataError } from './errors'
import { createFakeClient, opsNamed } from './testing/fakeClient'

const CAMPAIGN = 'c0000000-0000-4000-8000-000000000001'
const action = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  campaign_id: CAMPAIGN,
  table_key: 'hechizos',
  category: 'truco',
  name: `Entry ${id}`,
  description: '',
  extras: {},
  private_to_pj: null,
  function: null,
  created_by: null,
  created_at: '2026-11-05T10:00:00Z',
  updated_at: '2026-11-05T10:00:00Z',
  ...extra,
})
const link = (pj: number, act: number, state: Record<string, unknown> = {}, updated = '2026-11-05T10:00:00Z') => ({
  pj_id: pj,
  action_id: act,
  campaign_id: CAMPAIGN,
  state,
  created_at: '2026-11-05T10:00:00Z',
  updated_at: updated,
})

describe('action collection repository: reads', () => {
  it('lists the collection with explicit columns, in a stable order, paging until an empty page', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: [action(1), action(2)] }, { data: [] })
    const rows = await createActionCollectionRepository(fake.db).listActions(CAMPAIGN)
    expect(rows.map((r) => r.id)).toEqual([1, 2])
    const call = fake.calls[0]
    expect(call).toMatchObject({ kind: 'from', name: 'campaign_actions' })
    expect(opsNamed(call, 'select')[0]).toEqual([join(ACTION_COLUMNS)])
    expect(opsNamed(call, 'eq')).toEqual([['campaign_id', CAMPAIGN]])
    expect(opsNamed(call, 'order')).toEqual([['id', { ascending: true }]])
    fake.assertDrained()
  })

  it('lists the links of a campaign (the DM) with explicit columns', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: [link(1, 1)] }, { data: [] })
    const rows = await createActionCollectionRepository(fake.db).listLinks(CAMPAIGN)
    expect(rows).toHaveLength(1)
    expect(fake.calls[0]).toMatchObject({ kind: 'from', name: 'pj_action_links' })
    expect(opsNamed(fake.calls[0], 'select')[0]).toEqual([join(ACTION_LINK_COLUMNS)])
    expect(opsNamed(fake.calls[0], 'eq')).toEqual([['campaign_id', CAMPAIGN]])
  })

  it('lists the actions of one character: its links, then the linked entries, joined and sorted by table, category and name', async () => {
    const fake = createFakeClient()
    fake.enqueue(
      { data: [link(7, 3, { usos: 1 }), link(7, 1)] },
      { data: [] },
      { data: [action(3, { name: 'Zeta' }), action(1, { name: 'Alfa' })] },
      { data: [] },
    )
    const rows = await createActionCollectionRepository(fake.db).listLinkedActions(7)
    expect(rows.map((r) => [r.action.id, r.link.state])).toEqual([[1, {}], [3, { usos: 1 }]])
    expect(opsNamed(fake.calls[0], 'eq')).toEqual([['pj_id', 7]])
    expect(fake.calls[2]).toMatchObject({ kind: 'from', name: 'campaign_actions' })
    expect(opsNamed(fake.calls[2], 'in')).toEqual([['id', [3, 1]]])
    expect(opsNamed(fake.calls[2], 'select')[0]).toEqual([join(ACTION_COLUMNS)])
    fake.assertDrained()
  })

  it('makes no second request for a character without links, and skips a link whose entry cannot be read', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: [] })
    expect(await createActionCollectionRepository(fake.db).listLinkedActions(7)).toEqual([])
    expect(fake.calls).toHaveLength(1)

    const fake2 = createFakeClient()
    fake2.enqueue({ data: [link(7, 1), link(7, 2)] }, { data: [] }, { data: [action(1)] }, { data: [] })
    const rows = await createActionCollectionRepository(fake2.db).listLinkedActions(7)
    expect(rows.map((r) => r.action.id)).toEqual([1])
  })

  it('raises the typed error of a failed read', async () => {
    const fake = createFakeClient()
    fake.enqueue({ error: { message: 'permission denied', code: '42501' } })
    await expect(createActionCollectionRepository(fake.db).listActions(CAMPAIGN)).rejects.toMatchObject({ kind: 'permission' })
  })
})

describe('action collection repository: entries', () => {
  it('creates an entry with the campaign and only the allowed columns, defaulting the optional ones', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: action(5) })
    const created = await createActionCollectionRepository(fake.db).createAction(CAMPAIGN, { table_key: 'hechizos', category: 'truco', name: 'Luz' })
    expect(created.id).toBe(5)
    const call = fake.calls[0]
    expect(call).toMatchObject({ kind: 'from', name: 'campaign_actions' })
    expect(opsNamed(call, 'insert')[0]).toEqual([
      { campaign_id: CAMPAIGN, table_key: 'hechizos', category: 'truco', name: 'Luz', description: '', extras: {}, private_to_pj: null, function: null },
    ])
    expect(opsNamed(call, 'select')[0]).toEqual([join(ACTION_COLUMNS)])
  })

  it('sends description, extras, private character and function when given', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: action(6) })
    await createActionCollectionRepository(fake.db).createAction(CAMPAIGN, {
      table_key: 'hechizos', category: 'truco', name: 'Luz', description: 'Una luz.', extras: { coste: 1 }, private_to_pj: 9, function: { steps: [] },
    })
    expect(opsNamed(fake.calls[0], 'insert')[0]).toEqual([
      { campaign_id: CAMPAIGN, table_key: 'hechizos', category: 'truco', name: 'Luz', description: 'Una luz.', extras: { coste: 1 }, private_to_pj: 9, function: { steps: [] } },
    ])
  })

  it('rejects a blank name or a missing table before any request', async () => {
    const fake = createFakeClient()
    const repo = createActionCollectionRepository(fake.db)
    await expect(repo.createAction(CAMPAIGN, { table_key: 'hechizos', category: '', name: '   ' })).rejects.toMatchObject({ kind: 'validation' })
    await expect(repo.createAction(CAMPAIGN, { table_key: '', category: '', name: 'Luz' })).rejects.toMatchObject({ kind: 'validation' })
    expect(fake.calls).toHaveLength(0)
  })

  it('trims the name', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: action(5) })
    await createActionCollectionRepository(fake.db).createAction(CAMPAIGN, { table_key: 'hechizos', category: 'truco', name: '  Luz  ' })
    expect((opsNamed(fake.calls[0], 'insert')[0][0] as { name: string }).name).toBe('Luz')
  })

  it('maps the dedupe violation to conflict and the server reasons to typed validation errors', async () => {
    const fake = createFakeClient()
    const repo = createActionCollectionRepository(fake.db)
    fake.enqueue({ error: { message: 'duplicate key value violates unique constraint "campaign_actions_dedupe_idx"', code: '23505' } })
    await expect(repo.createAction(CAMPAIGN, { table_key: 'hechizos', category: 'truco', name: 'Luz' })).rejects.toMatchObject({ kind: 'conflict' })
    fake.enqueue({ error: { message: 'invalid_action_category', code: '23514' } })
    await expect(repo.createAction(CAMPAIGN, { table_key: 'hechizos', category: 'x', name: 'Luz' })).rejects.toMatchObject({ kind: 'validation', reason: 'invalid_action_category' })
    fake.enqueue({ error: { message: 'action_not_in_sheet', code: '23514' } })
    await expect(repo.createAction(CAMPAIGN, { table_key: 'nope', category: '', name: 'Luz' })).rejects.toMatchObject({ reason: 'action_not_in_sheet' })
  })

  it('reports a write the caller cannot read back as written_not_visible', async () => {
    const fake = createFakeClient()
    fake.enqueue({ error: { message: 'no rows', code: 'PGRST116' } })
    await expect(createActionCollectionRepository(fake.db).createAction(CAMPAIGN, { table_key: 'h', category: '', name: 'Luz' })).rejects.toMatchObject({ kind: 'written_not_visible' })
  })

  it('updates only the provided columns', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: action(5, { description: 'Nueva' }) })
    const row = await createActionCollectionRepository(fake.db).updateAction(5, { description: 'Nueva', function: undefined })
    expect(row.description).toBe('Nueva')
    expect(opsNamed(fake.calls[0], 'update')[0]).toEqual([{ description: 'Nueva' }])
    expect(opsNamed(fake.calls[0], 'eq')).toEqual([['id', 5]])
  })

  it('clears the function with null and the private character with null', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: action(5) })
    await createActionCollectionRepository(fake.db).updateAction(5, { function: null, private_to_pj: null })
    expect(opsNamed(fake.calls[0], 'update')[0]).toEqual([{ function: null, private_to_pj: null }])
  })

  it('rejects keys the client may not write and an empty patch, without a request', async () => {
    const fake = createFakeClient()
    const repo = createActionCollectionRepository(fake.db)
    await expect(repo.updateAction(5, { campaign_id: 'x' } as never)).rejects.toMatchObject({ kind: 'validation' })
    await expect(repo.updateAction(5, { id: 9 } as never)).rejects.toMatchObject({ kind: 'validation' })
    await expect(repo.updateAction(5, {})).rejects.toMatchObject({ kind: 'validation' })
    await expect(repo.updateAction(5, { name: ' ' })).rejects.toMatchObject({ kind: 'validation' })
    expect(fake.calls).toHaveLength(0)
  })

  it('explains a zero-row update: permission when the row is readable, not_found otherwise', async () => {
    const fake = createFakeClient()
    const repo = createActionCollectionRepository(fake.db)
    fake.enqueue({ data: null }, { data: [{ id: 5 }] })
    await expect(repo.updateAction(5, { name: 'X' })).rejects.toMatchObject({ kind: 'permission' })
    fake.enqueue({ data: null }, { data: [] })
    await expect(repo.updateAction(5, { name: 'X' })).rejects.toMatchObject({ kind: 'not_found' })
  })

  it('removes an entry and explains a zero-row delete', async () => {
    const fake = createFakeClient()
    const repo = createActionCollectionRepository(fake.db)
    fake.enqueue({ data: [{ id: 5 }] })
    await repo.removeAction(5)
    expect(fake.calls[0]).toMatchObject({ kind: 'from', name: 'campaign_actions' })
    expect(opsNamed(fake.calls[0], 'delete')).toHaveLength(1)
    expect(opsNamed(fake.calls[0], 'eq')).toEqual([['id', 5]])
    fake.enqueue({ data: [] }, { data: [{ id: 5 }] })
    await expect(repo.removeAction(5)).rejects.toMatchObject({ kind: 'permission' })
    fake.enqueue({ data: [] }, { data: [] })
    await expect(repo.removeAction(5)).rejects.toMatchObject({ kind: 'not_found' })
  })
})

describe('action collection repository: links', () => {
  it('links an entry to a character with an empty state by default', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: link(7, 5) })
    const row = await createActionCollectionRepository(fake.db).link(CAMPAIGN, 7, 5)
    expect(row).toMatchObject({ pj_id: 7, action_id: 5 })
    expect(fake.calls[0]).toMatchObject({ kind: 'from', name: 'pj_action_links' })
    expect(opsNamed(fake.calls[0], 'insert')[0]).toEqual([{ campaign_id: CAMPAIGN, pj_id: 7, action_id: 5, state: {} }])
    expect(opsNamed(fake.calls[0], 'select')[0]).toEqual([join(ACTION_LINK_COLUMNS)])
  })

  it('maps a private-entry refusal and a repeated link', async () => {
    const fake = createFakeClient()
    const repo = createActionCollectionRepository(fake.db)
    fake.enqueue({ error: { message: 'action_private_to_other_character', code: '23514' } })
    await expect(repo.link(CAMPAIGN, 7, 5)).rejects.toMatchObject({ kind: 'validation', reason: 'action_private_to_other_character' })
    fake.enqueue({ error: { message: 'duplicate key value violates unique constraint', code: '23505' } })
    await expect(repo.link(CAMPAIGN, 7, 5)).rejects.toMatchObject({ kind: 'conflict' })
    fake.enqueue({ error: { message: 'insert or update violates foreign key constraint', code: '23503' } })
    await expect(repo.link(CAMPAIGN, 7, 5)).rejects.toMatchObject({ kind: 'validation' })
  })

  it('unlinks and explains a zero-row delete', async () => {
    const fake = createFakeClient()
    const repo = createActionCollectionRepository(fake.db)
    fake.enqueue({ data: [{ pj_id: 7 }] })
    await repo.unlink(7, 5)
    expect(opsNamed(fake.calls[0], 'eq')).toEqual([['pj_id', 7], ['action_id', 5]])
    fake.enqueue({ data: [] }, { data: [{ pj_id: 7 }] })
    await expect(repo.unlink(7, 5)).rejects.toMatchObject({ kind: 'permission' })
    fake.enqueue({ data: [] }, { data: [] })
    await expect(repo.unlink(7, 5)).rejects.toMatchObject({ kind: 'not_found' })
  })
})

describe('action collection repository: link state', () => {
  it('merges the patch onto the current server state and writes it guarded by updated_at', async () => {
    const fake = createFakeClient()
    fake.enqueue(
      { data: { updated_at: 'v1', state: { usos: 1, nota: 'a' } } },
      { data: link(7, 5, { usos: 2, nota: 'a' }, 'v2') },
    )
    const row = await createActionCollectionRepository(fake.db).updateLinkState(7, 5, { usos: 2 })
    expect(row.state).toEqual({ usos: 2, nota: 'a' })
    const write = fake.calls[1]
    expect(opsNamed(write, 'update')[0]).toEqual([{ state: { usos: 2, nota: 'a' } }])
    expect(opsNamed(write, 'eq')).toEqual([['pj_id', 7], ['action_id', 5], ['updated_at', 'v1']])
    expect(opsNamed(write, 'select')[0]).toEqual([join(ACTION_LINK_COLUMNS)])
  })

  it('ignores undefined keys and keeps null (clears the value)', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: { updated_at: 'v1', state: { usos: 1 } } }, { data: link(7, 5, { usos: null }, 'v2') })
    await createActionCollectionRepository(fake.db).updateLinkState(7, 5, { usos: null, nota: undefined })
    expect(opsNamed(fake.calls[1], 'update')[0]).toEqual([{ state: { usos: null } }])
  })

  it('throws ConflictError when the caller base is stale', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: { updated_at: 'v2', state: {} } })
    await expect(createActionCollectionRepository(fake.db).updateLinkState(7, 5, { usos: 1 }, { base: { updated_at: 'v1' } })).rejects.toBeInstanceOf(ConflictError)
    expect(fake.calls).toHaveLength(1)
  })

  it('re-reads and re-merges when the row changed under a call without base', async () => {
    const fake = createFakeClient()
    fake.enqueue(
      { data: { updated_at: 'v1', state: { a: 1 } } },
      { data: null }, // guarded write found nothing
      { data: { updated_at: 'v2' } }, // version moved: a concurrent edit
      { data: { updated_at: 'v2', state: { a: 1, b: 2 } } },
      { data: link(7, 5, { a: 1, b: 2, c: 3 }, 'v3') },
    )
    const row = await createActionCollectionRepository(fake.db).updateLinkState(7, 5, { c: 3 })
    expect(row.state).toEqual({ a: 1, b: 2, c: 3 })
    expect(opsNamed(fake.calls[4], 'update')[0]).toEqual([{ state: { a: 1, b: 2, c: 3 } }])
    fake.assertDrained()
  })

  it('reports a refused write (version unchanged) as permission and a missing link as not_found', async () => {
    const fake = createFakeClient()
    const repo = createActionCollectionRepository(fake.db)
    fake.enqueue({ data: { updated_at: 'v1', state: {} } }, { data: null }, { data: { updated_at: 'v1' } })
    await expect(repo.updateLinkState(7, 5, { usos: 1 })).rejects.toMatchObject({ kind: 'permission' })
    fake.enqueue({ data: null })
    await expect(repo.updateLinkState(7, 5, { usos: 1 })).rejects.toMatchObject({ kind: 'not_found' })
  })

  it('surfaces the server reasons of a refused state (invalid_link_state, link_state_not_writable)', async () => {
    const fake = createFakeClient()
    const repo = createActionCollectionRepository(fake.db)
    fake.enqueue({ data: { updated_at: 'v1', state: {} } }, { error: { message: 'invalid_link_state', code: '23514' } })
    await expect(repo.updateLinkState(7, 5, { usos: 'x' })).rejects.toMatchObject({ kind: 'validation', reason: 'invalid_link_state' })
    fake.enqueue({ data: { updated_at: 'v1', state: {} } }, { error: { message: 'link_state_not_writable', code: '42501' } })
    const err = await repo.updateLinkState(7, 5, { usada: true }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DataError)
    expect(err).toMatchObject({ kind: 'permission', reason: 'link_state_not_writable' })
  })

  it('rejects a patch that is not a plain object or is empty, without a request', async () => {
    const fake = createFakeClient()
    const repo = createActionCollectionRepository(fake.db)
    await expect(repo.updateLinkState(7, 5, [] as never)).rejects.toMatchObject({ kind: 'validation' })
    await expect(repo.updateLinkState(7, 5, {})).rejects.toMatchObject({ kind: 'validation' })
    await expect(repo.updateLinkState(7, 5, { a: undefined })).rejects.toMatchObject({ kind: 'validation' })
    expect(fake.calls).toHaveLength(0)
  })
})

describe('action collection repository: many links', () => {
  it('reads the entries of a character in chunks of 200 ids', async () => {
    const fake = createFakeClient()
    const links = Array.from({ length: 450 }, (_, i) => link(7, i + 1))
    fake.enqueue({ data: links }, { data: [] })
    for (const size of [200, 200, 50]) fake.enqueue({ data: Array.from({ length: size }, (_, i) => action(i + 1)) }, { data: [] })
    const rows = await createActionCollectionRepository(fake.db).listLinkedActions(7)
    expect(rows.length).toBeGreaterThan(0)
    const inCalls = fake.calls.filter((c) => c.name === 'campaign_actions').filter((_, i) => i % 2 === 0).map((c) => (opsNamed(c, 'in')[0][1] as number[]).length)
    expect(inCalls).toEqual([200, 200, 50])
    fake.assertDrained()
  })
})
