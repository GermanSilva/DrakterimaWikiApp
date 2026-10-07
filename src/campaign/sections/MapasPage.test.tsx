import { act, configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { here } from '../../app/testing/renderApp'
import type { WikiIndexItem } from '../../data'
import type { EntityFormRequest } from '../entityFormContext'
import { createFakeLayer } from '../testing/fakeLayer'
import { entity, renderSection } from '../testing/renderSection'

configure({ asyncUtilTimeout: 5000 })
// the real router + campaign shell + form host make the DM flows slower than the default 5s on a loaded machine
vi.setConfig({ testTimeout: 20000 })

// jsdom cannot draw tiles: the Leaflet canvas is replaced by a double that exposes exactly what the page hands it
// (image, size, pins, ghost) and lets a test fire the canvas callbacks (pin click, map click / place, ghost drag).
vi.mock('../maps/LeafletCanvas', async () => {
  const { createElement: h } = await import('react')
  return {
    default: (props: {
      imageUrl: string | null
      size: { w: number; h: number }
      points: { id: number; nombre: string; color: string; opacity: number; x: number; y: number }[]
      addMode: boolean
      ghost: { x: number; y: number } | null
      onBackgroundClick: () => void
      onPlace: (c: { x: number; y: number }) => void
      onGhostMove: (c: { x: number; y: number }) => void
      onPointClick: (id: number, at: { x: number; y: number }) => void
    }) =>
      h(
        'div',
        {
          'data-testid': 'canvas',
          'data-image': props.imageUrl ?? '',
          'data-size': `${props.size.w}x${props.size.h}`,
          'data-addmode': String(props.addMode),
          'data-ghost': props.ghost ? `${props.ghost.x},${props.ghost.y}` : '',
        },
        ...props.points.map((p) =>
          h('button', { key: p.id, 'data-opacity': p.opacity, 'data-color': p.color, onClick: () => props.onPointClick(p.id, { x: 120, y: 160 }) }, `pin ${p.nombre}`),
        ),
        h('button', { onClick: () => props.onBackgroundClick() }, 'click map'),
        h('button', { onClick: () => props.onPlace({ x: 0.25, y: 0.75 }) }, 'place pin'),
        h('button', { onClick: () => props.onPlace({ x: 2, y: 0.3 }) }, 'place outside pin'),
        h('button', { onClick: () => props.onPlace({ x: 0.5, y: Number.NaN }) }, 'place NaN pin'),
        h('button', { onClick: () => props.onGhostMove({ x: 0.5, y: 0.1 }) }, 'drag ghost'),
      ),
  }
})

const openFormSpy = vi.fn<(request: EntityFormRequest) => void>()
vi.mock('../entityFormContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../entityFormContext')>()
  return {
    ...actual,
    useEntityForm: () => {
      const api = actual.useEntityForm()
      return { ...api, openForm: (request: EntityFormRequest) => { openFormSpy(request); api.openForm(request) } }
    },
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
  openFormSpy.mockClear()
  vi.unstubAllGlobals()
})

const indexItem = (id: number, title: string): WikiIndexItem => ({ id, title, imagen_url: null, estado: 'publicado' })
const mapa = (id: number, over: Record<string, unknown> = {}) =>
  entity(id, { nombre: `Mapa ${id}`, imagen_url: 'https://img.test/mapa.png', is_default: false, descripcion: '', ...over })
const punto = (id: number, mapId: number, over: Record<string, unknown> = {}) =>
  entity(id, { map_id: mapId, nombre: `Punto ${id}`, descripcion: '', x: 0.5, y: 0.5, link_type: null, link_id: null, ...over })

const main = () => within(screen.getByRole('main'))
const crumbs = () => screen.getByRole('navigation', { name: 'Ruta de mapas' })
const openPopup = async (name: string) => {
  fireEvent.click(await screen.findByRole('button', { name: `pin ${name}` }))
  return screen.findByRole('dialog', { name })
}

