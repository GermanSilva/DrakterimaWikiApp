/** Dots and track (odd/tasks/ficha-indice-lateral.md S15): validateSheet, resolveSheet, SheetView, the card facts. */
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { resolveCard } from './card'
import { resolveSheet } from './resolveSheet'
import { validateSheet, type Sheet } from './sheetModel'
import SheetView from './SheetView'

const n = (key: string, label: string, extra: Record<string, unknown> = {}) => ({ kind: 'field', key, label, type: 'number', editableBy: 'player', ...extra })

const DEFAULT_FIELDS = [
  n('hambre', 'Hambre', { dots: 5 }),
  n('salud', 'Salud', { track: { superficial: 'salud_leve', aggravated: 'salud_agravada' } }),
  n('salud_leve', 'Daño leve'),
  n('salud_agravada', 'Daño agravado'),
]
const raw = (overrides: { fields?: Record<string, unknown>[]; stat?: Record<string, unknown>; column?: Record<string, unknown>; card?: unknown } = {}) => ({
  categories: [
    {
      key: 'c',
      label: 'C',
      sections: [
        {
          key: 'rasgos',
          label: 'Rasgos',
          items: [
            { kind: 'table', type: 'stat', key: 'atributos', label: 'Atributos', rows: [{ key: 'fue', label: 'Fuerza', modifier: '{valor}', editableBy: 'dm' }], dots: 5, ...overrides.stat },
            {
              kind: 'table',
              type: 'capacidades',
              key: 'habilidades',
              label: 'Habilidades',
              columns: [{ key: 'nivel_h', label: 'Nivel', type: 'number', editableBy: 'dm', default: 0, dots: 5, ...overrides.column }],
              rows: [{ key: 'sigilo', label: 'Sigilo', stat: 'fue', use: 'valor', editableBy: 'dm' }],
            },
            ...(overrides.fields ?? DEFAULT_FIELDS),
          ],
          blocks: [
            { key: 'b1', mode: 'stat', items: ['atributos'] },
            { key: 'b2', mode: 'capacidades', items: ['habilidades'] },
            { key: 'b3', mode: 'tile', items: (overrides.fields ?? DEFAULT_FIELDS).map((f) => f.key as string).filter((k) => k === 'hambre' || k === 'salud') },
          ],
        },
      ],
    },
  ],
  roles: {},
  ...(overrides.card ? { card: overrides.card } : {}),
})

const errorsOf = (sheet: unknown) => {
  const result = validateSheet(sheet)
  return result.ok ? [] : result.errors.map((e) => `${e.path}: ${e.message}`)
}
const valid = (sheet: unknown): Sheet => {
  const result = validateSheet(sheet)
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.sheet
}
const at = 'categories[0].sections[0].items'

