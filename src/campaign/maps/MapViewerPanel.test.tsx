import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { entity } from '../testing/renderSection'
import { WikiPortContext, type WikiPort } from '../../ports'
import { CampaignContext } from '../CampaignContext'
import { EntityFormContext, type EntityFormApi, type EntityFormRequest } from '../entityFormContext'
import { MapViewerPanel, type MapViewerPanelProps } from './MapViewerPanel'

// jsdom cannot draw tiles: the canvas is a double that exposes the ghost pin and fires the canvas callbacks
vi.mock('./LeafletCanvas', async () => {
  const { createElement: h } = await import('react')
  return {
    default: (props: {
      points: { id: number; nombre: string }[]
      ghost: { x: number; y: number } | null
      onPlace: (c: { x: number; y: number }) => void
      onPointClick: (id: number, at: { x: number; y: number }) => void
    }) =>
      h(
        'div',
        { 'data-testid': 'canvas', 'data-ghost': props.ghost ? `${props.ghost.x},${props.ghost.y}` : '' },
        ...props.points.map((p) => h('button', { key: p.id, onClick: () => props.onPointClick(p.id, { x: 120, y: 160 }) }, `pin ${p.nombre}`)),
        h('button', { onClick: () => props.onPlace({ x: 0.25, y: 0.75 }) }, 'place pin'),
      ),
  }
})

class FakeImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  naturalWidth = 2000
  naturalHeight = 1000
  set src(_url: string) {
    queueMicrotask(() => this.onload?.())
  }
}
beforeEach(() => {
  vi.stubGlobal('Image', FakeImage)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const row = (id: number, over: Record<string, unknown> = {}) => entity(id, over)
const mapa = row(1, { nombre: 'Mundo', imagen_url: 'https://img.test/m.png' })
const punto = (id: number, over: Record<string, unknown> = {}) =>
  row(id, { map_id: 1, nombre: `Punto ${id}`, descripcion: '', x: 0.5, y: 0.5, link_type: null, link_id: null, ...over })

const wikiPort = (over: Partial<WikiPort> = {}): WikiPort => ({
  pending: () => false,
  resolve: () => null,
  navigate: vi.fn(),
  search: () => [],
  ...over,
})

function setup({ isDM = true, wiki = wikiPort(), ...props }: Partial<MapViewerPanelProps> & { isDM?: boolean; wiki?: WikiPort } = {}) {
  const openForm = vi.fn<(request: EntityFormRequest) => void>()
  const api: EntityFormApi = { openForm, closeForm: vi.fn() }
  const onOpenMap = vi.fn()
  const campaign = { campaign: { id: 'c' }, role: isDM ? 'dm' : 'player', isDM, myCharacterIds: [], reload: vi.fn() }
  render(
    <MemoryRouter>
      <CampaignContext.Provider value={campaign as never}>
        <EntityFormContext.Provider value={api}>
          <WikiPortContext.Provider value={wiki}>
            <MapViewerPanel
              map={mapa}
              points={[punto(1), punto(2, { link_type: 'lugar', link_id: 5 })]}
              pointsError={false}
              onRetryPoints={vi.fn()}
              maps={[mapa]}
              crumbs={[]}
              allMapsTo="/c/demo/mapas?todos=1"
              onOpenMap={onOpenMap}
              onMapRemoved={vi.fn()}
              {...props}
            />
          </WikiPortContext.Provider>
        </EntityFormContext.Provider>
      </CampaignContext.Provider>
    </MemoryRouter>,
  )
  return { openForm, onOpenMap, wiki }
}

const openPopup = async (name: string) => {
  fireEvent.click(await screen.findByRole('button', { name: `pin ${name}` }))
  return screen.findByRole('dialog', { name })
}
const escape = () => fireEvent.keyDown(document, { key: 'Escape' })
const ghost = () => screen.getByTestId('canvas').getAttribute('data-ghost')
async function placeGhost() {
  fireEvent.click(await screen.findByRole('button', { name: '+ Agregar punto' }))
  fireEvent.click(screen.getByRole('button', { name: 'place pin' }))
  expect(ghost()).toBe('0.25,0.75')
}

describe('MapViewerPanel popup link resolution', () => {
  it('an article link resolves through the wiki port and opens the article, closing the popup', async () => {
    const wiki = wikiPort({ resolve: (letter, id) => (letter === 'G' && id === 5 ? { title: 'Torre', section: 'Lugar', table: 'lugares' } : null) })
    setup({ wiki })
    await openPopup('Punto 2')
    fireEvent.click(screen.getByRole('button', { name: /Ver art/ }))
    expect(wiki.navigate).toHaveBeenCalledWith('lugares', 5)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('an unresolved target is reported missing once its index is loaded', async () => {
    setup()
    await openPopup('Punto 2')
    expect(screen.getByText(/no est/)).toBeInTheDocument()
  })

  it('shows no missing note while the index that resolves the link is still pending', async () => {
    setup({ wiki: wikiPort({ pending: () => true }) })
    await openPopup('Punto 2')
    expect(screen.queryByText(/no est/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Ver art/ })).toBeNull()
  })

  it('a map link opens the visible target map; a missing target or a pin to its own map has no action', async () => {
    const target = row(2, { nombre: 'Sotano' })
    const points = [punto(1, { link_type: 'mapa', link_id: 2 }), punto(2, { link_type: 'mapa', link_id: 9 }), punto(3, { link_type: 'mapa', link_id: 1 })]
    const { onOpenMap } = setup({ points, maps: [mapa, target] })
    await openPopup('Punto 1')
    fireEvent.click(screen.getByRole('button', { name: 'Abrir mapa' }))
    expect(onOpenMap).toHaveBeenCalledWith(2)
    expect(screen.queryByRole('dialog')).toBeNull()
    await openPopup('Punto 2')
    expect(screen.getByText(/no est/)).toBeInTheDocument()
    await openPopup('Punto 3')
    expect(screen.queryByRole('button', { name: 'Abrir mapa' })).toBeNull()
  })

  it('ignores a link whose type is unknown or whose id is not an integer', async () => {
    setup({ points: [punto(1, { link_type: 'constructor', link_id: 1 }), punto(2, { link_type: 'lugar', link_id: 1.5 })] })
    await openPopup('Punto 1')
    expect(screen.queryByText(/no est/)).toBeNull()
    await openPopup('Punto 2')
    expect(screen.queryByText(/no est/)).toBeNull()
  })

  it('the DM edit button opens the point form and closes the popup', async () => {
    const { openForm } = setup()
    await openPopup('Punto 1')
    fireEvent.click(screen.getByRole('button', { name: 'Editar punto' }))
    expect(openForm).toHaveBeenCalledWith({ type: 'map_points', id: 1 })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('MapViewerPanel Escape and ghost pin', () => {
  it('Escape closes the popup first, then the ghost pin, then add mode', async () => {
    setup()
    await placeGhost()
    await openPopup('Punto 1')
    escape()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(ghost()).toBe('0.25,0.75')
    escape()
    expect(ghost()).toBe('')
    expect(screen.getByRole('button', { name: /Cancelar/ })).toHaveAttribute('aria-pressed', 'true')
    escape()
    expect(screen.getByRole('button', { name: '+ Agregar punto' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('Escape while the point form is open leaves the ghost pin where it was', async () => {
    const { openForm } = setup()
    await placeGhost()
    fireEvent.click(screen.getByRole('button', { name: /Confirmar/ }))
    expect(openForm).toHaveBeenCalledWith(expect.objectContaining({ type: 'map_points', prefill: { map_id: 1, x: 0.25, y: 0.75 } }))
    // the form modal is on screen
    const modal = document.body.appendChild(document.createElement('div'))
    modal.setAttribute('aria-modal', 'true')
    escape()
    expect(ghost()).toBe('0.25,0.75')
    modal.remove()
    escape() // with the form gone, Escape works on the ghost pin again
    expect(ghost()).toBe('')
  })

  it('the ghost pin survives opening (and so cancelling) the form and ends only with a successful save', async () => {
    const { openForm } = setup()
    await placeGhost()
    fireEvent.click(screen.getByRole('button', { name: /Confirmar/ }))
    expect(ghost()).toBe('0.25,0.75') // opening the form does not end the placement
    const request = openForm.mock.calls[0][0]
    act(() => request.onSaved?.(punto(7)))
    expect(ghost()).toBe('')
    expect(screen.getByRole('button', { name: '+ Agregar punto' })).toHaveAttribute('aria-pressed', 'false')
  })
})
