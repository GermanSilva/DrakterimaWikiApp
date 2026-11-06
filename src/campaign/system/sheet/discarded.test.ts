import { describe, expect, it } from 'vitest'
import type { DiscardedItem } from './sheetModel'
import { discardedDataKeys, renameRoots, renamedDataKeys } from './discarded'

const as = (item: unknown) => item as DiscardedItem

describe('discardedDataKeys (the pjs.data keys an item owns: the twin of _discarded_data_keys)', () => {
  it('a field owns its key', () => {
    expect(discardedDataKeys(as({ kind: 'field', key: 'gone', label: 'G', type: 'short', editableBy: 'dm' }))).toEqual(['gone'])
  })

  it('Libre, Habilidad and economy tables own the table key; a coin table owns none', () => {
    for (const type of ['libre', 'habilidad', 'economia']) expect(discardedDataKeys(as({ kind: 'table', type, key: 't', label: 'T' }))).toEqual(['t'])
    expect(discardedDataKeys(as({ kind: 'table', type: 'monedas', key: 'dinero', label: 'D', rows: [{ key: 'cp', label: 'cp', value: 1 }] }))).toEqual([])
  })

  it('a Stat table owns its row keys, not its own key', () => {
    expect(discardedDataKeys(as({ kind: 'table', type: 'stat', key: 'atrib', label: 'A', rows: [{ key: 'fue' }, { key: 'des' }] })).sort()).toEqual(['des', 'fue'])
  })

  it('a Capacidades row owns the row key and row__column for the columns after the first', () => {
    expect(discardedDataKeys(as({ kind: 'row', type: 'capacidades', table: 'h', key: 'ath', label: 'A', columns: ['prof', 'nota', 'extra'] })).sort()).toEqual(['ath', 'ath__extra', 'ath__nota'])
    expect(discardedDataKeys(as({ kind: 'row', type: 'stat', table: 'a', key: 'sabio', label: 'S' }))).toEqual(['sabio'])
  })

  it('a Capacidades table owns that for each of its rows', () => {
    const table = { kind: 'table', type: 'capacidades', key: 'sal', label: 'S', columns: [{ key: 'prof' }, { key: 'nota' }], rows: [{ key: 's1' }, { key: 's2' }] }
    expect(discardedDataKeys(as(table)).sort()).toEqual(['s1', 's1__nota', 's2', 's2__nota'])
  })

  it('ignores junk', () => {
    expect(discardedDataKeys(as({ kind: 'table', type: 'stat', key: 'a', rows: [{ key: 5 }, { key: 'Bad Key' }, {}] }))).toEqual([])
    expect(discardedDataKeys(as(null))).toEqual([])
  })
})

describe('renameRoots and renamedDataKeys (the twin of the rekey expansion)', () => {
  it('the roots are the key of the item, plus the row keys of a Stat or Capacidades table', () => {
    expect(renameRoots(as({ kind: 'field', key: 'a', label: 'A', type: 'short' }))).toEqual(['a'])
    expect(renameRoots(as({ kind: 'table', type: 'stat', key: 'atrib', label: 'A', rows: [{ key: 'fue' }] }))).toEqual(['atrib', 'fue'])
    expect(renameRoots(as({ kind: 'table', type: 'libre', key: 't', label: 'T' }))).toEqual(['t'])
  })

  it('every owned key follows the root it belongs to, row__column included', () => {
    const row = as({ kind: 'row', type: 'capacidades', table: 'h', key: 'ath', label: 'A', columns: ['prof', 'nota', 'extra'] })
    expect(renamedDataKeys(row, { ath: 'ath_2' })).toEqual([
      { from: 'ath', to: 'ath_2' },
      { from: 'ath__extra', to: 'ath_2__extra' },
      { from: 'ath__nota', to: 'ath_2__nota' },
    ])
  })

  it('a key that is not renamed is not listed', () => {
    const table = as({ kind: 'table', type: 'stat', key: 'atrib', label: 'A', rows: [{ key: 'fue' }, { key: 'des' }] })
    expect(renamedDataKeys(table, { fue: 'fue_2' })).toEqual([{ from: 'fue', to: 'fue_2' }])
  })
})
