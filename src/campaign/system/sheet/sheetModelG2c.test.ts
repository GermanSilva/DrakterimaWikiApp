/** G2c: action categories of Habilidad tables, economy tables and the reward destination (validateSheet). */
import { describe, expect, it } from 'vitest'
import { validateSheet, type Sheet } from './sheetModel'

type Loose = Record<string, unknown>
const PATH = 'categories[0].sections[0].items'
const BLOCKS = 'categories[0].sections[0].blocks'

const acciones = (extra: Loose = {}): Loose => ({
  kind: 'table',
  type: 'habilidad',
  key: 'acciones',
  label: 'Acciones',
  editableBy: 'dm',
  columns: [
    { key: 'nombre', label: 'Nombre', type: 'short', editableBy: 'dm' },
    { key: 'categoria', label: 'Categoría', type: 'short', editableBy: 'dm' },
    { key: 'descripcion', label: 'Descripción', type: 'paragraph', editableBy: 'dm' },
  ],
  categories: [
    { key: 'trucos', label: 'Trucos' },
    { key: 'nivel_1', label: 'Nivel 1' },
  ],
  ...extra,
})
const dinero = (extra: Loose = {}): Loose => ({
  kind: 'table',
  type: 'monedas',
  key: 'dinero',
  label: 'Dinero',
  rows: [{ key: 'oro', label: 'Oro', value: 100 }, { key: 'bronce', label: 'Bronce', value: 1 }],
  ...extra,
})
const caja = (extra: Loose = {}): Loose => ({ kind: 'table', type: 'economia', key: 'caja', label: 'Caja', editableBy: 'dm', ...extra })
const modal = (filterCategories: unknown = ['trucos']): Loose => ({ key: 'b_acciones', mode: 'modal', items: ['acciones'], filterCategories })

/** The modal block (by default) shows `acciones`; the other items are listed in the section without a block. */
const sheetOf = (items: Loose[], blocks: Loose[] = [modal()]): Sheet =>
  ({ categories: [{ key: 'c', label: 'C', sections: [{ key: 's', label: 'S', items, blocks }] }], roles: {} }) as unknown as Sheet
const errorsOf = (sheet: unknown) => {
  const result = validateSheet(sheet)
  return result.ok ? [] : result.errors.map((e) => e.path)
}
const ok = (sheet: unknown): Sheet => {
  const result = validateSheet(sheet)
  expect(result.ok, JSON.stringify(result.ok ? [] : result.errors)).toBe(true)
  return result.ok ? result.sheet : (null as never)
}
const itemAt = (sheet: Sheet, index: number) => sheet.categories[0].sections[0].items[index] as unknown as Loose
/** Items: 0 acciones, 1 dinero, 2 the economy table under test. */
const withEconomy = (extra: Loose = {}, blocks: Loose[] = [modal()]) => sheetOf([acciones(), dinero(), caja(extra)], blocks)

