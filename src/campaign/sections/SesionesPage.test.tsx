import { act, configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { here } from '../../app/testing/renderApp'
import type { WikiIndexItem } from '../../data'
import type { EntityFormRequest } from '../entityFormContext'
import { createFakeLayer } from '../testing/fakeLayer'
import { entity, renderSection } from '../testing/renderSection'

// the first test of a file pays for the lazy page chunk
configure({ asyncUtilTimeout: 5000 })

// Wraps the real hook so the tests can assert exactly what the page asks the form host to open.
const openFormSpy = vi.fn<(request: EntityFormRequest) => void>()
vi.mock('../entityFormContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../entityFormContext')>()
  return {
    ...actual,
    useEntityForm: () => {
      const api = actual.useEntityForm()
      return {
        ...api,
        openForm: (request: EntityFormRequest) => {
          openFormSpy(request)
          api.openForm(request)
        },
      }
    },
  }
})

afterEach(() => openFormSpy.mockClear())

const indexItem = (id: number, title: string): WikiIndexItem => ({ id, title, imagen_url: null, estado: 'publicado' })

const sesion = (id: number, over: Record<string, unknown> = {}) =>
  entity(id, { tipo: 'sesion', numero: id, titulo: `Sesión titulada ${id}`, fecha: '2026-03-01', resumen: `Resumen ${id}`, logros: `Logros ${id}`, ...over })

const SESIONES = [
  sesion(1, { orden: 100 }),
  sesion(2, { orden: 200, logros: '' }), // planned
  entity(3, { tipo: 'avance', orden: 250, titulo: 'Un avance', texto: 'Texto del avance' }),
  sesion(4, { orden: 300 }),
]

const main = () => within(screen.getByRole('main'))
const cardsText = () => main().getAllByRole('link').filter((a) => a.getAttribute('href')?.match(/\/sesiones\/\d+(\?.*)?$/)).map((a) => a.textContent ?? '')

describe('Sesiones list', () => {
  it('renders the timeline newest first with kind, date, planned state and an h1', async () => {
    const { layer } = createFakeLayer({ entities: { sesiones: SESIONES } })
    renderSection('/c/demo/sesiones', { layer })
    expect(await screen.findByRole('heading', { level: 1, name: 'Sesiones' })).toBeInTheDocument()
    await waitFor(() => expect(cardsText()).toHaveLength(4))
    const texts = cardsText()
    expect(texts[0]).toContain('Sesión 4')
    expect(texts[1]).toContain('Avance')
    expect(texts[2]).toContain('Sesión 2')
    expect(texts[3]).toContain('Sesión 1')
    expect(texts[0]).toContain('· 2026-03-01')
    expect(texts[1]).toContain('Texto del avance')
    expect(main().getAllByRole('link', { name: /Sesión titulada 2/ })[0]).toHaveAttribute('href', '/c/demo/sesiones/2')
  })

  it('filters by tipo and exposes the pressed state', async () => {
    const { layer } = createFakeLayer({ entities: { sesiones: SESIONES } })
    renderSection('/c/demo/sesiones', { layer })
    await waitFor(() => expect(cardsText()).toHaveLength(4))
    const avances = screen.getByRole('button', { name: 'Avances' })
    fireEvent.click(avances)
    await waitFor(() => expect(cardsText()).toHaveLength(1))
    expect(avances).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Sesiones' }))
    await waitFor(() => expect(cardsText()).toHaveLength(3))
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }))
    await waitFor(() => expect(cardsText()).toHaveLength(4))
  })

  it('shows the empty state with the campaign name', async () => {
    const { layer } = createFakeLayer({ entities: { sesiones: [] } })
    renderSection('/c/demo/sesiones', { layer })
    expect(await screen.findByText('Sin sesiones registradas')).toBeInTheDocument()
    expect(screen.getByText(/crónica de Demo/)).toBeInTheDocument()
  })

  it('shows a retryable error when the list cannot load', async () => {
    const { layer, spies } = createFakeLayer({ entities: { sesiones: SESIONES } })
    spies.entityList.mockRejectedValueOnce(new Error('down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderSection('/c/demo/sesiones', { layer })
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar las sesiones')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(cardsText()).toHaveLength(4))
    errorSpy.mockRestore()
  })

  it('the unread dot shows for a changed row and is gone after opening it (markRead on detail)', async () => {
    const { layer } = createFakeLayer({ entities: { sesiones: [SESIONES[0]] } })
    const { container, router } = renderSection('/c/demo/sesiones', { layer })
    await waitFor(() => expect(container.querySelectorAll('.unread-dot')).toHaveLength(1))
    fireEvent.click(main().getByRole('link', { name: /Sesión titulada 1/ }))
    await screen.findByRole('heading', { level: 1, name: 'Sesión titulada 1' })
    await waitFor(() => expect(layer.readState.markSeen).toHaveBeenCalledWith('c1', 'sesiones', 1, '', expect.any(Date)))
    await act(async () => {
      await router.navigate(-1)
    })
    await screen.findByRole('heading', { level: 1, name: 'Sesiones' })
    expect(container.querySelectorAll('.unread-dot')).toHaveLength(0)
  })
})

