import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UnreadPortContext, type UnreadPort } from '../../ports'
import type { Sheet } from '../../campaign/system/sheet/sheetModel'
import PJDetail from './PJDetail'

vi.mock('../../components/PlayerNotes', () => ({ default: () => null }))

const section = (key: string, label: string, field: string) => ({
  key,
  label,
  items: [{ kind: 'field', key: field, label: field, type: 'number', editableBy: 'dm' }],
  blocks: [{ key: `b_${key}`, mode: 'tile', items: [field] }],
})
const SHEET = { categories: [{ key: 'c', label: 'C', sections: [section('uno', 'Uno', 'fuerza'), section('dos', 'Dos', 'destreza')] }], roles: {} } as unknown as Sheet
const port: UnreadPort = { isUnread: () => false, markRead: vi.fn() }
const PJ = { id: 1, nombre: 'Ana', jugador: 'Pepe', fuerza: 12, destreza: 14 }

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} })
  window.scrollTo = vi.fn() as typeof window.scrollTo
  window.history.replaceState(null, '', '/')
  localStorage.clear()
})

describe('PJDetail: nav to a collapsed sheet section (S41)', () => {
  it('expands the section the index link points to', () => {
    render(
      <UnreadPortContext.Provider value={port}>
        <PJDetail pj={PJ} back={<span>volver</span>} sheet={SHEET} />
      </UnreadPortContext.Provider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Uno', expanded: true }))
    expect(screen.getByRole('button', { name: 'Uno', expanded: false })).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Índice de la ficha' })).getByRole('link', { name: 'Uno' }))
    expect(screen.getByRole('button', { name: 'Uno', expanded: true })).toBeInTheDocument()
  })
})

describe('PJDetail: the section nav is the side index (ficha-indice-lateral S1, replaces the S41 scroll strip)', () => {
  it('lists every section in the index', () => {
    render(
      <UnreadPortContext.Provider value={port}>
        <PJDetail pj={PJ} back={<span>volver</span>} sheet={SHEET} />
      </UnreadPortContext.Provider>,
    )
    const nav = screen.getByRole('navigation', { name: 'Índice de la ficha' })
    expect(within(nav).getByRole('link', { name: 'Uno' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Dos' })).toBeInTheDocument()
  })
})