describe('action categories (S23)', () => {
  it('accepts declared categories and returns them normalised, in order, with only known properties', () => {
    const raw = acciones({ categories: [{ key: 'nivel_1', label: ' Nivel 1 ', extra: 1 }, { key: 'trucos', label: 'Trucos' }] })
    const table = itemAt(ok(sheetOf([raw], [modal(['trucos'])])), 0)
    expect(table.categories).toEqual([{ key: 'nivel_1', label: 'Nivel 1' }, { key: 'trucos', label: 'Trucos' }])
  })

  it('leaves a table without categories without the property', () => {
    expect('categories' in itemAt(ok(sheetOf([acciones({ categories: undefined })], [])), 0)).toBe(false)
  })

  it('accepts 1 and 30 categories, rejects none and 31 at the categories path', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ key: `c${i}`, label: `C${i}` }))
    ok(sheetOf([acciones({ categories: many(1) })], []))
    ok(sheetOf([acciones({ categories: many(30) })], []))
    expect(errorsOf(sheetOf([acciones({ categories: [] })], []))).toEqual([`${PATH}[0].categories`])
    expect(errorsOf(sheetOf([acciones({ categories: many(31) })], []))).toEqual([`${PATH}[0].categories`])
  })

  it.each([
    ['categories that are not a list', { categories: 'trucos' }, 'categories'],
    ['a category that is not an object', { categories: ['trucos'] }, 'categories[0]'],
    ['a repeated key', { categories: [{ key: 'a', label: 'A' }, { key: 'a', label: 'B' }] }, 'categories[1].key'],
    ['a key with the wrong charset', { categories: [{ key: 'Bad Key', label: 'A' }] }, 'categories[0].key'],
    ['a prototype key', { categories: [{ key: 'constructor', label: 'A' }] }, 'categories[0].key'],
    ['a missing key', { categories: [{ label: 'A' }] }, 'categories[0].key'],
    ['a missing label', { categories: [{ key: 'a' }] }, 'categories[0].label'],
    ['an empty label', { categories: [{ key: 'a', label: '  ' }] }, 'categories[0].label'],
  ])('rejects %s', (_name, extra, path) => {
    expect(errorsOf(sheetOf([acciones(extra)], []))).toEqual([`${PATH}[0].${path}`])
  })

  it('rejects categories on any table that is not a Habilidad table', () => {
    expect(errorsOf(sheetOf([acciones({ type: 'libre', key: 'libre' })], []))).toEqual([`${PATH}[0].categories`])
    expect(errorsOf(sheetOf([dinero({ categories: [{ key: 'a', label: 'A' }] })], []))).toEqual([`${PATH}[0].categories`])
  })

  it('makes a modal block name the categories by key: a declared key is accepted, in any order, repeated or not', () => {
    ok(sheetOf([acciones()], [modal(['nivel_1', 'trucos'])]))
    ok(sheetOf([acciones()], [modal(['trucos', 'trucos'])]))
  })

  it('rejects a key the table does not declare, and the label of a category, at that filter entry', () => {
    expect(errorsOf(sheetOf([acciones()], [modal(['trucos', 'ghost'])]))).toEqual([`${BLOCKS}[0].filterCategories[1]`])
    expect(errorsOf(sheetOf([acciones()], [modal(['Trucos'])]))).toEqual([`${BLOCKS}[0].filterCategories[0]`])
  })

  it('still needs at least one named category and an entry that is a text', () => {
    expect(errorsOf(sheetOf([acciones()], [modal([])]))).toEqual([`${BLOCKS}[0].filterCategories`])
    expect(errorsOf(sheetOf([acciones()], [modal([5])]))).toEqual([`${BLOCKS}[0].filterCategories[0]`])
  })

  it('keeps free text categories for a table with no declared categories (previous behaviour)', () => {
    const plain = acciones({ categories: undefined })
    const sheet = ok(sheetOf([plain], [modal([' Cualquier cosa ', 'Nivel 1'])]))
    expect(sheet.categories[0].sections[0].blocks[0].filterCategories).toEqual(['Cualquier cosa', 'Nivel 1'])
    expect(errorsOf(sheetOf([plain], [modal([])]))).toEqual([`${BLOCKS}[0].filterCategories`])
  })
})

