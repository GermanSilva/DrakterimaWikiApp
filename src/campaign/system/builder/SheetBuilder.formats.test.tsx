import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { removeNode } from './removal'
import { click, item, itemsOf, setup, type } from './builderTestKit'

// odd/tasks/ficha-indice-lateral.md S15: the builder edits dots and tracks.

const f = (key: string, label: string) => ({ kind: 'field', key, label, type: 'number', editableBy: 'player' })
const STORED = {
  categories: [
    {
      key: 'c',
      label: 'C',
      sections: [
        {
          key: 's',
          label: 'S',
          blocks: [],
          items: [
            { kind: 'table', type: 'stat', key: 'atributos', label: 'Atributos', rows: [{ key: 'fue', label: 'Fuerza', modifier: '{valor}', editableBy: 'dm' }] },
            f('hambre', 'Hambre'),
            f('salud', 'Salud'),
            f('leve', 'Leve'),
            f('agravada', 'Agravada'),
          ],
        },
      ],
    },
  ],
  roles: {},
}

describe('builder: dots and tracks', () => {
  it('sets dots on a number field and a stat table, and a track with both damages', () => {
    const t = setup(STORED)
    click('Editar ítem', within(item('Hambre')))
    type(within(item('Hambre')).getByLabelText('Mostrar como puntos (máximo, 1 a 10)'), '5')
    click('Editar ítem', within(item('Atributos')))
    type(within(item('Atributos')).getByLabelText('Mostrar los valores como puntos (máximo, 1 a 10)'), '5')
    click('Editar ítem', within(item('Salud')))
    type(within(item('Salud')).getByLabelText('Casillas: daño leve en'), 'leve')
    type(within(item('Salud')).getByLabelText('Casillas: daño agravado en'), 'agravada')
    const items = itemsOf(t.sheet())
    expect(items[0]).toMatchObject({ dots: 5 })
    expect(items[1]).toMatchObject({ dots: 5 })
    expect(items[2]).toMatchObject({ track: { superficial: 'leve', aggravated: 'agravada' } })
    expect(within(item('Salud')).queryByRole('option', { name: /Salud \(salud\)/ })).toBeNull()
  })

  it('says when the dots are out of range', () => {
    setup(STORED)
    click('Editar ítem', within(item('Hambre')))
    type(within(item('Hambre')).getByLabelText('Mostrar como puntos (máximo, 1 a 10)'), '12')
    expect(screen.getAllByText(/Los puntos son un número entero de 1 a 10\./).length).toBeGreaterThan(0)
  })

  it('removing a damage field drops the part of the track that used it', () => {
    const draft = { ...STORED, categories: [{ ...STORED.categories[0], sections: [{ ...STORED.categories[0].sections[0], items: STORED.categories[0].sections[0].items.map((i) => (i.key === 'salud' ? { ...i, track: { superficial: 'leve', aggravated: 'agravada' } } : i)) }] }] }
    const items = ['categories', 0, 'sections', 0, 'items']
    const salud = (d: unknown) => ((d as typeof STORED).categories[0].sections[0].items as Record<string, unknown>[]).find((i) => i.key === 'salud')
    expect(salud(removeNode(draft, items, 4))).toMatchObject({ track: { superficial: 'leve' } })
    expect(salud(removeNode(draft, items, 4))?.track).toEqual({ superficial: 'leve' })
    expect(salud(removeNode(draft, items, 3))).not.toHaveProperty('track')
  })
})
