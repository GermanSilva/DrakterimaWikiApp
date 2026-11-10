import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { removeNode } from './removal'
import { click, setup, type } from './builderTestKit'

// odd/tasks/ficha-indice-lateral.md S14: the builder edits sheet.card.

const f = (key: string, label: string, t = 'number') => ({ kind: 'field', key, label, type: t, editableBy: 'dm' })
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
            { kind: 'table', type: 'stat', key: 'atributos', label: 'Atributos', rows: [{ key: 'int', label: 'INT', modifier: '{valor}', editableBy: 'dm' }] },
            f('humanidad', 'Humanidad'),
            f('humanidad_max', 'Humanidad máx.'),
            f('trauma', 'Trauma', 'short'),
          ],
        },
      ],
    },
  ],
  roles: {},
}
const panel = () => screen.getByRole('group', { name: 'Tarjeta del personaje' })

describe('builder: card panel', () => {
  it('configures pinned fields with max and Solo DM, a stat line and an excerpt', () => {
    const t = setup(STORED)
    click('Configurar tarjeta', within(panel()))
    click('Agregar campo fijado', within(panel()))
    type(within(panel()).getByRole('combobox', { name: 'Campo fijado n.º 1' }), 'humanidad')
    type(within(panel()).getByLabelText('Máximo (barra)'), 'humanidad_max')
    click('Agregar campo fijado', within(panel()))
    type(within(panel()).getByRole('combobox', { name: 'Campo fijado n.º 2' }), 'trauma')
    fireEvent.click(within(within(panel()).getByRole('group', { name: 'Fijado n.º 2' })).getByLabelText('Solo DM'))
    type(within(panel()).getByLabelText('Línea de stats'), 'atributos')
    type(within(panel()).getByLabelText('Extracto'), 'trauma')
    expect(t.sheet().card).toEqual({ pinned: [{ key: 'humanidad', max: 'humanidad_max' }, { key: 'trauma', dmOnly: true }], statline: 'atributos', excerpt: 'trauma' })
    click('Subir campo fijado', within(within(panel()).getByRole('group', { name: 'Fijado n.º 2' })))
    expect(t.sheet().card?.pinned.map((p) => p.key)).toEqual(['trauma', 'humanidad'])
    click('Quitar configuración de la tarjeta', within(panel()))
    expect(t.sheet()).not.toHaveProperty('card')
  })

  it('offers no max for a text field and stops at 6 pinned fields', () => {
    setup({ ...STORED, card: { pinned: [{ key: 'trauma' }] } })
    expect(within(panel()).queryByLabelText('Máximo (barra)')).toBeNull()
    for (let i = 0; i < 5; i++) click('Agregar campo fijado', within(panel()))
    expect(within(panel()).getByRole('button', { name: 'Agregar campo fijado' })).toBeDisabled()
  })

  it('removing an item drops its pin, the max that pointed at it and the stat line or excerpt', () => {
    const draft = { ...STORED, card: { pinned: [{ key: 'humanidad', max: 'humanidad_max' }, { key: 'trauma' }], statline: 'atributos', excerpt: 'trauma' } }
    const items = ['categories', 0, 'sections', 0, 'items']
    expect(removeNode(draft, items, 2).card).toEqual({ pinned: [{ key: 'humanidad' }, { key: 'trauma' }], statline: 'atributos', excerpt: 'trauma' })
    expect(removeNode(draft, items, 3).card).toEqual({ pinned: [{ key: 'humanidad', max: 'humanidad_max' }], statline: 'atributos' })
    expect(removeNode(draft, items, 0).card).toEqual({ pinned: [{ key: 'humanidad', max: 'humanidad_max' }, { key: 'trauma' }], excerpt: 'trauma' })
  })
})