describe('Sesiones detail (URL driven)', () => {
  it('renders a session by URL with its sections, and back/forward work', async () => {
    const { layer } = createFakeLayer({ entities: { sesiones: SESIONES } })
    const { router } = renderSection('/c/demo/sesiones', { layer })
    await waitFor(() => expect(cardsText()).toHaveLength(4))
    fireEvent.click(main().getByRole('link', { name: /Sesión titulada 4/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Sesión titulada 4' })).toBeInTheDocument()
    expect(here(router)).toBe('/c/demo/sesiones/4')
    expect(screen.getByRole('heading', { level: 2, name: 'Resumen' })).toBeInTheDocument()
    expect(screen.getByText('Resumen 4')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Momentos importantes' })).toBeInTheDocument()
    expect(screen.getByText('Creado:')).toBeInTheDocument()
    await act(async () => {
      await router.navigate(-1)
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'Sesiones' })).toBeInTheDocument()
    await act(async () => {
      await router.navigate(1)
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'Sesión titulada 4' })).toBeInTheDocument()
  })

  it('"← Volver" is a link to the list URL', async () => {
    const { layer } = createFakeLayer({ entities: { sesiones: SESIONES } })
    renderSection('/c/demo/sesiones/1', { layer })
    await screen.findByRole('heading', { level: 1, name: 'Sesión titulada 1' })
    expect(main().getByRole('link', { name: '← Volver' })).toHaveAttribute('href', '/c/demo/sesiones')
  })

  it('shows the planned badge for a session without logros and "Contenido" for an avance', async () => {
    const { layer } = createFakeLayer({ entities: { sesiones: SESIONES } })
    const { router } = renderSection('/c/demo/sesiones/2', { layer })
    expect(await screen.findByText('Planificada')).toBeInTheDocument()
    await act(async () => {
      await router.navigate('/c/demo/sesiones/3')
    })
    expect(await screen.findByRole('heading', { level: 2, name: 'Contenido' })).toBeInTheDocument()
    expect(screen.getByText('Texto del avance')).toBeInTheDocument()
    expect(screen.queryByText('Planificada')).toBeNull()
  })

  it('previous / next follow the timeline order', async () => {
    const { layer } = createFakeLayer({ entities: { sesiones: SESIONES } })
    renderSection('/c/demo/sesiones/2', { layer })
    await screen.findByRole('heading', { level: 1, name: 'Sesión titulada 2' })
    expect(screen.getByRole('link', { name: '← Ant' })).toHaveAttribute('href', '/c/demo/sesiones/1')
    expect(screen.getByRole('link', { name: 'Sig →' })).toHaveAttribute('href', '/c/demo/sesiones/3')
  })

  it('says the session does not exist (or is not visible) for an unknown id', async () => {
    const { layer } = createFakeLayer({ entities: { sesiones: SESIONES } })
    renderSection('/c/demo/sesiones/99', { layer })
    expect(await screen.findByRole('heading', { level: 1, name: 'Sesión no encontrada' })).toBeInTheDocument()
    expect(screen.getByText(/ya no existe/)).toBeInTheDocument()
    expect(main().getByRole('link', { name: '← Volver' })).toHaveAttribute('href', '/c/demo/sesiones')
  })

  it('a non-numeric id is "not found" and makes no data request for sesiones', async () => {
    const { layer, spies } = createFakeLayer({ entities: { sesiones: SESIONES } })
    renderSection('/c/demo/sesiones/12abc', { layer })
    expect(await screen.findByRole('heading', { level: 1, name: 'Sesión no encontrada' })).toBeInTheDocument()
    expect(spies.entityList).not.toHaveBeenCalledWith('sesiones')
    expect(spies.dmNotesGet).not.toHaveBeenCalled()
    expect(spies.getVisibility).not.toHaveBeenCalled()
  })

  it('distinguishes a load failure from not-found and offers a retry', async () => {
    const { layer, spies } = createFakeLayer({ entities: { sesiones: SESIONES } })
    spies.entityList.mockRejectedValueOnce(new Error('down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderSection('/c/demo/sesiones/1', { layer })
    expect(await screen.findByRole('alert')).toHaveTextContent('problema de conexión')
    expect(screen.queryByText(/ya no existe/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Sesión titulada 1' })).toBeInTheDocument()
    errorSpy.mockRestore()
  })

  it('turns into "ya no existe" when the row is deleted in realtime while open', async () => {
    const { layer, fake } = createFakeLayer({ entities: { sesiones: SESIONES } })
    renderSection('/c/demo/sesiones/1', { layer })
    await screen.findByRole('heading', { level: 1, name: 'Sesión titulada 1' })
    const channel = fake.channels.find((c) => c.name.startsWith('campaign:sesiones:'))
    expect(channel).toBeDefined()
    act(() => channel?.emit('DELETE', { old: { id: 1 } }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Sesión no encontrada' })).toBeInTheDocument()
  })

  it('wiki links in the long fields navigate to the hub routes', async () => {
    const { layer } = createFakeLayer({
      entities: { sesiones: [sesion(1, { resumen: 'Conocimos a [[{4N}Kardevir]] en [[{2G}Puerto]].' })] },
      index: { pnjs: [indexItem(4, 'Kardevir')], lugares: [indexItem(2, 'Puerto')] },
    })
    const { router } = renderSection('/c/demo/sesiones/1', { layer })
    const link = await screen.findByText('Kardevir', { selector: 'span.cursor-pointer' })
    fireEvent.click(link)
    expect(here(router)).toBe('/c/demo/pnjs/4')
  })
})

describe('Sesiones as a player', () => {
  const dmNotes = { 'sesiones:1': { notas: 'NOTA SECRETA', secreto: '', ganchos: 'GANCHO SECRETO' } }

  it('never sees DM-only blocks, the wiki id, edit/create buttons, and never calls the DM reads', async () => {
    const { layer, spies } = createFakeLayer({ entities: { sesiones: SESIONES }, dmNotes })
    renderSection('/c/demo/sesiones/1', { layer, isDM: false })
    await screen.findByRole('heading', { level: 1, name: 'Sesión titulada 1' })
    expect(screen.queryByText('Ganchos pendientes')).toBeNull()
    expect(screen.queryByText(/GANCHO SECRETO/)).toBeNull()
    expect(screen.queryByText(/NOTA SECRETA/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
    expect(screen.queryByTitle('ID para wiki-link')).toBeNull()
    expect(spies.dmNotesGet).not.toHaveBeenCalled()
    expect(spies.getVisibility).not.toHaveBeenCalled()
  })

  it('has no create buttons on the list and never renders a draft that reached the client', async () => {
    const { layer } = createFakeLayer({
      entities: { sesiones: [sesion(1, { orden: 100 }), sesion(2, { orden: 200, estado: 'borrador', titulo: 'BORRADOR OCULTO' })] },
    })
    renderSection('/c/demo/sesiones', { layer, isDM: false })
    await waitFor(() => expect(cardsText()).toHaveLength(1))
    expect(screen.queryByText('BORRADOR OCULTO')).toBeNull()
    expect(screen.queryByRole('button', { name: /Nueva Sesión|Nuevo Avance/ })).toBeNull()
    expect(screen.queryByText('Borrador')).toBeNull()
  })

  it('a draft opened by URL is "not found", not rendered', async () => {
    const { layer } = createFakeLayer({ entities: { sesiones: [sesion(2, { estado: 'borrador', titulo: 'BORRADOR OCULTO' })] } })
    renderSection('/c/demo/sesiones/2', { layer, isDM: false })
    expect(await screen.findByRole('heading', { level: 1, name: 'Sesión no encontrada' })).toBeInTheDocument()
    expect(screen.queryByText('BORRADOR OCULTO')).toBeNull()
  })

  it('shows the Secreto tag on a secret row the player may see (legacy behavior), no Borrador anywhere', async () => {
    const { layer } = createFakeLayer({ entities: { sesiones: [sesion(1, { estado: 'secreto' })] } })
    renderSection('/c/demo/sesiones/1', { layer, isDM: false })
    await screen.findByRole('heading', { level: 1, name: 'Sesión titulada 1' })
    expect(screen.getByText('Secreto')).toBeInTheDocument()
  })
})

describe('Sesiones as a DM', () => {
  it('sees ganchos (a session) and the DM notes (an avance) read on demand, plus the wiki id', async () => {
    const { layer, spies } = createFakeLayer({
      entities: { sesiones: SESIONES },
      dmNotes: {
        'sesiones:1': { notas: 'nota de sesión (no se muestra)', secreto: '', ganchos: 'Gancho pendiente X' },
        'sesiones:3': { notas: 'Nota del DM del avance', secreto: '', ganchos: '' },
      },
    })
    const { router } = renderSection('/c/demo/sesiones/1', { layer })
    expect(await screen.findByText('Gancho pendiente X')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Ganchos pendientes' })).toBeInTheDocument()
    expect(screen.queryByText(/no se muestra/)).toBeNull()
    expect(screen.getByTitle('ID para wiki-link')).toHaveTextContent('{1S}')
    expect(spies.dmNotesGet).toHaveBeenCalledWith('sesiones', 1)
    await act(async () => {
      await router.navigate('/c/demo/sesiones/3')
    })
    expect(await screen.findByText('Nota del DM del avance')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Notas del DM' })).toBeInTheDocument()
  })

  it('shows Borrador / Secreto tags in the list', async () => {
    const { layer } = createFakeLayer({
      entities: { sesiones: [sesion(1, { estado: 'borrador' }), sesion(2, { estado: 'secreto' })] },
    })
    renderSection('/c/demo/sesiones', { layer })
    await waitFor(() => expect(cardsText()).toHaveLength(2))
    expect(screen.getByText('Borrador')).toBeInTheDocument()
    expect(screen.getByText('Secreto')).toBeInTheDocument()
  })

  it('opens the form for a new session / a new avance from the list', async () => {
    const { layer } = createFakeLayer({ entities: { sesiones: SESIONES } })
    renderSection('/c/demo/sesiones', { layer })
    await waitFor(() => expect(cardsText()).toHaveLength(4))
    fireEvent.click(screen.getByRole('button', { name: '+ Nueva Sesión' }))
    expect(openFormSpy).toHaveBeenLastCalledWith({ type: 'sesiones' })
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo Avance' }))
    expect(openFormSpy).toHaveBeenLastCalledWith({ type: 'avances' })
  })

  it('"Editar" opens the matching form (sesión vs avance) for this id, and a delete returns to the list', async () => {
    const { layer } = createFakeLayer({ entities: { sesiones: SESIONES } })
    const { router } = renderSection('/c/demo/sesiones/1', { layer })
    await screen.findByRole('heading', { level: 1, name: 'Sesión titulada 1' })
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(openFormSpy).toHaveBeenLastCalledWith({ type: 'sesiones', id: 1, onRemoved: expect.any(Function) })
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await act(async () => openFormSpy.mock.calls.at(-1)?.[0].onRemoved?.())
    await waitFor(() => expect(here(router)).toBe('/c/demo/sesiones'))

    await act(async () => {
      await router.navigate('/c/demo/sesiones/3')
    })
    await screen.findByRole('heading', { level: 1, name: 'Un avance' })
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(openFormSpy).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'avances', id: 3 }))
  })
})

describe('Sesiones: list filters live in the URL', () => {
  it('?tipo= survives opening a detail, "← Volver", prev/next and the browser back button', async () => {
    const { layer } = createFakeLayer({ entities: { sesiones: [...SESIONES, entity(5, { tipo: 'avance', orden: 350, titulo: 'Otro avance', texto: 'x' })] } })
    const { router } = renderSection('/c/demo/sesiones?tipo=avance', { layer })
    await waitFor(() => expect(cardsText()).toHaveLength(2))
    expect(screen.getByRole('button', { name: 'Avances' })).toHaveAttribute('aria-pressed', 'true')
    const card = main().getAllByRole('link').find((a) => a.getAttribute('href')?.includes('/sesiones/3'))
    expect(card).toHaveAttribute('href', '/c/demo/sesiones/3?tipo=avance')
    fireEvent.click(card as HTMLElement)
    await screen.findByRole('heading', { level: 1, name: 'Un avance' })
    expect(main().getByRole('link', { name: '← Volver' })).toHaveAttribute('href', '/c/demo/sesiones?tipo=avance')
    // prev/next stay inside the filtered list (avances only) and keep the query: Un avance is the first avance
    expect(screen.queryByRole('link', { name: '← Ant' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Sig →' })).toHaveAttribute('href', '/c/demo/sesiones/5?tipo=avance')
    fireEvent.click(main().getByRole('link', { name: '← Volver' }))
    await waitFor(() => expect(cardsText()).toHaveLength(2))
    expect(screen.getByRole('button', { name: 'Avances' })).toHaveAttribute('aria-pressed', 'true')
    await act(async () => {
      await router.navigate(-1) // back to the detail
    })
    await screen.findByRole('heading', { level: 1, name: 'Un avance' })
    await act(async () => {
      await router.navigate(-1) // and back to the filtered list
    })
    await waitFor(() => expect(here(router)).toBe('/c/demo/sesiones?tipo=avance'))
    await waitFor(() => expect(cardsText()).toHaveLength(2))
  })

  it('without a filter prev/next cross kinds; a row outside the active filter has no neighbours', async () => {
    const { layer } = createFakeLayer({ entities: { sesiones: SESIONES } })
    const { router } = renderSection('/c/demo/sesiones/3', { layer })
    await screen.findByRole('heading', { level: 1, name: 'Un avance' })
    expect(screen.getByRole('link', { name: '← Ant' })).toHaveAttribute('href', '/c/demo/sesiones/2')
    expect(screen.getByRole('link', { name: 'Sig →' })).toHaveAttribute('href', '/c/demo/sesiones/4')
    await act(async () => {
      await router.navigate('/c/demo/sesiones/2?tipo=avance') // a session opened under the "avances" filter
    })
    await screen.findByRole('heading', { level: 1, name: 'Sesión titulada 2' })
    expect(screen.queryByRole('link', { name: '← Ant' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Sig →' })).toBeNull()
  })

  it('the lightbox of one session does not leak into the next one (prev/next)', async () => {
    const { layer } = createFakeLayer({ entities: { sesiones: [sesion(1, { orden: 100, imagen_url: 'https://img.test/a.png' }), sesion(2, { orden: 200, imagen_url: 'https://img.test/b.png' })] } })
    renderSection('/c/demo/sesiones/1', { layer })
    await screen.findByRole('heading', { level: 1, name: 'Sesión titulada 1' })
    fireEvent.click(await screen.findByAltText('Sesión titulada 1'))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Sig →' }))
    await screen.findByRole('heading', { level: 1, name: 'Sesión titulada 2' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('changing the filter rewrites the URL (replace) and an unknown value reads as "Todos"', async () => {
    const { layer } = createFakeLayer({ entities: { sesiones: SESIONES } })
    const { router } = renderSection('/c/demo/sesiones?tipo=basura', { layer })
    await waitFor(() => expect(cardsText()).toHaveLength(4))
    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Sesiones' }))
    await waitFor(() => expect(here(router)).toBe('/c/demo/sesiones?tipo=sesion'))
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }))
    await waitFor(() => expect(here(router)).toBe('/c/demo/sesiones')) // the default is never written
  })
})

describe('Sesiones: labels', () => {
  it('a session without a number is just "Sesión" (never "Sesión null")', async () => {
    const { layer } = createFakeLayer({ entities: { sesiones: [sesion(1, { numero: null }), sesion(2, { numero: 0, orden: 200 })] } })
    renderSection('/c/demo/sesiones', { layer })
    await waitFor(() => expect(cardsText()).toHaveLength(2))
    const texts = cardsText()
    expect(texts[0]).toMatch(/^Sesión 0/)
    expect(texts[1]).toMatch(/^Sesión(?! \d)/)
    expect(texts[1]).not.toMatch(/null|undefined/)
  })
})

describe('Sesiones: DM-only reads never fail silently or flicker', () => {
  const row = (over: Record<string, string>) => ({
    id: 1, campaign_id: 'c1', entity_type: 'sesiones', entity_id: 1, notas: '', secreto: '', ganchos: '', created_at: '', updated_at: '', ...over,
  })

  it('shows a retryable notice when the DM notes cannot be read', async () => {
    const { layer, spies } = createFakeLayer({ entities: { sesiones: SESIONES }, dmNotes: { 'sesiones:1': { notas: '', secreto: '', ganchos: 'Gancho X' } } })
    spies.dmNotesGet.mockRejectedValueOnce(new Error('down'))
    renderSection('/c/demo/sesiones/1', { layer })
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar las notas del DM')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Gancho X')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a player never gets the notice (no DM read is made)', async () => {
    const { layer, spies } = createFakeLayer({ entities: { sesiones: SESIONES } })
    spies.dmNotesGet.mockRejectedValue(new Error('would fail'))
    renderSection('/c/demo/sesiones/1', { layer, isDM: false })
    await screen.findByRole('heading', { level: 1, name: 'Sesión titulada 1' })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(spies.dmNotesGet).not.toHaveBeenCalled()
  })

  it('keeps the DM blocks on screen while a new version is being re-read', async () => {
    const { layer, spies, fake } = createFakeLayer({ entities: { sesiones: SESIONES }, dmNotes: { 'sesiones:1': { notas: '', secreto: '', ganchos: 'Gancho viejo' } } })
    renderSection('/c/demo/sesiones/1', { layer })
    await screen.findByText('Gancho viejo')
    let release: () => void = () => undefined
    spies.dmNotesGet.mockImplementationOnce(
      () => new Promise((resolve) => { release = () => resolve(row({ ganchos: 'Gancho nuevo' })) }),
    )
    const channel = fake.channels.find((c) => c.name.startsWith('campaign:sesiones:'))
    act(() => channel?.emit('UPDATE', { new: { id: 1, campaign_id: 'c1', updated_at: '2026-02-01T00:00:00Z' } }))
    await waitFor(() => expect(spies.dmNotesGet).toHaveBeenCalledTimes(2))
    expect(screen.getByText('Gancho viejo')).toBeInTheDocument() // still visible during the refetch
    await act(async () => release())
    expect(await screen.findByText('Gancho nuevo')).toBeInTheDocument()
  })
})

describe('Sesiones: RLS is the visibility boundary', () => {
  // The fake layer models what PostgREST returns AFTER row-level security: a secreto row that is not
  // targeted at this player is simply absent from the list. The page does not (and cannot: it never
  // sees `visible_to`) decide that; `canSee` only drops drafts as defense in depth.
  const visibleToMe = [sesion(1, { orden: 100, titulo: 'Para todos' })]

  it('a secreto row not targeted at the player never reaches the page: not in the list, not by URL', async () => {
    const { layer, spies } = createFakeLayer({ entities: { sesiones: visibleToMe } })
    const { router } = renderSection('/c/demo/sesiones', { layer, isDM: false })
    await waitFor(() => expect(cardsText()).toHaveLength(1))
    expect(screen.queryByText('SECRETO AJENO')).toBeNull()
    await act(async () => {
      await router.navigate('/c/demo/sesiones/2') // the id of the row RLS withheld
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'Sesión no encontrada' })).toBeInTheDocument()
    expect(screen.queryByText('SECRETO AJENO')).toBeNull()
    expect(spies.dmNotesGet).not.toHaveBeenCalled()
    expect(spies.getVisibility).not.toHaveBeenCalled()
  })

  it('documents that the client does not second-guess RLS for secreto rows (it cannot read visible_to)', async () => {
    const { layer } = createFakeLayer({ entities: { sesiones: [...visibleToMe, sesion(2, { orden: 200, estado: 'secreto', titulo: 'Secreta para mí' })] } })
    renderSection('/c/demo/sesiones', { layer, isDM: false })
    await waitFor(() => expect(cardsText()).toHaveLength(2)) // delivered by RLS, so rendered (with its tag)
    expect(screen.getByText('Secreto')).toBeInTheDocument()
  })
})

