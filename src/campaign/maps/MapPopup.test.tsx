import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { FlatEntity } from '../../data'
import { entity } from '../testing/renderSection'
import { MapPopup, type PopupLink } from './MapPopup'

const point = (over: Record<string, unknown> = {}): FlatEntity =>
  entity(1, { map_id: 1, nombre: 'Faro', descripcion: 'Guia a los barcos', link_type: 'lugar', link_id: 5, ...over })

const ACTIONS = /Ver art|Abrir mapa/

function setup(link: PopupLink | null, { isDM = false, pt = point() }: { isDM?: boolean; pt?: FlatEntity } = {}) {
  const onEdit = vi.fn()
  const onClose = vi.fn()
  const view = render(<MapPopup point={pt} link={link} isDM={isDM} onEdit={onEdit} onClose={onClose} />)
  return { onEdit, onClose, ...view }
}

describe('MapPopup', () => {
  it('shows the point as text and closes on demand', () => {
    const { onClose } = setup(null, { pt: point({ nombre: '<b>Faro</b>' }) })
    const dialog = screen.getByRole('dialog', { name: '<b>Faro</b>' })
    expect(dialog).toHaveTextContent('<b>Faro</b>')
    expect(dialog.querySelector('b')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('an article link shows its section, a different title and an https image, and opens the article', () => {
    const onOpen = vi.fn()
    setup({ kind: 'article', section: 'Lugar', title: 'Torre del Faro', imageUrl: 'https://img.test/t.png', onOpen })
    expect(screen.getByText('Lugar')).toBeInTheDocument()
    expect(screen.getByText('Torre del Faro')).toBeInTheDocument()
    expect(document.querySelector('img')).toHaveAttribute('src', 'https://img.test/t.png')
    fireEvent.click(screen.getByRole('button', { name: /Ver art/ }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('never loads a non-https article image and does not repeat a title equal to the point name', () => {
    setup({ kind: 'article', section: 'Lugar', title: 'Faro', imageUrl: 'http://img.test/t.png', onOpen: vi.fn() })
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getAllByText('Faro')).toHaveLength(1)
  })

  it('a map link offers to open the map', () => {
    const onOpen = vi.fn()
    setup({ kind: 'map', title: 'Sotano', onOpen })
    fireEvent.click(screen.getByRole('button', { name: 'Abrir mapa' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('a missing target says so without any action', () => {
    setup({ kind: 'missing' })
    expect(screen.getByText(/no est/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: ACTIONS })).toBeNull()
  })

  it.each([[{ kind: 'pending' } as PopupLink], [null]])('a pending or absent link (%j) shows neither a note nor an action', (link) => {
    setup(link)
    expect(screen.queryByText(/no est/)).toBeNull()
    expect(screen.queryByRole('button', { name: ACTIONS })).toBeNull()
  })

  it('only the DM gets the edit button', () => {
    const { onEdit, unmount } = setup(null, { isDM: true })
    fireEvent.click(screen.getByRole('button', { name: 'Editar punto' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    unmount()
    setup(null)
    expect(screen.queryByRole('button', { name: 'Editar punto' })).toBeNull()
  })
})
