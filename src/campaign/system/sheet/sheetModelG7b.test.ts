/** G7b: the discarded list of a sheet (S26, S32). The same cases run against the database validator in 32_sheet_discarded.test.sql. */
import { describe, expect, it } from 'vitest'
import { validateSheet } from './sheetModel'

type Loose = Record<string, unknown>
const AT = '2026-11-06T10:00:00.000Z'
const entry = (item: Loose, extra: Loose = {}): Loose => ({ item, section: 'alpha', at: AT, ...extra })
const field = (extra: Loose = {}): Loose => ({ kind: 'field', key: 'gone', label: 'Perdido', type: 'short', editableBy: 'dm', ...extra })
const sheetOf = (discarded?: unknown, items: Loose[] = []): unknown => ({
  categories: [{ key: 'c', label: 'C', sections: [{ key: 'alpha', label: 'Alpha', items, blocks: [] }] }],
  roles: {},
  ...(discarded === undefined ? {} : { discarded }),
})
const errorsOf = (sheet: unknown): string[] => {
  const result = validateSheet(sheet)
  return result.ok ? [] : result.errors.map((e) => e.path)
}

describe('discarded list (G7b)', () => {
  it('keeps a discarded entry, trimming the label like any label', () => {
    const result = validateSheet(sheetOf([entry(field({ label: '  Perdido  ' }))]))
    expect(result.ok).toBe(true)
    expect((result as { sheet: { discarded: unknown[] } }).sheet.discarded).toEqual([entry(field())])
  })

  it('leaves a sheet without the list without it, and keeps an empty list as stored', () => {
    const plain = validateSheet(sheetOf())
    expect(plain.ok && 'discarded' in plain.sheet).toBe(false)
    const empty = validateSheet(sheetOf([]))
    expect(empty.ok && empty.sheet.discarded).toEqual([])
  })

  it('accepts the three kinds: field, table and removed row', () => {
    const rows = [
      field({ type: 'options' }),
      { kind: 'table', type: 'libre', key: 'bolsillo', label: 'Bolsillo', editableBy: 'player', columns: [] },
      { kind: 'table', type: 'monedas', key: 'dinero', label: 'Dinero', rows: [] },
      { kind: 'row', type: 'stat', table: 'atrib', key: 'sabio', label: 'Sabiduría', modifier: '{valor}', editableBy: 'dm' },
      { kind: 'row', type: 'capacidades', table: 'habs', key: 'ath', label: 'Atletismo', stat: 'fue', use: 'valor', editableBy: 'dm', columns: ['prof', 'nota'] },
    ].map((item, i) => entry({ ...item, key: (item.key as string) === 'gone' ? `k${i}` : item.key }))
    expect(errorsOf(sheetOf(rows))).toEqual([])
  })

  it('lets a live item reuse the key of a discarded one (S32)', () => {
    const live = { kind: 'field', key: 'gone', label: 'Nuevo', type: 'short', editableBy: 'dm' }
    expect(errorsOf(sheetOf([entry(field())], [live]))).toEqual([])
  })

  const bad: [string, unknown, string][] = [
    ['a non-array list', 'x', 'discarded'],
    ['more than 100 entries', Array.from({ length: 101 }, (_, n) => entry(field({ key: `k${n}` }))), 'discarded'],
    ['an entry that is not an object', ['x'], 'discarded[0]'],
    ['an entry without its item', [{ section: 'alpha', at: AT }], 'discarded[0].item'],
    ['an unknown kind', [entry({ kind: 'thing', key: 'a', label: 'A' })], 'discarded[0].item.kind'],
    ['an invalid key', [entry(field({ key: 'Bad' }))], 'discarded[0].item.key'],
    ['a reserved key', [entry(field({ key: 'nombre' }))], 'discarded[0].item.key'],
    ['a key with a double underscore', [entry(field({ key: 'a__b' }))], 'discarded[0].item.key'],
    ['an empty label', [entry(field({ label: '' }))], 'discarded[0].item.label'],
    ['an unknown field type', [entry(field({ type: 'nope' }))], 'discarded[0].item.type'],
    ['an unknown table type', [entry({ kind: 'table', key: 'a', label: 'A', type: 'nope' })], 'discarded[0].item.type'],
    ['a capacidades row without its columns', [entry({ kind: 'row', type: 'capacidades', key: 'a', label: 'A', table: 't' })], 'discarded[0].item.columns'],
    ['a row without its table', [entry({ kind: 'row', type: 'stat', key: 'a', label: 'A' })], 'discarded[0].item.table'],
    ['a section that is not a key', [entry(field(), { section: 'Bad Key' })], 'discarded[0].section'],
    ['a date that is not ISO', [entry(field(), { at: 'yesterday' })], 'discarded[0].at'],
    ['a key discarded twice', [entry(field()), entry(field({ label: 'B' }))], 'discarded[1].item.key'],
  ]
  it.each(bad)('rejects %s', (_name, discarded, path) => {
    expect(errorsOf(sheetOf(discarded))[0]).toBe(path)
  })
})