describe('Mapas grid and default map', () => {
  it('lists the maps as links to the viewer (image only when https), with DM actions', async () => {
    const { layer } = createFakeLayer({ entities: { mapas: [mapa(1, { descripcion: 'El continente' }), mapa(2, { imagen_url: 'http://insecure.test/x.png', estado: 'borrador' })] } })
    renderSection('/c/demo/mapas?todos=1', { layer })
    expect(await screen.findByRole('heading', { level: 1, name: 'Mapas' })).toBeInTheDocument()
    const cards = await waitFor(() => {
      const found = main().getAllByRole('link').filter((a) => /\/mapas\/\d+$/.test(a.getAttribute('href') ?? ''))
      expect(found).toHaveLength(2)
      return found
    })
    expect(cards[0]).toHaveAttribute('href', '/c/demo/mapas/1')
    expect(within(cards[0]).getByText('El continente')).toBeInTheDocument()
    expect(cards[0].querySelector('img')).toHaveAttribute('src', 'https://img.test/mapa.png')
    expect(cards[1].querySelector('img')).toBeNull() // http image: never loaded
    expect(within(cards[1]).getByText('Borrador')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo mapa' }))
    expect(openFormSpy).toHaveBeenCalledWith({ type: 'mapas' })
  })

  it('a player has no create button and an empty state', async () => {
    const { layer } = createFakeLayer({ entities: { mapas: [] } })
    renderSection('/c/demo/mapas', { layer, isDM: false })
    expect(await screen.findByText('No hay mapas disponibles.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Nuevo mapa' })).toBeNull()
  })

  it('opens the default map when entering the section (replacing the entry) and keeps the grid reachable', async () => {
    const { layer } = createFakeLayer({ entities: { mapas: [mapa(1), mapa(2, { is_default: true })] } })
    const { router } = renderSection('/c/demo/mapas', { layer })
    expect(await screen.findByTestId('canvas')).toBeInTheDocument()
    expect(here(router)).toBe('/c/demo/mapas/2')
    expect(within(crumbs()).getByText('Mapa 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: /Todos los mapas/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Mapas' })).toBeInTheDocument()
    expect(here(router)).toBe('/c/demo/mapas?todos=1')
    expect(screen.queryByTestId('canvas')).toBeNull() // no redirect back to the default
  })

  it('a default map the player cannot see does not redirect them', async () => {
    const { layer } = createFakeLayer({ entities: { mapas: [mapa(1), mapa(2, { is_default: true, estado: 'borrador' })] } })
    renderSection('/c/demo/mapas', { layer, isDM: false })
    expect(await screen.findByRole('heading', { level: 1, name: 'Mapas' })).toBeInTheDocument()
    expect(main().getAllByRole('link').filter((a) => /\/mapas\/\d+$/.test(a.getAttribute('href') ?? ''))).toHaveLength(1)
  })

  it('a failed load is retryable', async () => {
    const { layer, spies } = createFakeLayer({ entities: { mapas: [mapa(1)] } })
    spies.entityList.mockRejectedValueOnce(new Error('down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderSection('/c/demo/mapas', { layer })
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los mapas')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await main().findByRole('link', { name: /Mapa 1/ })).toBeInTheDocument()
    errorSpy.mockRestore()
  })
})

describe('Mapas viewer (URL driven)', () => {
  it('measures the image and hands the canvas the plane size, https image and the pins of THIS map only', async () => {
    const { layer } = createFakeLayer({
      entities: { mapas: [mapa(1), mapa(2)], map_points: [punto(1, 1, { link_type: 'lugar', link_id: 5 }), punto(2, 2), punto(3, 1)] },
    })
    renderSection('/c/demo/mapas/1', { layer })
    const canvas = await screen.findByTestId('canvas')
    expect(canvas).toHaveAttribute('data-size', '1000x500')
    expect(canvas).toHaveAttribute('data-image', 'https://img.test/mapa.png')
    const pins = await screen.findAllByRole('button', { name: /^pin / })
    expect(pins.map((p) => p.textContent)).toEqual(['pin Punto 1', 'pin Punto 3'])
    expect(pins[0]).toHaveAttribute('data-color', '#dc2626') // lugar
    expect(pins[1]).toHaveAttribute('data-color', '#e5e7eb') // no link
  })

  it('shows not-found for an unknown id, a malformed id and (for a player) a hidden map, without DM reads', async () => {
    const { layer, spies } = createFakeLayer({ entities: { mapas: [mapa(1), mapa(2, { estado: 'borrador' })] } })
    const { router } = renderSection('/c/demo/mapas/77', { layer, isDM: false })
    expect(await screen.findByRole('heading', { level: 1, name: 'Mapa no encontrado' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Volver' })).toHaveAttribute('href', '/c/demo/mapas?todos=1')
    await act(async () => {
      await router.navigate('/c/demo/mapas/abc')
    })
    expect(await screen.findByText(/no corresponde a ningún mapa/)).toBeInTheDocument()
    await act(async () => {
      await router.navigate('/c/demo/mapas/2')
    })
    expect(await screen.findByText(/ya no existe o no podés verlo/)).toBeInTheDocument()
    expect(screen.queryByTestId('canvas')).toBeNull()
    expect(spies.dmNotesGet).not.toHaveBeenCalled()
    expect(spies.getVisibility).not.toHaveBeenCalled()
  })

  it('a load failure is retryable', async () => {
    const { layer, spies } = createFakeLayer({ entities: { mapas: [mapa(1)] } })
    spies.entityList.mockRejectedValueOnce(new Error('down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderSection('/c/demo/mapas/1', { layer })
    expect(await screen.findByRole('alert')).toHaveTextContent('problema de conexión')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByTestId('canvas')).toBeInTheDocument()
    errorSpy.mockRestore()
  })

  it('a map without image, or with a non-https image, renders without background and says so', async () => {
    const { layer } = createFakeLayer({ entities: { mapas: [mapa(1, { imagen_url: 'http://insecure.test/a.png' }), mapa(2, { imagen_url: '' })] } })
    const { router } = renderSection('/c/demo/mapas/1', { layer })
    const canvas = await screen.findByTestId('canvas')
    expect(canvas).toHaveAttribute('data-image', '')
    expect(canvas).toHaveAttribute('data-size', '1000x1000')
    expect(screen.getByText(/debe ser una URL https/)).toBeInTheDocument()
    await act(async () => {
      await router.navigate('/c/demo/mapas/2')
    })
    expect(await screen.findByTestId('canvas')).toHaveAttribute('data-image', '')
    expect(screen.queryByText(/debe ser una URL https/)).toBeNull()
  })

  it('an image that fails to load keeps the pins usable and says so', async () => {
    class BrokenImage extends FakeImage {
      set src(_url: string) {
        queueMicrotask(() => this.onerror?.())
      }
    }
    vi.stubGlobal('Image', BrokenImage)
    const { layer } = createFakeLayer({ entities: { mapas: [mapa(1)], map_points: [punto(1, 1)] } })
    renderSection('/c/demo/mapas/1', { layer })
    expect(await screen.findByText('No se pudo cargar la imagen del mapa.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'pin Punto 1' })).toBeInTheDocument()
  })

  it('does not draw pins with unusable coordinates (NaN / text) and never a draft for a player', async () => {
    const { layer } = createFakeLayer({
      entities: {
        mapas: [mapa(1)],
        map_points: [
          punto(1, 1, { x: Number.NaN }),
          punto(2, 1, { y: '0.5' }),
          punto(3, 1, { nombre: 'Borrador', estado: 'borrador' }),
          punto(4, 1, { nombre: 'Secreto', estado: 'secreto' }),
          punto(5, 1, { nombre: 'Bueno' }),
        ],
      },
    })
    renderSection('/c/demo/mapas/1', { layer, isDM: false })
    await screen.findByTestId('canvas')
    const pins = await screen.findAllByRole('button', { name: /^pin / })
    expect(pins.map((p) => p.textContent)).toEqual(['pin Secreto', 'pin Bueno'])
    expect(pins[0]).toHaveAttribute('data-opacity', '1')
  })

  it('the DM sees drafts and secrets faded', async () => {
    const { layer } = createFakeLayer({
      entities: { mapas: [mapa(1)], map_points: [punto(1, 1, { nombre: 'B', estado: 'borrador' }), punto(2, 1, { nombre: 'S', estado: 'secreto' }), punto(3, 1, { nombre: 'P' })] },
    })
    renderSection('/c/demo/mapas/1', { layer })
    await screen.findByTestId('canvas')
    expect((await screen.findAllByRole('button', { name: /^pin / })).map((p) => p.getAttribute('data-opacity'))).toEqual(['0.4', '0.4', '1'])
  })

  it('renders names and descriptions as text, never as markup', async () => {
    const evil = '<img src=x onerror=alert(1)>'
    const { layer } = createFakeLayer({ entities: { mapas: [mapa(1)], map_points: [punto(1, 1, { nombre: evil, descripcion: '<script>alert(2)</script>' })] } })
    renderSection('/c/demo/mapas/1', { layer })
    const popup = await openPopup(evil)
    expect(within(popup).getByText('<script>alert(2)</script>')).toBeInTheDocument()
    expect(document.querySelector('main img[src="x"]')).toBeNull()
    expect(document.querySelector('main script')).toBeNull()
  })
})

describe('Mapas popup and navigation', () => {
  it('a point linked to an article opens it through the wiki port; a hidden article is not named', async () => {
    const { layer } = createFakeLayer({
      entities: {
        mapas: [mapa(1)],
        map_points: [punto(1, 1, { nombre: 'Torre', link_type: 'lugar', link_id: 5 }), punto(2, 1, { nombre: 'Oculto', link_type: 'lugar', link_id: 6 })],
      },
      index: { lugares: [indexItem(5, 'Torre del Mago')] },
    })
    const { router } = renderSection('/c/demo/mapas/1', { layer, isDM: false })
    const popup = await openPopup('Torre')
    expect(within(popup).getByText('Lugar')).toBeInTheDocument()
    fireEvent.click(within(popup).getByRole('button', { name: 'Ver artículo' }))
    expect(here(router)).toBe('/c/demo/lugares/5')

    await act(async () => {
      await router.navigate(-1)
    })
    const hidden = await openPopup('Oculto')
    expect(within(hidden).queryByRole('button', { name: 'Ver artículo' })).toBeNull()
    expect(within(hidden).getByText(/no está disponible/)).toBeInTheDocument()
  })

  it('a popup closes on a map click and on Escape; a player has no edit button, the DM does', async () => {
    const { layer } = createFakeLayer({ entities: { mapas: [mapa(1)], map_points: [punto(1, 1)] } })
    const { unmount } = renderSection('/c/demo/mapas/1', { layer, isDM: false })
    let popup = await openPopup('Punto 1')
    expect(within(popup).queryByRole('button', { name: 'Editar punto' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'click map' }))
    expect(screen.queryByRole('dialog', { name: /Punto 1/ })).toBeNull()
    unmount()

    const dm = createFakeLayer({ entities: { mapas: [mapa(1)], map_points: [punto(1, 1)] } })
    renderSection('/c/demo/mapas/1', { layer: dm.layer })
    popup = await openPopup('Punto 1')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: /Punto 1/ })).toBeNull()
    popup = await openPopup('Punto 1')
    fireEvent.click(within(popup).getByRole('button', { name: 'Editar punto' }))
    expect(openFormSpy).toHaveBeenCalledWith({ type: 'map_points', id: 1 })
  })

  it('navigates a hierarchy through map points: the trail lives in the URL and the browser back works', async () => {
    const { layer } = createFakeLayer({
      entities: {
        mapas: [mapa(1), mapa(2), mapa(3)],
        map_points: [
          punto(1, 1, { nombre: 'Al sótano', link_type: 'mapa', link_id: 2 }),
          punto(2, 2, { nombre: 'A la cripta', link_type: 'mapa', link_id: 3 }),
        ],
      },
    })
    const { router } = renderSection('/c/demo/mapas/1', { layer })
    fireEvent.click(within(await openPopup('Al sótano')).getByRole('button', { name: 'Abrir mapa' }))
    expect(await screen.findByRole('button', { name: 'pin A la cripta' })).toBeInTheDocument()
    expect(here(router)).toBe('/c/demo/mapas/2?trail=1')
    expect(within(crumbs()).getByRole('link', { name: 'Mapa 1' })).toHaveAttribute('href', '/c/demo/mapas/1')
    expect(within(crumbs()).getByText('Mapa 2')).toHaveAttribute('aria-current', 'page')

    fireEvent.click(within(await openPopup('A la cripta')).getByRole('button', { name: 'Abrir mapa' }))
    await waitFor(() => expect(here(router)).toBe('/c/demo/mapas/3?trail=1,2'))
    const ancestors = within(crumbs()).getAllByRole('link')
    expect(ancestors.map((a) => a.getAttribute('href'))).toEqual(['/c/demo/mapas/1', '/c/demo/mapas/2?trail=1'])

    // a breadcrumb entry goes back up, keeping only what came before it
    fireEvent.click(ancestors[1])
    await waitFor(() => expect(here(router)).toBe('/c/demo/mapas/2?trail=1'))

    // browser back / forward walk the same history
    await act(async () => {
      await router.navigate(-1)
    })
    await waitFor(() => expect(here(router)).toBe('/c/demo/mapas/3?trail=1,2'))
    await act(async () => {
      await router.navigate(-1)
    })
    await waitFor(() => expect(here(router)).toBe('/c/demo/mapas/2?trail=1'))
    await act(async () => {
      await router.navigate(-1)
    })
    await waitFor(() => expect(here(router)).toBe('/c/demo/mapas/1'))
    expect(within(crumbs()).queryAllByRole('link')).toHaveLength(0)
  })

  it('a deep link with a trail restores the breadcrumb; unknown, hidden, malformed and self entries do not leak or break', async () => {
    const { layer } = createFakeLayer({ entities: { mapas: [mapa(1), mapa(2), mapa(3, { estado: 'borrador' })] } })
    const { router } = renderSection('/c/demo/mapas/2?trail=3,99,1,2', { layer, isDM: false })
    await screen.findByTestId('canvas')
    expect(within(crumbs()).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/c/demo/mapas/1'])
    expect(within(crumbs()).queryByText('Mapa 3')).toBeNull()
    await act(async () => {
      await router.navigate('/c/demo/mapas/2?trail=1;drop')
    })
    await screen.findByTestId('canvas')
    expect(within(crumbs()).queryAllByRole('link')).toHaveLength(0)
  })

  it('a pin linked to a hidden or missing map says it is unavailable and never navigates', async () => {
    const { layer } = createFakeLayer({
      entities: { mapas: [mapa(1)], map_points: [punto(1, 1, { nombre: 'Puerta', link_type: 'mapa', link_id: 9 }), punto(2, 1, { nombre: 'Yo mismo', link_type: 'mapa', link_id: 1 })] },
    })
    const { router } = renderSection('/c/demo/mapas/1', { layer, isDM: false })
    const popup = await openPopup('Puerta')
    expect(within(popup).queryByRole('button', { name: 'Abrir mapa' })).toBeNull()
    expect(within(popup).getByText(/no está disponible/)).toBeInTheDocument()
    const self = await openPopup('Yo mismo')
    expect(within(self).queryByRole('button', { name: 'Abrir mapa' })).toBeNull()
    expect(here(router)).toBe('/c/demo/mapas/1')
  })
})

describe('Mapas as a player', () => {
  it('has no DM toolbar, never calls a DM read and only gets pins from the (RLS-filtered) lists', async () => {
    const { layer, spies } = createFakeLayer({ entities: { mapas: [mapa(1)], map_points: [punto(1, 1, { nombre: 'Visible' })] } })
    renderSection('/c/demo/mapas/1', { layer, isDM: false })
    await screen.findByTestId('canvas')
    expect(screen.queryByRole('toolbar', { name: 'Herramientas del DM' })).toBeNull()
    expect(screen.queryByRole('button', { name: '+ Agregar punto' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Notas' })).toBeNull()
    expect(await screen.findByRole('button', { name: 'pin Visible' })).toBeInTheDocument()
    expect(spies.entityList.mock.calls.map((c) => c[0]).sort()).toEqual(['map_points', 'mapas'])
    expect(spies.dmNotesGet).not.toHaveBeenCalled()
    expect(spies.dmNotesList).not.toHaveBeenCalled()
    expect(spies.getVisibility).not.toHaveBeenCalled()
  })
})

describe('Mapas DM tools', () => {
  it('click-to-place: ghost pin, drag, confirm opens the point form prefilled with the normalised coordinates', async () => {
    const { layer, spies } = createFakeLayer({ entities: { mapas: [mapa(1)], map_points: [] } })
    renderSection('/c/demo/mapas/1', { layer })
    const canvas = await screen.findByTestId('canvas')
    fireEvent.click(screen.getByRole('button', { name: '+ Agregar punto' }))
    expect(canvas).toHaveAttribute('data-addmode', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'place pin' }))
    expect(canvas).toHaveAttribute('data-ghost', '0.25,0.75')
    fireEvent.click(screen.getByRole('button', { name: 'drag ghost' }))
    expect(canvas).toHaveAttribute('data-ghost', '0.5,0.1')
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar posición' }))
    expect(openFormSpy).toHaveBeenCalledWith({ type: 'map_points', prefill: { map_id: 1, x: 0.5, y: 0.1 }, onSaved: expect.any(Function) })
    expect(canvas).toHaveAttribute('data-ghost', '0.5,0.1') // kept while the form is open

    const dialog = await screen.findByRole('dialog', { name: 'Nuevo Punto' })
    expect(within(dialog).getByText(/x: 0\.500 · y: 0\.100/)).toBeInTheDocument()
    fireEvent.change(within(dialog).getAllByRole('textbox')[0], { target: { value: 'Faro' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(spies.saveEntityWithDmNotes).toHaveBeenCalledTimes(1))
    expect(spies.saveEntityWithDmNotes).toHaveBeenCalledWith(
      'map_points',
      { campaignId: 'c1' },
      expect.objectContaining({ map_id: 1, x: 0.5, y: 0.1, nombre: 'Faro', link_type: null, link_id: null, estado: 'publicado' }),
    )
    // a successful save ends the placement
    await waitFor(() => expect(canvas).toHaveAttribute('data-ghost', ''))
    expect(canvas).toHaveAttribute('data-addmode', 'false')
  })

  it('cancelling the point form keeps the ghost pin at the same position (confirm step again)', async () => {
    const { layer, spies } = createFakeLayer({ entities: { mapas: [mapa(1)], map_points: [] } })
    renderSection('/c/demo/mapas/1', { layer })
    const canvas = await screen.findByTestId('canvas')
    fireEvent.click(screen.getByRole('button', { name: '+ Agregar punto' }))
    fireEvent.click(screen.getByRole('button', { name: 'place pin' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar posición' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo Punto' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nuevo Punto' })).toBeNull())
    expect(canvas).toHaveAttribute('data-ghost', '0.25,0.75')
    expect(screen.getByRole('button', { name: 'Confirmar posición' })).toBeInTheDocument()
    expect(spies.saveEntityWithDmNotes).not.toHaveBeenCalled()
    // and it can be confirmed again
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar posición' }))
    expect(await screen.findByRole('dialog', { name: 'Nuevo Punto' })).toBeInTheDocument()
  })

  it('refuses to change the default map while the maps list is not loaded (no write, clear toast)', async () => {
    const { layer, spies } = createFakeLayer({ entities: { mapas: [mapa(1, { is_default: true })] } })
    spies.entityList.mockRejectedValue(new Error('down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderSection('/c/demo/mapas?todos=1', { layer })
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los mapas')
    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo mapa' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo Mapa' })
    fireEvent.change(within(dialog).getAllByRole('textbox')[0], { target: { value: 'Nuevo' } })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Mapa por defecto/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText(/Esperá a que carguen los mapas/)).toBeInTheDocument()
    expect(spies.saveEntityWithDmNotes).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('a placement outside the image is clamped to its edge; a non-finite one is dropped (nothing reaches the form)', async () => {
    const { layer } = createFakeLayer({ entities: { mapas: [mapa(1)], map_points: [] } })
    renderSection('/c/demo/mapas/1', { layer })
    const canvas = await screen.findByTestId('canvas')
    fireEvent.click(screen.getByRole('button', { name: '+ Agregar punto' }))
    fireEvent.click(screen.getByRole('button', { name: 'place NaN pin' }))
    expect(canvas).toHaveAttribute('data-ghost', '')
    expect(screen.queryByRole('button', { name: 'Confirmar posición' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'place outside pin' }))
    expect(canvas).toHaveAttribute('data-ghost', '1,0.3')
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar posición' }))
    expect(openFormSpy).toHaveBeenCalledWith({ type: 'map_points', prefill: { map_id: 1, x: 1, y: 0.3 }, onSaved: expect.any(Function) })
  })

  it('cancelling add mode or the ghost opens nothing; Escape backs out step by step', async () => {
    const { layer } = createFakeLayer({ entities: { mapas: [mapa(1)], map_points: [] } })
    renderSection('/c/demo/mapas/1', { layer })
    const canvas = await screen.findByTestId('canvas')
    fireEvent.click(screen.getByRole('button', { name: '+ Agregar punto' }))
    fireEvent.click(screen.getByRole('button', { name: 'place pin' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(canvas).toHaveAttribute('data-ghost', '')
    expect(canvas).toHaveAttribute('data-addmode', 'true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(canvas).toHaveAttribute('data-addmode', 'false')
    expect(openFormSpy).not.toHaveBeenCalled()
  })

  it('"Editar mapa" opens the map form; deleting the map from it returns to the grid', async () => {
    const { layer } = createFakeLayer({ entities: { mapas: [mapa(1), mapa(2)] } })
    const { router } = renderSection('/c/demo/mapas/1', { layer })
    await screen.findByTestId('canvas')
    fireEvent.click(screen.getByRole('button', { name: /Editar mapa/ }))
    const request = openFormSpy.mock.calls[0][0]
    expect(request).toMatchObject({ type: 'mapas', id: 1 })
    await act(async () => {
      request.onRemoved?.()
    })
    await waitFor(() => expect(here(router)).toBe('/c/demo/mapas?todos=1'))
  })

  it('shows the internal notes of the map from the DM notes table', async () => {
    const { layer, spies } = createFakeLayer({
      entities: { mapas: [mapa(1)] },
      dmNotes: { 'mapas:1': { notas: 'El tesoro está **bajo** el faro', secreto: '', ganchos: '' } },
    })
    renderSection('/c/demo/mapas/1', { layer })
    await screen.findByTestId('canvas')
    expect(spies.dmNotesGet).not.toHaveBeenCalled() // only when the panel is opened
    fireEvent.click(screen.getByRole('button', { name: 'Notas' }))
    const panel = await screen.findByTestId('map-dm-notes')
    expect(await within(panel).findByText('bajo', { selector: 'strong' })).toBeInTheDocument()
    expect(spies.dmNotesGet).toHaveBeenCalledWith('mapas', 1)
  })

  it('making a map the default demotes the previous default first', async () => {
    const { layer, spies } = createFakeLayer({ entities: { mapas: [mapa(1, { is_default: true }), mapa(2)] } })
    renderSection('/c/demo/mapas/2', { layer })
    await screen.findByTestId('canvas')
    fireEvent.click(screen.getByRole('button', { name: /Editar mapa/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Editar Mapa' })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Mapa por defecto/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(spies.saveEntityWithDmNotes).toHaveBeenCalledTimes(2))
    const [first, second] = spies.saveEntityWithDmNotes.mock.calls
    expect(first[1]).toMatchObject({ id: 1 })
    expect(first[2]).toEqual({ is_default: false })
    expect(second[1]).toMatchObject({ id: 2 })
    expect(second[2]).toMatchObject({ is_default: true })
  })

  it('refuses a non-https map image before writing anything, but leaves an unchanged legacy value alone', async () => {
    const { layer, spies } = createFakeLayer({ entities: { mapas: [mapa(1, { imagen_url: 'http://old.test/a.png' })] } })
    renderSection('/c/demo/mapas/1', { layer })
    await screen.findByTestId('canvas')
    fireEvent.click(screen.getByRole('button', { name: /Editar mapa/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Editar Mapa' })
    // unchanged http value + another edit: allowed
    fireEvent.change(within(dialog).getAllByRole('textbox')[0], { target: { value: 'Mapa nuevo' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(spies.saveEntityWithDmNotes).toHaveBeenCalledTimes(1))
    expect(spies.saveEntityWithDmNotes.mock.calls[0][2]).not.toHaveProperty('imagen_url')

    // typing another insecure URL is refused
    fireEvent.click(screen.getByRole('button', { name: /Editar mapa/ }))
    const again = await screen.findByRole('dialog', { name: 'Editar Mapa' })
    fireEvent.change(within(again).getByPlaceholderText('https://...'), { target: { value: 'javascript:alert(1)' } })
    fireEvent.click(within(again).getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText(/debe ser una URL que empiece con https/)).toBeInTheDocument()
    expect(spies.saveEntityWithDmNotes).toHaveBeenCalledTimes(1)
  })
})
