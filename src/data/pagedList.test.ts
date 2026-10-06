import { describe, expect, it } from 'vitest'
import { pagedList } from './pagedList'
import { createFakeClient, opsNamed } from './testing/fakeClient'
import { throwZeroRows } from './zeroRows'

function query(fake: ReturnType<typeof createFakeClient>) {
  return () => (fake.db as unknown as { from(t: string): { select(c: string): { order(c: string): unknown } } }).from('t').select('id').order('id')
}

const rows = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({ id: from + i }))

describe('pagedList', () => {
  it('collects several pages and stops only on an empty page', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: rows(0, 3) }, { data: rows(3, 2) }, { data: [] })
    const out = await pagedList<{ id: number }>(query(fake), 't', { pageSize: 3 })
    expect(out.map((r) => r.id)).toEqual([0, 1, 2, 3, 4])
    // offsets follow what was actually received (the server may return fewer rows than asked)
    expect(fake.calls.map((c) => opsNamed(c, 'range')[0])).toEqual([[0, 2], [3, 5], [5, 7]])
    fake.assertDrained()
  })

  it('treats a null page as the end', async () => {
    const fake = createFakeClient()
    expect(await pagedList(query(fake), 't')).toEqual([])
  })

  it('does not throw at exactly maxRows, and throws when more rows exist', async () => {
    const ok = createFakeClient()
    ok.enqueue({ data: rows(0, 4) }, { data: [] })
    expect(await pagedList(query(ok), 't', { pageSize: 4, maxRows: 4 })).toHaveLength(4)

    const over = createFakeClient()
    over.enqueue({ data: rows(0, 4) }, { data: rows(4, 1) })
    await expect(pagedList(query(over), 'things', { pageSize: 4, maxRows: 4 })).rejects.toMatchObject({
      kind: 'validation',
      message: expect.stringContaining('more than 4 rows exist'),
    })
  })

  it('propagates a database error from any page', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: rows(0, 2) }, { error: { message: 'denied', code: '42501' } })
    await expect(pagedList(query(fake), 't', { pageSize: 2 })).rejects.toMatchObject({ kind: 'permission' })
  })
})

describe('throwZeroRows', () => {
  it('refuses an empty match instead of selecting without a filter', async () => {
    const fake = createFakeClient()
    await expect(throwZeroRows(fake.db, 't', {}, 'x')).rejects.toMatchObject({ kind: 'validation' })
    expect(fake.calls).toHaveLength(0)
  })

  it('uses limit(1) so several matching rows still mean "exists"', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: [{ a: 1 }] })
    await expect(throwZeroRows(fake.db, 't', { a: 1, b: 2 }, 'x')).rejects.toMatchObject({ kind: 'permission' })
    expect(opsNamed(fake.calls[0], 'select')).toEqual([['a']])
    expect(opsNamed(fake.calls[0], 'match')).toEqual([[{ a: 1, b: 2 }]])
    expect(opsNamed(fake.calls[0], 'limit')).toEqual([[1]])
  })

  it('not_found when nothing is readable, and propagates read errors', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: [] })
    await expect(throwZeroRows(fake.db, 't', { a: 1 }, 'x')).rejects.toMatchObject({ kind: 'not_found' })
    fake.enqueue({ error: { message: 'boom', code: '42501' } })
    await expect(throwZeroRows(fake.db, 't', { a: 1 }, 'x')).rejects.toMatchObject({ kind: 'permission', code: '42501' })
  })
})
