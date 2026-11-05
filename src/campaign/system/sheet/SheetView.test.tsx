import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { resolveSheet } from './resolveSheet'
import type { Sheet } from './sheetModel'
import SheetView from './SheetView'

const field = (key: string, label: string, extra: Record<string, unknown> = {}) => ({ kind: 'field', key, label, type: 'number', editableBy: 'dm', ...extra })
const section = (key: string, mode: string, items: Record<string, unknown>[]) => ({
  key,
  label: key.toUpperCase(),
  items,
  blocks: [{ key: `b_${key}`, mode, items: items.map((i) => i.key) }],
})
const sheet = {
  categories: [
    {
      key: 'c',
      label: 'C',
      sections: [
        section('tiles', 'tile', [field('base', 'Base', { editableBy: 'player' }), field('oculto_t', 'Secreto tile', { formula: '{base} * 2', hidden: true }), field('texto', 'Dados', { type: 'short', formula: '"1d8 (" & {oculto_t} & ")"' })]),
        section('plano', 'plano', [field('oculto_p', 'Secreto plano', { formula: '1', hidden: true }), field('visible_p', 'Visible plano', { formula: '{oculto_p} + 1' })]),
        section('solo', 'tile', [field('oculto_s', 'Secreto solo', { formula: '1', hidden: true })]),
      ],
    },
  ],
  roles: {},
} as unknown as Sheet

describe('SheetView: hidden fields (S21) and text formula fields (S24)', () => {
  const view = () => render(<SheetView resolved={resolveSheet(sheet, { base: 4 })} unread={{}} />)

  it('does not draw a hidden field, in a tile block or a plain block', () => {
    view()
    expect(screen.queryByText('Secreto tile')).toBeNull()
    expect(screen.queryByText('Secreto plano')).toBeNull()
    expect(screen.getByText('Base')).toBeTruthy()
    expect(screen.getByText('Visible plano')).toBeTruthy()
  })

  it('still draws the fields that read a hidden one, with their computed value', () => {
    view()
    expect(screen.getByText('1d8 (8)')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('draws no section whose fields are all hidden', () => {
    const { container } = view()
    expect(screen.queryByText('Secreto solo')).toBeNull()
    expect(container.querySelector('#pj-section-solo')).toBeNull()
    expect(container.querySelector('#pj-section-tiles')).not.toBeNull()
  })
})
