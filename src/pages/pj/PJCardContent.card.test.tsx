import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { validateSheet, type Sheet } from '../../campaign/system/sheet/sheetModel'
import { PJCardContent } from './PJCardContent'

// odd/tasks/ficha-indice-lateral.md S12-S13: the card shows identity, bound roles, up to 4 pinned fields, the stat line, the excerpt.

const f = (key: string, label: string, type = 'number') => ({ kind: 'field', key, label, type, editableBy: 'dm' })
const raw = (card?: unknown) => ({
  categories: [
    {
      key: 'c',
      label: 'C',
      sections: [
        {
          key: 's',
          label: 'S',
          items: [
            { kind: 'table', type: 'stat', key: 'atributos', label: 'Atributos', rows: [{ key: 'ref', label: 'REF', modifier: '{valor}', editableBy: 'dm' }, { key: 'cue', label: 'CUE', modifier: '{valor}', editableBy: 'dm' }] },
            f('vida', 'Vida'),
            f('vida_act', 'Vida actual'),
            f('humanidad', 'Humanidad'),
            f('humanidad_max', 'Humanidad máx.'),
            f('sp', 'SP cuerpo'),
            f('rep', 'Reputación'),
            f('deuda', 'Deuda'),
            f('extra', 'Extra'),
            f('motivo', 'Motivación', 'paragraph'),
          ],
          blocks: [],
        },
      ],
    },
  ],
  roles: { hp: 'vida', hp_current: 'vida_act' },
  ...(card ? { card } : {}),
})
const sheetOf = (card?: unknown): Sheet => {
  const result = validateSheet(raw(card))
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.sheet
}
const CARD = {
  pinned: [{ key: 'humanidad', max: 'humanidad_max' }, { key: 'deuda', dmOnly: true }, { key: 'sp' }, { key: 'rep' }, { key: 'extra' }],
  statline: 'atributos',
  excerpt: 'motivo',
}
const PJ = { id: 9, nombre: 'Nadia Okoye', jugador: 'Lucas', vida: 40, vida_act: 35, humanidad: 42, humanidad_max: 60, sp: 9, rep: 3, deuda: 850, extra: 1, ref: 8, cue: 7, motivo: 'Pagar la deuda.', trasfondo: 'Ex seguridad.' }

const facts = () => within(screen.getByRole('list', { name: 'Datos clave' })).getAllByRole('listitem').map((li) => li.textContent)

describe('PJCardContent with a configured card', () => {
  it('shows roles then the first 4 pinned fields the DM may see, the stat line and the excerpt', () => {
    render(<PJCardContent pj={PJ} sheet={sheetOf(CARD)} isDM />)
    expect(facts()).toEqual(['HP35/40', 'Humanidad42/60', 'Deuda850', 'SP cuerpo9', 'Reputación3'])
    expect(screen.getByText('Pagar la deuda.')).toBeTruthy()
    expect(screen.queryByText('Ex seguridad.')).toBeNull()
    const line = screen.getByRole('list', { name: 'Línea de stats' })
    expect(within(line).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['REF8', 'CUE7'])
  })

  it('a player does not see DM-only pins; the next pin takes its place', () => {
    render(<PJCardContent pj={PJ} sheet={sheetOf(CARD)} />)
    expect(facts()).toEqual(['HP35/40', 'Humanidad42/60', 'SP cuerpo9', 'Reputación3', 'Extra1'])
  })

  it('without an excerpt shows the background, without a stat line draws none', () => {
    render(<PJCardContent pj={PJ} sheet={sheetOf({ pinned: [] })} />)
    expect(screen.getByText('Ex seguridad.')).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Línea de stats' })).toBeNull()
  })
})
