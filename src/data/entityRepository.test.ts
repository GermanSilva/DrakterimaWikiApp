import { describe, expect, it } from 'vitest'
import { ENTITY_SELECT } from './columns'
import { createEntityRepository } from './entityRepository'
import { ConflictError, DataError } from './errors'
import { PAGE_SIZE } from './pagedList'
import { createFakeClient, opsNamed } from './testing/fakeClient'

const row = (over: Record<string, unknown> = {}) => ({
  id: 7,
  campaign_id: 'c1',
  nombre: 'Aldric',
  region: '',
  relacion: 'neutral',
  imagen_url: '',
  estado: 'publicado',
  created_at: 't0',
  updated_at: 'v1',
  created_by: null,
  data: { rol: 'herrero', descripcion: 'd' },
  ...over,
})

const version = (updated_at: string, extra: Record<string, unknown> = {}) => ({ data: { updated_at, ...extra } })

function setup(table: 'pnjs' | 'pjs' | 'map_points' = 'pnjs') {
  const fake = createFakeClient()
  return { fake, repo: createEntityRepository(fake.db, table) }
}

describe('entity repository', () => {
  it('list: explicit select, campaign filter, stable order, paged with range, mapped to flat entities', async () => {
    const { fake, repo } = setup()
    fake.enqueue({ data: [row()] })
    const items = await repo.list('c1')
    const call = fake.calls[0]
    expect(call).toMatchObject({ kind: 'from', name: 'pnjs' })
    expect(opsNamed(call, 'select')).toEqual([[ENTITY_SELECT.pnjs]])
    expect(opsNamed(call, 'eq')).toEqual([['campaign_id', 'c1']])
    expect(opsNamed(call, 'order')[0][0]).toBe('id')
    expect(opsNamed(call, 'range')).toEqual([[0, PAGE_SIZE - 1]])
    expect(items[0]).toMatchObject({ id: 7, nombre: 'Aldric', rol: 'herrero', campaign_id: 'c1' })
  })

  it('list: keeps paging until a short page (no silent truncation at 1000)', async () => {
    const { fake, repo } = setup()
    const full = Array.from({ length: PAGE_SIZE }, (_, i) => row({ id: i + 1 }))
    fake.enqueue({ data: full }, { data: [row({ id: PAGE_SIZE + 1 })] })
    const items = await repo.list('c1')
    expect(items).toHaveLength(PAGE_SIZE + 1)
    expect(fake.calls.map((c) => opsNamed(c, 'range')[0])).toEqual([[0, PAGE_SIZE - 1], [PAGE_SIZE, 2 * PAGE_SIZE - 1]])
  })

  it('get: returns null when the row is not visible', async () => {
    const { fake, repo } = setup()
    fake.enqueue({ data: null })
    expect(await repo.get(3)).toBeNull()
    expect(opsNamed(fake.calls[0], 'maybeSingle')).toHaveLength(1)
  })

  it('create: sends promoted columns + data + campaign_id, never id / visible_to', async () => {
    const { fake, repo } = setup()
    fake.enqueue({ data: row() })
    await repo.create('c1', { id: 99, nombre: 'Aldric', rol: 'herrero', visible_to: [1] })
    const call = fake.calls[0]
    expect(opsNamed(call, 'insert')[0][0]).toEqual({ nombre: 'Aldric', data: { rol: 'herrero' }, campaign_id: 'c1' })
    expect(opsNamed(call, 'select')).toEqual([[ENTITY_SELECT.pnjs]])
  })

  it('create / update reject DM-private fields instead of dropping them', async () => {
    const { fake, repo } = setup()
    await expect(repo.create('c1', { nombre: 'x', secreto: 's' })).rejects.toMatchObject({ kind: 'validation' })
    await expect(repo.update(1, { notas: 'n' })).rejects.toMatchObject({ kind: 'validation' })
    expect(fake.calls).toHaveLength(0)
  })

  it('create: a write that returns no row is written_not_visible, not not_found', async () => {
    const { fake, repo } = setup()
    fake.enqueue({ error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } })
    await expect(repo.create('c1', { nombre: 'x' })).rejects.toMatchObject({ kind: 'written_not_visible' })
  })

  it('create: coerces empty strings to null for nullable promoted columns only', async () => {
    const { fake, repo } = setup('map_points')
    fake.enqueue({ data: row() })
    await repo.create('c1', { nombre: '', link_type: '', link_id: '', map_id: 3 })
    expect(opsNamed(fake.calls[0], 'insert')[0][0]).toMatchObject({ nombre: '', link_type: null, link_id: null, map_id: 3 })
  })

  it('update with only plain columns: sends just those, no data, no version guard', async () => {
    const { fake, repo } = setup()
    fake.enqueue({ data: row({ nombre: 'Nuevo' }) })
    const out = await repo.update(7, { nombre: 'Nuevo' })
    const call = fake.calls[0]
    expect(opsNamed(call, 'update')).toEqual([[{ nombre: 'Nuevo' }]])
    expect(opsNamed(call, 'eq')).toEqual([['id', 7]])
    expect(opsNamed(call, 'maybeSingle')).toHaveLength(1)
    expect(out.nombre).toBe('Nuevo')
  })

  it('update touching data: reads the server data, merges only patched keys, guards with updated_at', async () => {
    const { fake, repo } = setup()
    fake.enqueue(version('v1', { data: { rol: 'herrero', descripcion: 'd' } }))
    fake.enqueue({ data: row({ updated_at: 'v2', data: { rol: 'capitan', descripcion: 'd' } }) })
    const out = await repo.update(7, { rol: 'capitan' })
    expect(opsNamed(fake.calls[0], 'select')).toEqual([['updated_at, data']])
    const write = fake.calls[1]
    expect(opsNamed(write, 'update')).toEqual([[{ data: { rol: 'capitan', descripcion: 'd' } }]])
    expect(opsNamed(write, 'eq')).toEqual([['id', 7], ['updated_at', 'v1']])
    expect(opsNamed(write, 'maybeSingle')).toHaveLength(1)
    expect(opsNamed(write, 'select')).toEqual([[ENTITY_SELECT.pnjs]])
    expect(out).toMatchObject({ rol: 'capitan', descripcion: 'd' })
  })

  it('update with a base: only its updated_at is used; its (possibly client-only) keys never reach data', async () => {
    const { fake, repo } = setup()
    fake.enqueue(version('v1', { data: { rol: 'r' } }))
    fake.enqueue({ data: row({ updated_at: 'v2' }) })
    await repo.update(7, { rol: 'x' }, { base: { updated_at: 'v1', clientOnly: 'ui state', rol: 'r', extra: 1 } })
    expect(opsNamed(fake.calls[1], 'update')).toEqual([[{ data: { rol: 'x' } }]])
    expect(opsNamed(fake.calls[1], 'eq')).toContainEqual(['updated_at', 'v1'])
  })

  it('update with a stale base throws ConflictError before writing', async () => {
    const { fake, repo } = setup()
    fake.enqueue(version('v9', { data: {} }))
    await expect(repo.update(7, { rol: 'x' }, { base: { updated_at: 'v1' } })).rejects.toBeInstanceOf(ConflictError)
    expect(fake.calls).toHaveLength(1) // no write was attempted
  })

  it('update with a base that loses the race at write time throws ConflictError', async () => {
    const { fake, repo } = setup()
    fake.enqueue(version('v1', { data: {} }), { data: null }, version('v2'))
    await expect(repo.update(7, { rol: 'x' }, { base: { updated_at: 'v1' } })).rejects.toBeInstanceOf(ConflictError)
  })

  it('update without base re-merges onto fresh data after a concurrent change', async () => {
    const { fake, repo } = setup()
    fake.enqueue(version('v1', { data: { a: 1 } })) // read
    fake.enqueue({ data: null }) // guarded write lost the race
    fake.enqueue(version('v2')) // version check after the miss: changed
    fake.enqueue(version('v2', { data: { a: 1, b: 2 } })) // retry re-reads the fresh data
    fake.enqueue({ data: row({ updated_at: 'v3' }) })
    await repo.update(7, { c: 3 })
    const writes = fake.calls.filter((c) => opsNamed(c, 'update').length > 0)
    expect(writes).toHaveLength(2)
    expect(opsNamed(writes[1], 'update')[0][0]).toEqual({ data: { a: 1, b: 2, c: 3 } })
    expect(opsNamed(writes[1], 'eq')).toContainEqual(['updated_at', 'v2'])
  })

  it('update that matches no row because of RLS is a permission error, not a conflict', async () => {
    const { fake, repo } = setup()
    fake.enqueue(version('v1', { data: {} }), { data: null }, version('v1'))
    await expect(repo.update(7, { rol: 'x' })).rejects.toMatchObject({ kind: 'permission' })
  })

  it('update of a missing row is not_found', async () => {
    const { fake, repo } = setup()
    fake.enqueue({ data: null })
    await expect(repo.update(7, { rol: 'x' })).rejects.toMatchObject({ kind: 'not_found' })
  })

  it('whole-object jsonb columns (pjs.monedas) are merged onto the server value under the version guard', async () => {
    const { fake, repo } = setup('pjs')
    fake.enqueue(version('v1', { monedas: { gp: 5, pp: 1 } }))
    fake.enqueue({ data: row({ updated_at: 'v2' }) })
    await repo.update(7, { monedas: { gp: 9 } })
    expect(opsNamed(fake.calls[0], 'select')).toEqual([['updated_at, monedas']])
    expect(opsNamed(fake.calls[1], 'update')).toEqual([[{ monedas: { gp: 9, pp: 1 } }]])
    expect(opsNamed(fake.calls[1], 'eq')).toContainEqual(['updated_at', 'v1'])
  })

  it('zero-row column update: permission when the row exists, not_found when it does not', async () => {
    const { fake, repo } = setup()
    fake.enqueue({ data: null }, { data: { id: 7 } })
    await expect(repo.update(7, { nombre: 'x' })).rejects.toMatchObject({ kind: 'permission' })
    fake.enqueue({ data: null }, { data: null })
    await expect(repo.update(7, { nombre: 'x' })).rejects.toMatchObject({ kind: 'not_found' })
  })

  it('remove: deletes by id; zero rows is permission or not_found depending on existence', async () => {
    const { fake, repo } = setup()
    fake.enqueue({ data: [{ id: 7 }] })
    await repo.remove(7)
    expect(opsNamed(fake.calls[0], 'delete')).toHaveLength(1)
    fake.enqueue({ data: [] }, { data: { id: 8 } })
    await expect(repo.remove(8)).rejects.toMatchObject({ kind: 'permission' })
    fake.enqueue({ data: [] }, { data: null })
    await expect(repo.remove(9)).rejects.toMatchObject({ kind: 'not_found' })
  })

  it('surfaces database errors as typed DataError (never swallowed)', async () => {
    const { fake, repo } = setup()
    fake.enqueue({ error: { message: 'permission denied for table pnjs', code: '42501' } })
    await expect(repo.list('c1')).rejects.toSatisfy(
      (e: unknown) => e instanceof DataError && e.kind === 'permission' && e.code === '42501',
    )
    fake.enqueue({ error: { message: 'boom', code: '23514' } })
    await expect(repo.create('c1', {})).rejects.toMatchObject({ kind: 'validation' })
  })
})
