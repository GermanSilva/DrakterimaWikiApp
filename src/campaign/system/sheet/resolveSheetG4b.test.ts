/** G4b: what the editor needs from the resolver: every item (drawn by a block or not) and the stored index of sorted rows. */
import { describe, expect, it } from 'vitest'
import { resolveSheet, resolveSheetItems } from './resolveSheet'
import type { Sheet } from './sheetModel'

type Loose = Record<string, unknown>

const sheetOf = (items: Loose[], blocks: Loose[] = []): Sheet =>
  ({ categories: [{ key: 'c', label: 'C', sections: [{ key: 's', label: 'S', items, blocks }] }], roles: {} }) as unknown as Sheet

const col = (key: string, type: string, extra: Loose = {}) => ({ key, label: key, type, editableBy: 'dm', ...extra })
const slots = (sortBy?: Loose) => ({
  kind: 'table', type: 'libre', key: 'espacios', label: 'Espacios', editableBy: 'dm',
  columns: [col('nivel', 'number'), col('doble', 'number', { formula: '{nivel} * 2' })],
  ...(sortBy ? { sortBy } : {}),
})

describe('resolveSheetItems', () => {
  const sheet = sheetOf(
    [
      { kind: 'field', key: 'nombre_corto', label: 'Corto', type: 'short', editableBy: 'player' },
      { kind: 'field', key: 'doble_hp', label: 'Doble', type: 'number', editableBy: 'dm', formula: '{hp} * 2' },
      { kind: 'field', key: 'hp', label: 'HP', type: 'number', editableBy: 'dm' },
      slots(),
    ],
    [{ key: 'b', mode: 'plano', items: ['hp'] }],
  )

  it('resolves every item of the sheet by key, also the ones no block draws, with formulas computed', () => {
    const items = resolveSheetItems(sheet, { hp: 7, nombre_corto: 'Ana', espacios: [{ id: 1, nivel: 3 }] })
    expect(Object.keys(items).sort()).toEqual(['doble_hp', 'espacios', 'hp', 'nombre_corto'])
    expect(items.doble_hp).toMatchObject({ kind: 'field', value: 14, text: '14', error: false })
    expect(items.nombre_corto).toMatchObject({ kind: 'field', value: 'Ana' })
    expect(items.espacios).toMatchObject({ kind: 'rows', rows: [{ id: 1, nivel: 3, doble: 6 }] })
  })

  it('agrees with resolveSheet on the items a block draws', () => {
    const pj = { hp: 7 }
    const drawn = resolveSheet(sheet, pj).sections[0].blocks[0].items[0]
    expect(resolveSheetItems(sheet, pj).hp).toEqual(drawn)
  })
})

describe('stored index of rows (sorted display)', () => {
  it('is the identity in stored order when the table has no sortBy', () => {
    const items = resolveSheetItems(sheetOf([slots()]), { espacios: [{ id: 1, nivel: 3 }, { id: 2, nivel: 1 }] })
    expect(items.espacios).toMatchObject({ kind: 'rows', storedIndex: [0, 1] })
  })

  it('tells where each displayed row lives in the stored array, so edits address the stored row', () => {
    const sheet = sheetOf([slots({ column: 'nivel', direction: 'asc' })], [{ key: 'b', mode: 'plano', items: ['espacios'] }])
    const pj = { espacios: [{ id: 'a', nivel: 3 }, { id: 'b', nivel: 1 }, { id: 'c', nivel: 2 }] }
    const item = resolveSheetItems(sheet, pj).espacios
    if (item.kind !== 'rows') throw new Error('rows expected')
    expect(item.rows.map((r) => r.id)).toEqual(['b', 'c', 'a']) // displayed sorted
    expect(item.storedIndex).toEqual([1, 2, 0])
    // the drawn block carries the same mapping
    const block = resolveSheet(sheet, pj).sections[0].blocks[0].items[0]
    expect(block).toMatchObject({ kind: 'rows', storedIndex: [1, 2, 0] })
  })

  it('follows the stored array when rows with no object shape are skipped', () => {
    const sheet = sheetOf([slots({ column: 'nivel', direction: 'desc' })])
    const item = resolveSheetItems(sheet, { espacios: [{ nivel: 1 }, 'junk', { nivel: 5 }] }).espacios
    if (item.kind !== 'rows') throw new Error('rows expected')
    expect(item.rows.map((r) => r.nivel)).toEqual([5, 1])
    expect(item.storedIndex).toEqual([2, 0]) // indexes of the stored array, junk row included in the count
  })
})
