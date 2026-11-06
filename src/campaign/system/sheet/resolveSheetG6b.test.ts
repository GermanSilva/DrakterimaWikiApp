/** G6b: linked collection entries join the rows of a Habilidad table (legacy rows first), resolveSheet. */
import { describe, expect, it } from 'vitest'
import { ACTION_SHEET, action, link } from '../actions/actionsFixture'
import { resolveSheet } from './resolveSheet'

const PJ = {
  id: 1,
  hechizos: [{ id: 1, nombre: 'Luz propia', categoria: 'truco', escuela: 'Heredada' }],
}
const LINKED = [
  { action: action(10, { name: 'Rayo', category: 'truco', description: 'Un rayo.', extras: { escuela: 'Evocación', alcance: 30 } }), link: link(1, 10, { preparado: true, usos: 2, calidad: 'alta' }) },
  { action: action(11, { name: 'Bendecir', category: 'nivel1' }), link: link(1, 11) },
  { action: action(12, { name: 'Sentido divino', table_key: 'rasgos', category: 'Clase' }), link: link(1, 12, { cargas: 3 }) },
]

const modalGroups = (resolved: ReturnType<typeof resolveSheet>, blockKey: string) =>
  resolved.sections.flatMap((s) => s.blocks).find((b) => b.key === blockKey)?.groups ?? []

describe('resolveSheet with linked collection entries (G6b)', () => {
  it('is identical without links (nothing changes for a character that links nothing)', () => {
    const base = resolveSheet(ACTION_SHEET, PJ)
    expect(JSON.stringify(resolveSheet(ACTION_SHEET, PJ, []))).toBe(JSON.stringify(base))
    expect(JSON.stringify(resolveSheet(ACTION_SHEET, PJ, undefined))).toBe(JSON.stringify(base))
  })

  it('shows legacy rows first and linked entries after them, grouped by the declared categories', () => {
    const groups = modalGroups(resolveSheet(ACTION_SHEET, PJ, LINKED), 'magia_modal')
    expect(groups.map((g) => [g.category, g.rows.map((r) => r.nombre)])).toEqual([
      ['Trucos', ['Luz propia', 'Rayo']],
      ['Nivel 1', ['Bendecir']],
    ])
  })

  it('a linked row carries the entry columns, the character state and the description', () => {
    const rayo = modalGroups(resolveSheet(ACTION_SHEET, PJ, LINKED), 'magia_modal')[0].rows[1]
    expect(rayo).toMatchObject({ nombre: 'Rayo', categoria: 'truco', escuela: 'Evocación', alcance: 30, preparado: true, usos: 2, __descripcion: 'Un rayo.' })
    expect(rayo.calidad).toMatchObject({ value: 'alta', text: 'Alta' }) // an options column resolves like any row cell
  })

  it('a table without declared categories groups linked entries by free text', () => {
    const groups = modalGroups(resolveSheet(ACTION_SHEET, PJ, LINKED), 'rasgos_modal')
    expect(groups.map((g) => [g.category, g.rows.map((r) => r.nombre)])).toEqual([['Clase', ['Sentido divino']]])
  })

  it('a character with only linked entries (no legacy rows) still shows the block', () => {
    const resolved = resolveSheet(ACTION_SHEET, { id: 1 }, LINKED)
    const block = resolved.sections.flatMap((s) => s.blocks).find((b) => b.key === 'magia_modal')
    expect(block?.empty).toBe(false)
    expect(resolveSheet(ACTION_SHEET, { id: 1 }).sections.flatMap((s) => s.blocks).find((b) => b.key === 'magia_modal')?.empty).toBe(true)
  })

  it('ignores a link whose table is no longer a Habilidad table of the sheet and never mutates the character', () => {
    const copy = JSON.stringify(PJ)
    const stray = [{ action: action(20, { name: 'Huérfana', table_key: 'ya_no_existe' }), link: link(1, 20) }]
    const groups = modalGroups(resolveSheet(ACTION_SHEET, PJ, stray), 'magia_modal')
    expect(groups.map((g) => g.rows.map((r) => r.nombre))).toEqual([['Luz propia']])
    expect(JSON.stringify(PJ)).toBe(copy)
  })
})
