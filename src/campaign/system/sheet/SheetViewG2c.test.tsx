/** G2c: how SheetView draws action categories and economy tables. */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { resolveSheet } from './resolveSheet'
import type { Sheet } from './sheetModel'
import SheetView from './SheetView'

type Loose = Record<string, unknown>

const acciones: Loose = {
  kind: 'table',
  type: 'habilidad',
  key: 'acciones',
  label: 'Acciones',
  editableBy: 'dm',
  columns: [
    { key: 'nombre', label: 'Nombre', type: 'short', editableBy: 'dm' },
    { key: 'categoria', label: 'Categoría', type: 'short', editableBy: 'dm' },
    { key: 'descripcion', label: 'Descripción', type: 'short', editableBy: 'dm' },
  ],
  categories: [{ key: 'trucos', label: 'Trucos' }, { key: 'nivel_1', label: 'Nivel 1' }],
}
const dinero: Loose = {
  kind: 'table',
  type: 'monedas',
  key: 'dinero',
  label: 'Dinero',
  rows: [{ key: 'oro', label: 'Oro', value: 100 }, { key: 'bronce', label: 'Bronce', value: 1 }],
}
const caja: Loose = { kind: 'table', type: 'economia', key: 'caja', label: 'Caja fuerte', editableBy: 'dm' }

const draw = (items: Loose[], blocks: Loose[], pj: Loose) => {
  const sheet = { categories: [{ key: 'c', label: 'C', sections: [{ key: 's', label: 'S', items, blocks }] }], roles: {} } as unknown as Sheet
  return render(<SheetView resolved={resolveSheet(sheet, pj)} unread={{}} />)
}

describe('SheetView: action categories', () => {
  const block = { key: 'b', mode: 'modal', items: ['acciones'], filterCategories: ['nivel_1', 'trucos'] }
  const pj = { acciones: [{ nombre: 'Luz', categoria: 'trucos', descripcion: 'Ilumina' }, { nombre: 'Rayo', categoria: 'nivel_1' }, { nombre: 'Rara', categoria: 'otro_tipo' }] }

  it('titles each group with the declared label, in declared order, with Otras last, and lists the rows as buttons', () => {
    const { container } = draw([acciones], [block], pj)
    const titles = [...container.querySelectorAll('div')].map((d) => d.textContent).filter((t) => ['Trucos', 'Nivel 1', 'Otras'].includes(t ?? ''))
    expect(titles).toEqual(['Trucos', 'Nivel 1', 'Otras'])
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Luz', 'Rayo', 'Rara'])
    expect(screen.queryByText('nivel_1')).toBeNull()
  })

  it('opens the row with the category label in its heading, and the raw text for a row of Otras', () => {
    draw([acciones], [block], pj)
    fireEvent.click(screen.getByText('Luz'))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Trucos')).toBeTruthy()
    expect(within(dialog).queryByText('trucos')).toBeNull()
    expect(within(dialog).getByText('Ilumina')).toBeTruthy()
    fireEvent.click(within(dialog).getByLabelText('Cerrar'))
    fireEvent.click(screen.getByText('Rara'))
    expect(within(screen.getByRole('dialog')).getByText('otro_tipo')).toBeTruthy()
  })

  it('draws nothing for a block with no rows', () => {
    const { container } = draw([acciones], [block], {})
    expect(container.querySelector('[data-sheet-view]')?.textContent).toBe('')
  })

  it('keeps drawing free text categories as before for a table without declared categories', () => {
    const plain = { ...acciones, categories: undefined }
    draw([plain], [{ ...block, filterCategories: ['Trucos'] }], { acciones: [{ nombre: 'Luz', categoria: 'Trucos' }, { nombre: 'Oculta', categoria: 'Otro' }] })
    expect(screen.getByText('Trucos')).toBeTruthy()
    expect(screen.getByText('Luz')).toBeTruthy()
    expect(screen.queryByText('Oculta')).toBeNull()
    expect(screen.queryByText('Otras')).toBeNull()
  })
})

describe('SheetView: economy tables', () => {
  const blocks = [{ key: 'b', mode: 'plano', items: ['dinero', 'caja'] }]

  it('draws the table label, the amounts by value descending and the total in the smallest denomination', () => {
    draw([dinero, caja], blocks, { caja: { bronce: 5, oro: 2 } })
    const title = screen.getByText('Caja fuerte')
    const group = title.parentElement as HTMLElement
    expect(group.textContent).toBe('Caja fuerteOro 2Bronce 5Total: 205 Bronce')
  })

  it('draws the coins block (carried) and each economy table separately', () => {
    draw([dinero, caja], blocks, { monedas: { oro: 1 }, caja: { bronce: 3 } })
    expect(screen.getByText('En mano')).toBeTruthy()
    expect(screen.getByText('Total: 100 Bronce')).toBeTruthy()
    expect(screen.getByText('Total: 3 Bronce')).toBeTruthy()
  })

  it('draws nothing for an economy table without amounts, or when the section has nothing else', () => {
    const { container } = draw([dinero, caja], blocks, { caja: { ghost: 4 } })
    expect(screen.queryByText('Caja fuerte')).toBeNull()
    expect(container.querySelector('[data-sheet-view]')?.textContent).toBe('')
  })
})