describe('economy tables (S28, S12, S14)', () => {
  it('accepts an economy table next to the coin table and returns it normalised', () => {
    expect(itemAt(ok(withEconomy({ junk: 1 })), 2)).toEqual({ kind: 'table', type: 'economia', key: 'caja', label: 'Caja', editableBy: 'dm' })
  })

  it('accepts several economy tables', () => {
    ok(sheetOf([acciones(), dinero(), caja(), caja({ key: 'banco', label: 'Banco' })]))
  })

  it('rejects an economy table when the sheet has no coin table, at the categories path', () => {
    expect(errorsOf(sheetOf([acciones(), caja()]))).toEqual(['categories'])
  })

  it('rejects a player economy table (DM only until the guard handles it) and a missing editor', () => {
    expect(errorsOf(withEconomy({ editableBy: 'player' }))).toEqual([`${PATH}[2].editableBy`])
    expect(errorsOf(withEconomy({ editableBy: undefined }))).toEqual([`${PATH}[2].editableBy`])
  })

  it('rejects columns and rows on an economy table: it holds amounts only', () => {
    expect(errorsOf(withEconomy({ rows: [] }))).toEqual([`${PATH}[2].rows`])
    expect(errorsOf(withEconomy({ columns: [] }))).toEqual([`${PATH}[2].columns`])
  })

  it('rejects a key that is reserved, repeated or shaped wrong', () => {
    expect(errorsOf(withEconomy({ key: 'monedas' }))).toEqual([`${PATH}[2].key`])
    expect(errorsOf(withEconomy({ key: 'dinero' }))).toEqual([`${PATH}[2].key`])
    expect(errorsOf(withEconomy({ key: 'Bad Key' }))).toEqual([`${PATH}[2].key`])
  })

  it('can be shown by a plano block only', () => {
    ok(withEconomy({}, [modal(), { key: 'b2', mode: 'plano', items: ['dinero', 'caja'] }]))
    for (const mode of ['tile', 'stat', 'capacidades', 'modal']) {
      expect(errorsOf(withEconomy({}, [modal(), { key: 'b2', mode, items: ['caja'], filterCategories: ['trucos'] }]))).toEqual([`${BLOCKS}[1].mode`])
    }
  })

  it('cannot be read by table functions, as a plain value or by a calculation (only Libre, Habilidad and coins)', () => {
    const field = (extra: Loose) => ({ kind: 'field', key: 'total', label: 'Total', type: 'number', editableBy: 'dm', ...extra })
    expect(errorsOf(sheetOf([acciones(), dinero(), caja(), field({ formula: 'suma({caja}, "oro")' })]))).toEqual([`${PATH}[3].formula`])
    expect(errorsOf(sheetOf([acciones(), dinero(), caja(), field({ formula: '{caja} + 1' })]))).toEqual([`${PATH}[3].formula`])
    expect(errorsOf(sheetOf([acciones(), dinero(), caja(), field({ calc: { table: 'caja', op: 'conteo' } })]))).toEqual([`${PATH}[3].calc.table`])
  })

  it('keeps the coin table limit: two coin tables are still rejected', () => {
    expect(errorsOf(sheetOf([acciones(), dinero(), dinero({ key: 'otro', rows: [{ key: 'plata', label: 'Plata', value: 1 }] })]))).toEqual(['categories'])
  })
})

describe('reward destination (S28)', () => {
  it('is accepted on the coin table or on one economy table, and kept as given', () => {
    expect(itemAt(ok(sheetOf([acciones(), dinero({ rewardDestination: true })])), 1)).toMatchObject({ rewardDestination: true })
    expect(itemAt(ok(withEconomy({ rewardDestination: true })), 2)).toMatchObject({ rewardDestination: true })
    expect(itemAt(ok(withEconomy({ rewardDestination: false })), 2)).toMatchObject({ rewardDestination: false })
  })

  it('may be false on any number of tables next to one true', () => {
    ok(sheetOf([acciones(), dinero({ rewardDestination: false }), caja({ rewardDestination: true }), caja({ key: 'banco', label: 'B', rewardDestination: false })]))
  })

  it('rejects a second destination, at the second table, whichever kinds they are', () => {
    expect(errorsOf(sheetOf([acciones(), dinero({ rewardDestination: true }), caja({ rewardDestination: true })]))).toEqual([`${PATH}[2].rewardDestination`])
    expect(errorsOf(sheetOf([acciones(), dinero(), caja({ rewardDestination: true }), caja({ key: 'banco', label: 'B', rewardDestination: true })]))).toEqual([`${PATH}[3].rewardDestination`])
  })

  it('rejects a value that is not a boolean', () => {
    expect(errorsOf(withEconomy({ rewardDestination: 'yes' }))).toEqual([`${PATH}[2].rewardDestination`])
    expect(errorsOf(sheetOf([acciones(), dinero({ rewardDestination: 1 })]))).toEqual([`${PATH}[1].rewardDestination`])
  })

  it('rejects it on tables that hold no amounts', () => {
    expect(errorsOf(sheetOf([acciones({ rewardDestination: true }), dinero()]))).toEqual([`${PATH}[0].rewardDestination`])
  })
})
