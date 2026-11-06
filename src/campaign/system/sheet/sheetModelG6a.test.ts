/** G6a: column scope of Habilidad tables (entry of the shared action collection vs per-character state), validateSheet. */
import { describe, expect, it } from 'vitest'
import { validateSheet, type Sheet } from './sheetModel'

type Loose = Record<string, unknown>
const PATH = 'categories[0].sections[0].items'

const habilidad = (columns: Loose[], extra: Loose = {}): Loose => ({
  kind: 'table',
  type: 'habilidad',
  key: 'hechizos',
  label: 'Hechizos',
  editableBy: 'player',
  columns,
  ...extra,
})
const col = (key: string, extra: Loose = {}): Loose => ({ key, label: key, type: 'short', editableBy: 'player', ...extra })

const sheetOf = (items: Loose[]): Sheet =>
  ({ categories: [{ key: 'c', label: 'C', sections: [{ key: 's', label: 'S', items, blocks: [] }] }], roles: {} }) as unknown as Sheet
const errorsOf = (sheet: unknown) => {
  const result = validateSheet(sheet)
  return result.ok ? [] : result.errors.map((e) => e.path)
}
const columnsOf = (sheet: Sheet): Loose[] => (sheet.categories[0].sections[0].items[0] as unknown as { columns: Loose[] }).columns

describe('column scope (G6a)', () => {
  it('accepts entry and character scope on Habilidad columns and returns them as declared', () => {
    const result = validateSheet(sheetOf([habilidad([col('escuela', { scope: 'entry' }), col('preparado', { type: 'boolean', scope: 'character' }), col('nota')])]))
    expect(result.ok).toBe(true)
    const columns = columnsOf((result as { sheet: Sheet }).sheet)
    expect(columns.map((c) => c.scope)).toEqual(['entry', 'character', undefined])
    expect('scope' in columns[2]).toBe(false)
  })

  it('works on a number column and on an options column', () => {
    const options = [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }]
    expect(errorsOf(sheetOf([habilidad([col('usos', { type: 'number', scope: 'character' }), col('forma', { type: 'options', display: 'select', options, scope: 'character' })])]))).toEqual([])
  })

  it('rejects an unknown scope at the column', () => {
    for (const scope of ['both', 'Entry', '', 1, null, true]) {
      expect(errorsOf(sheetOf([habilidad([col('x'), col('y', { scope })])])), String(scope)).toEqual([`${PATH}[0].columns[1].scope`])
    }
  })

  it('rejects scope on a formula column', () => {
    expect(errorsOf(sheetOf([habilidad([col('a', { type: 'number' }), col('b', { type: 'number', formula: '{a} + 1', scope: 'character' })])]))).toEqual([`${PATH}[0].columns[1].scope`])
    expect(errorsOf(sheetOf([habilidad([col('a', { type: 'number' }), col('b', { type: 'number', formula: '{a} + 1', scope: 'entry' })])]))).toEqual([`${PATH}[0].columns[1].scope`])
  })

  it('rejects scope outside Habilidad tables', () => {
    const libre = { kind: 'table', type: 'libre', key: 'inv', label: 'Inv', editableBy: 'dm', columns: [col('a', { editableBy: 'dm', scope: 'character' })] }
    expect(errorsOf(sheetOf([libre]))).toEqual([`${PATH}[0].columns[0].scope`])
    const capacidades = {
      kind: 'table', type: 'capacidades', key: 'caps', label: 'Caps',
      columns: [col('prof', { editableBy: 'dm', scope: 'entry' })],
      rows: [{ key: 'r', label: 'R', stat: 'fue', use: 'modificador', editableBy: 'dm' }],
    }
    const stat = { kind: 'table', type: 'stat', key: 'attrs', label: 'Attrs', rows: [{ key: 'fue', label: 'FUE', modifier: '0', editableBy: 'dm' }] }
    expect(errorsOf(sheetOf([stat, capacidades]))).toEqual([`${PATH}[1].columns[0].scope`])
  })

  it('leaves columns without scope exactly as before (preserve)', () => {
    const result = validateSheet(sheetOf([habilidad([col('a'), col('b', { type: 'number' })])]))
    expect(result.ok).toBe(true)
    expect(columnsOf((result as { sheet: Sheet }).sheet).every((c) => !('scope' in c))).toBe(true)
  })
})
