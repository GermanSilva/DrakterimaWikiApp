import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { resolveSheet } from './resolveSheet'
import type { Sheet } from './sheetModel'
import SheetView from './SheetView'

const field = (key: string, label: string) => ({ kind: 'field', key, label, type: 'number', editableBy: 'dm' })
const section = (key: string, label: string, items: Record<string, unknown>[]) => ({
  key,
  label,
  items,
  blocks: [{ key: `b_${key}`, mode: 'tile', items: items.map((item) => item.key) }],
})
const sheet = {
  categories: [{ key: 'c', label: 'C', sections: [section('uno', 'Uno', [field('fuerza', 'Fuerza')]), section('dos', 'Dos', [field('destreza', 'Destreza')])] }],
  roles: {},
} as unknown as Sheet
const resolved = () => resolveSheet(sheet, { fuerza: 12, destreza: 14 })

describe('SheetView: collapsible sections (S41)', () => {
  it('starts with every section expanded, its header a toggle button', () => {
    render(<SheetView resolved={resolved()} unread={{}} />)
    const uno = screen.getByRole('button', { name: 'Uno' })
    expect(uno).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Dos' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Fuerza')).toBeVisible()
    expect(screen.getByText('Destreza')).toBeVisible()
    const content = document.getElementById(uno.getAttribute('aria-controls') as string)
    expect(content).not.toBeNull()
    expect(content).toContainElement(screen.getByText('Fuerza'))
  })

  it('collapses and expands one section from its header, leaving the others alone', () => {
    render(<SheetView resolved={resolved()} unread={{}} />)
    const uno = screen.getByRole('button', { name: 'Uno' })
    fireEvent.click(uno)
    expect(uno).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Fuerza')).not.toBeVisible()
    expect(screen.getByText('Destreza')).toBeVisible()
    fireEvent.click(uno)
    expect(uno).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Fuerza')).toBeVisible()
  })

  it('keeps the section anchor and the unread dot on the header', () => {
    const { container } = render(<SheetView resolved={resolved()} unread={{ uno: true }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Uno' }))
    expect(container.querySelector('#pj-section-uno')).not.toBeNull()
    expect(container.querySelector('#pj-section-uno .unread-dot')).not.toBeNull()
    expect(container.querySelector('#pj-section-dos .unread-dot')).toBeNull()
  })

  it('expands a collapsed section when the nav asks to reveal it', () => {
    const { rerender } = render(<SheetView resolved={resolved()} unread={{}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Uno' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dos' }))
    rerender(<SheetView resolved={resolved()} unread={{}} reveal={{ key: 'uno', n: 1 }} />)
    expect(screen.getByRole('button', { name: 'Uno' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Dos' })).toHaveAttribute('aria-expanded', 'false')
    // asking again after the user collapsed it expands it again
    fireEvent.click(screen.getByRole('button', { name: 'Uno' }))
    rerender(<SheetView resolved={resolved()} unread={{}} reveal={{ key: 'uno', n: 2 }} />)
    expect(screen.getByRole('button', { name: 'Uno' })).toHaveAttribute('aria-expanded', 'true')
  })
})
