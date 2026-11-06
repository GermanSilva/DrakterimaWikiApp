import { describe, expect, it } from 'vitest'
import { SYSTEM_COLUMNS, join } from './columns'
import { createSystemRepository } from './systemRepository'
import { createFakeClient, opsNamed } from './testing/fakeClient'

const row = (over: object = {}) => ({
  id: 's1', name: 'Mi sistema', kind: 'homebrew', campaign_id: 'c1', owner_id: 'u1', branched_from: null, archived_at: null, created_at: '', updated_at: '',
  document: { version: 1 }, ...over,
})

describe('system repository', () => {
  it('never selects the document in a list and never uses a wildcard', () => {
    expect(SYSTEM_COLUMNS).not.toContain('document')
    expect(join(SYSTEM_COLUMNS)).not.toContain('*')
  })

  it('listAvailableBases skips archived systems, selects explicit columns and puts origins first', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: [row({ id: 'a', kind: 'frozen' }), row({ id: 'b', kind: 'origin' }), row({ id: 'c', kind: 'homebrew' })] }, { data: [] })
    const out = await createSystemRepository(fake.db).listAvailableBases()
    expect(fake.calls[0].name).toBe('systems')
    expect(opsNamed(fake.calls[0], 'select')).toEqual([[join(SYSTEM_COLUMNS)]])
    expect(opsNamed(fake.calls[0], 'is')).toEqual([['archived_at', null]])
    expect(out.map((s) => s.id)).toEqual(['b', 'c', 'a'])
  })

  it('branchSystem calls the RPC and returns the row without its document', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: row() })
    const out = await createSystemRepository(fake.db).branchSystem('c1', 'Mi sistema')
    expect(fake.calls[0]).toMatchObject({ kind: 'rpc', name: 'branch_system', args: { p_campaign_id: 'c1', p_name: 'Mi sistema' } })
    expect(out).toMatchObject({ id: 's1', kind: 'homebrew' })
    expect(out).not.toHaveProperty('document')
  })

  it('maps the other RPCs to their arguments, sending the optional name only when given', async () => {
    const fake = createFakeClient()
    const repo = createSystemRepository(fake.db)
    fake.enqueue({ data: row() }, { data: row() }, { data: row() }, { data: row() }, { data: row() })
    await repo.renameSystem('s1', 'Nuevo')
    await repo.createOriginFromCampaign('c1', 'Origen')
    await repo.promoteSystem('s1')
    await repo.promoteSystem('s1', 'Oficial')
    await repo.archiveSystem('s1', true)
    expect(fake.calls.map((c) => [c.name, c.args])).toEqual([
      ['rename_system', { p_system_id: 's1', p_name: 'Nuevo' }],
      ['create_origin_from_campaign', { p_campaign_id: 'c1', p_name: 'Origen' }],
      ['promote_system', { p_system_id: 's1' }],
      ['promote_system', { p_system_id: 's1', p_name: 'Oficial' }],
      ['archive_system', { p_system_id: 's1', p_archived: true }],
    ])
  })

  it('keeps the typed reasons of the RPCs', async () => {
    const fake = createFakeClient()
    const repo = createSystemRepository(fake.db)
    fake.enqueue(
      { error: { message: 'dm_only', code: '42501' } },
      { error: { message: 'hub_owner_only', code: '42501' } },
      { error: { message: 'system_owner_only', code: '42501' } },
      { error: { message: 'invalid_system_kind', code: 'P0001' } },
      { error: { message: 'systems_limit_reached', code: 'P0001' } },
    )
    await expect(repo.branchSystem('c1', 'x')).rejects.toMatchObject({ kind: 'permission', reason: 'dm_only' })
    await expect(repo.archiveSystem('s1', true)).rejects.toMatchObject({ kind: 'permission', reason: 'hub_owner_only' })
    await expect(repo.renameSystem('s1', 'x')).rejects.toMatchObject({ kind: 'permission', reason: 'system_owner_only' })
    await expect(repo.promoteSystem('s1')).rejects.toMatchObject({ kind: 'business', reason: 'invalid_system_kind' })
    await expect(repo.branchSystem('c1', 'x')).rejects.toMatchObject({ kind: 'business', reason: 'systems_limit_reached' })
  })

  it('getSystemActions returns the catalogue, or [] when the system is not visible or has none', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: [{ actions: [{ table_key: 'hechizos', name: 'Luz' }] }] }, { data: [] }, { data: [{ actions: null }] })
    const repo = createSystemRepository(fake.db)
    expect(await repo.getSystemActions('s1')).toEqual([{ table_key: 'hechizos', name: 'Luz' }])
    expect(opsNamed(fake.calls[0], 'select')).toEqual([['actions']])
    expect(await repo.getSystemActions('s2')).toEqual([])
    expect(await repo.getSystemActions('s3')).toEqual([])
  })

  it('the list columns never carry the catalogue (it can be 1 MB)', () => {
    expect(SYSTEM_COLUMNS).not.toContain('actions')
  })

  it('getSystemDocument returns the document, or null when the system is not visible', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: [{ document: { version: 1 } }] }, { data: [] })
    const repo = createSystemRepository(fake.db)
    expect(await repo.getSystemDocument('s1')).toEqual({ version: 1 })
    expect(await repo.getSystemDocument('s2')).toBeNull()
  })
})