describe('validateSheet: dots and track', () => {
  it('keeps dots on a number field, a number column and a stat table, and a track on a number field', () => {
    const sheet = valid(raw())
    const items = sheet.categories[0].sections[0].items as unknown as Record<string, unknown>[]
    expect(items[0]).toMatchObject({ dots: 5 })
    expect((items[1].columns as Record<string, unknown>[])[0]).toMatchObject({ dots: 5 })
    expect(items[2]).toMatchObject({ dots: 5 })
    expect(items[3]).toMatchObject({ track: { superficial: 'salud_leve', aggravated: 'salud_agravada' } })
  })

  it('rejects dots that are not an integer 1 to 10, on a non-number, or with the signed format', () => {
    for (const dots of [0, 11, 2.5, '5']) expect(errorsOf(raw({ fields: [n('hambre', 'Hambre', { dots })] })), String(dots)).toContain(`${at}[2].dots: dots is a whole number from 1 to 10`)
    expect(errorsOf(raw({ fields: [{ ...n('hambre', 'Hambre'), type: 'short', dots: 5 }] }))).toContain(`${at}[2].dots: dots needs a number`)
    expect(errorsOf(raw({ fields: [n('hambre', 'Hambre', { dots: 5, format: 'signed' })] }))).toContain(`${at}[2].dots: dots and the signed format do not mix`)
    expect(errorsOf(raw({ column: { type: 'short' } }))).toContain(`${at}[1].columns[0].dots: dots needs a number`)
    expect(errorsOf(raw({ stat: { dots: 12 } }))).toContain(`${at}[0].dots: dots is a whole number from 1 to 10`)
    const onCapacidades = raw() as { categories: { sections: { items: Record<string, unknown>[] }[] }[] }
    onCapacidades.categories[0].sections[0].items[1] = { ...onCapacidades.categories[0].sections[0].items[1], dots: 5, track: { superficial: 'salud_leve' } }
    expect(errorsOf(onCapacidades)).toEqual(expect.arrayContaining([`${at}[1].dots: dots needs a number`, `${at}[1].track: a track counts damage in number fields`]))
  })

  it('rejects a track whose damage fields are missing, not numbers, the field itself or the same', () => {
    const track = (t: unknown, extra: Record<string, unknown>[] = [n('leve', 'Leve'), n('agr', 'Agravado')]) => errorsOf(raw({ fields: [n('salud', 'Salud', { track: t }), ...extra] }))
    expect(track({ superficial: 'leve' })).toEqual([])
    expect(track({ superficial: 'nada' })).toContain(`${at}[2].track: a track counts damage in number fields`)
    expect(track({ superficial: 'salud' })).toContain(`${at}[2].track: a track counts damage in number fields`)
    expect(track({ superficial: 'leve', aggravated: 'leve' })).toContain(`${at}[2].track: a track counts damage in number fields`)
    expect(track({ superficial: 'leve' }, [{ ...n('leve', 'Leve'), type: 'short' }])).toContain(`${at}[2].track: a track counts damage in number fields`)
    expect(track('x')).toContain(`${at}[2].track: a track counts damage in number fields`)
    expect(errorsOf(raw({ fields: [{ ...n('salud', 'Salud'), type: 'short', track: { superficial: 'leve' } }, n('leve', 'Leve')] }))).toContain(`${at}[2].track: a track counts damage in number fields`)
  })
})

describe('SheetView: dots and track', () => {
  const pj = { fue: 3, sigilo: 2, hambre: 2, salud: 7, salud_leve: 2, salud_agravada: 1 }

  it('draws dots with their value as text for assistive technology', () => {
    render(<SheetView resolved={resolveSheet(valid(raw()), pj)} unread={{}} />)
    expect(screen.getByRole('img', { name: 'Fuerza: 3 de 5' }).textContent).toBe('●●●○○')
    expect(screen.getByRole('img', { name: 'Hambre: 2 de 5' }).textContent).toBe('●●○○○')
    expect(within(screen.getByTestId('capacidades-fue')).getByRole('img', { name: 'Sigilo: 2 de 5' }).textContent).toBe('●●○○○')
  })

  it('draws a track as boxes: aggravated first, then superficial, then free', () => {
    render(<SheetView resolved={resolveSheet(valid(raw()), pj)} unread={{}} />)
    const track = screen.getByRole('img', { name: 'Salud: 7 casillas, 2 daño leve, 1 agravado, 4 libres' })
    expect(track.textContent).toBe('✕//    '.replace(/ /g, ''))
    expect(track.querySelectorAll('[data-box]')).toHaveLength(7)
  })

  it('caps the damage at the boxes and treats a missing damage as 0', () => {
    render(<SheetView resolved={resolveSheet(valid(raw()), { ...pj, salud: 3, salud_leve: 5, salud_agravada: undefined })} unread={{}} />)
    expect(screen.getByRole('img', { name: 'Salud: 3 casillas, 3 daño leve, 0 agravado, 0 libres' })).toBeTruthy()
  })
})

describe('resolveCard: pinned dots and track keep their format', () => {
  it('passes dots and track to the key facts', () => {
    const sheet = valid(raw({ card: { pinned: [{ key: 'hambre' }, { key: 'salud' }] } }))
    expect(resolveCard(sheet, { hambre: 2, salud: 7, salud_leve: 2, salud_agravada: 1 }).pinned).toEqual([
      { key: 'hambre', label: 'Hambre', value: '2', dots: { value: 2, max: 5 } },
      { key: 'salud', label: 'Salud', value: '4', max: '7', track: { max: 7, superficial: 2, aggravated: 1 } },
    ])
  })
})
