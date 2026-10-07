import { act, configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { here } from '../../app/testing/renderApp'
import type { WikiIndexItem } from '../../data'
import type { EntityFormRequest } from '../entityFormContext'
import { createFakeLayer } from '../testing/fakeLayer'
import { entity, renderSection } from '../testing/renderSection'

configure({ asyncUtilTimeout: 5000 })

// Wraps the real hook so the tests can assert exactly what the page asks the form host to open.
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

afterEach(() => openFormSpy.mockClear())

const indexItem = (id: number, title: string): WikiIndexItem => ({ id, title, imagen_url: null, estado: 'publicado' })
const lugar = (id: number, over: Record<string, unknown> = {}) =>
  entity(id, { nombre: `Lugar ${id}`, region: 'otro', tipo: 'Ciudad', subtitulo: '', descripcion: `Descripción ${id}`, imagen_url: '', ...over })

const REGIONS = [
  { key: 'norte', label: 'Tierras del Norte', color: '#7aad82' },
  { key: 'sur', label: 'Sur' },
]
const LUGARES = [
  lugar(1, { nombre: 'Aldea', region: 'norte', subtitulo: 'La aldea vieja', descripcion: 'Cerca de [[{2G}Puerto]].' }),
  lugar(2, { nombre: 'Puerto', region: 'sur', tipo: '' }),
  lugar(3, { nombre: 'Ruinas', region: 'perdida', descripcion: '' }),
]

const main = () => within(screen.getByRole('main'))
const cards = () => main().queryAllByRole('link').filter((a) => /\/lugares\/\d+(\?.*)?$/.test(a.getAttribute('href') ?? ''))
const names = () => cards().map((a) => within(a).getByText(/^(Aldea|Puerto|Ruinas)$/).textContent)

describe('Lugares list', () => {
  it('renders cards in id order with tipo, region (campaign labels, then the raw key), subtitle and teaser', async () => {
    const { layer } = createFakeLayer({ entities: { lugares: LUGARES }, index: { lugares: [indexItem(2, 'Puerto')] } })
    renderSection('/c/demo/lugares', { layer, regions: REGIONS })
    expect(await screen.findByRole('heading', { level: 1, name: 'Lugares' })).toBeInTheDocument()
    await waitFor(() => expect(cards()).toHaveLength(3))
    expect(names()).toEqual(['Aldea', 'Puerto', 'Ruinas'])
    expect(cards()[0]).toHaveAttribute('href', '/c/demo/lugares/1')
    expect(within(cards()[0]).getByText('Ciudad')).toBeInTheDocument()
    expect(within(cards()[0]).getByText('Tierras del Norte')).toBeInTheDocument()
    expect(within(cards()[0]).getByText('La aldea vieja')).toBeInTheDocument()
    expect(within(cards()[0]).getByText('Cerca de Puerto.')).toBeInTheDocument() // wiki markup stripped in the teaser
    expect(within(cards()[2]).getByText('perdida')).toBeInTheDocument()
  })

  it('filters by campaign region (pressed state, URL ?region=) and an unknown value reads as Todos', async () => {
    const { layer } = createFakeLayer({ entities: { lugares: LUGARES } })
    const { router } = renderSection('/c/demo/lugares?region=sur', { layer, regions: REGIONS })
    await waitFor(() => expect(names()).toEqual(['Puerto']))
    expect(screen.getByRole('button', { name: 'Sur' })).toHaveAttribute('aria-pressed', 'true')
    expect(cards()[0]).toHaveAttribute('href', '/c/demo/lugares/2?region=sur')
    fireEvent.click(screen.getByRole('button', { name: 'Tierras del Norte' }))
    await waitFor(() => expect(names()).toEqual(['Aldea']))
    expect(here(router)).toBe('/c/demo/lugares?region=norte')
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }))
    await waitFor(() => expect(here(router)).toBe('/c/demo/lugares')) // the default is never written
    await act(async () => {
      await router.navigate('/c/demo/lugares?region=nada')
    })
    await waitFor(() => expect(cards()).toHaveLength(3))
    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('the region filter survives detail, "← Volver" and browser back', async () => {
    const { layer } = createFakeLayer({ entities: { lugares: LUGARES } })
    const { router } = renderSection('/c/demo/lugares?region=norte', { layer, regions: REGIONS })
    await waitFor(() => expect(names()).toEqual(['Aldea']))
    fireEvent.click(cards()[0])
    await screen.findByRole('heading', { level: 1, name: 'Aldea' })
    expect(main().getByRole('link', { name: '← Volver' })).toHaveAttribute('href', '/c/demo/lugares?region=norte')
    fireEvent.click(main().getByRole('link', { name: '← Volver' }))
    await waitFor(() => expect(names()).toEqual(['Aldea']))
    await act(async () => {
      await router.navigate(-1)
    })
    await screen.findByRole('heading', { level: 1, name: 'Aldea' })
  })

  it('empty state names the campaign; a retryable error when the list cannot load', async () => {
    const { layer, spies } = createFakeLayer({ entities: { lugares: [] } })
    spies.entityList.mockRejectedValueOnce(new Error('down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderSection('/c/demo/lugares', { layer })
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los lugares')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText(/poblar el mundo de Demo/)).toBeInTheDocument()
    errorSpy.mockRestore()
  })

  it('unread dot per card, cleared once the detail was opened', async () => {
    const { layer } = createFakeLayer({ entities: { lugares: [LUGARES[0]] } })
    const { container, router } = renderSection('/c/demo/lugares', { layer })
    await waitFor(() => expect(container.querySelectorAll('.unread-dot')).toHaveLength(1))
    fireEvent.click(cards()[0])
    await screen.findByRole('heading', { level: 1, name: 'Aldea' })
    await waitFor(() => expect(layer.readState.markSeen).toHaveBeenCalledWith('c1', 'lugares', 1, '', expect.any(Date)))
    await act(async () => {
      await router.navigate(-1)
    })
    await screen.findByRole('heading', { level: 1, name: 'Lugares' })
    expect(container.querySelectorAll('.unread-dot')).toHaveLength(0)
  })
})

describe('Lugares detail (URL driven)', () => {
  it('renders by URL: eyebrow, subtitle, tags, description, image lightbox and wiki links', async () => {
    const { layer } = createFakeLayer({
      entities: { lugares: [LUGARES[0], LUGARES[1]].map((l) => (l.id === 1 ? { ...l, imagen_url: 'https://img.test/a.png' } : l)) },
      index: { lugares: [indexItem(1, 'Aldea'), indexItem(2, 'Puerto')] },
    })
    const { router } = renderSection('/c/demo/lugares/1', { layer, regions: REGIONS })
    expect(await screen.findByRole('heading', { level: 1, name: 'Aldea' })).toBeInTheDocument()
    expect(screen.getByText('Ciudad · Tierras del Norte')).toBeInTheDocument()
    expect(screen.getByText('La aldea vieja')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Descripción' })).toBeInTheDocument()
    fireEvent.click(screen.getByAltText('Aldea'))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(await screen.findByText('Puerto', { selector: 'span.cursor-pointer' }))
    expect(here(router)).toBe('/c/demo/lugares/2')
    expect(await screen.findByRole('heading', { level: 1, name: 'Puerto' })).toBeInTheDocument()
  })

  it('unknown id, hidden row and non-numeric id are "no encontrado" without DM requests; a load failure is retryable', async () => {
    const { layer, spies } = createFakeLayer({ entities: { lugares: LUGARES } })
    const { router } = renderSection('/c/demo/lugares/77', { layer })
    expect(await screen.findByRole('heading', { level: 1, name: 'Lugar no encontrado' })).toBeInTheDocument()
    await act(async () => {
      await router.navigate('/c/demo/lugares/x1')
    })
    expect(await screen.findByText(/no corresponde a ningún lugar/)).toBeInTheDocument()
    expect(spies.dmNotesGet).not.toHaveBeenCalled()
  })

  it('distinguishes a load failure from not-found', async () => {
    const { layer, spies } = createFakeLayer({ entities: { lugares: LUGARES } })
    spies.entityList.mockRejectedValueOnce(new Error('down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderSection('/c/demo/lugares/1', { layer })
    expect(await screen.findByRole('alert')).toHaveTextContent('problema de conexión')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Aldea' })).toBeInTheDocument()
    errorSpy.mockRestore()
  })
})

describe('Lugares as a player', () => {
  const dmNotes = { 'lugares:1': { notas: 'NOTA SECRETA', secreto: '', ganchos: '' } }

  it('never sees DM notes, the wiki id, edit/create, and never reads the DM tables', async () => {
    const { layer, spies } = createFakeLayer({ entities: { lugares: LUGARES }, dmNotes })
    const { router } = renderSection('/c/demo/lugares', { layer, isDM: false })
    await waitFor(() => expect(cards()).toHaveLength(3))
    expect(screen.queryByRole('button', { name: '+ Nuevo Lugar' })).toBeNull()
    await act(async () => {
      await router.navigate('/c/demo/lugares/1')
    })
    await screen.findByRole('heading', { level: 1, name: 'Aldea' })
    expect(screen.queryByText(/NOTA SECRETA|Notas DM/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
    expect(screen.queryByTitle('ID para wiki-link')).toBeNull()
    expect(spies.dmNotesGet).not.toHaveBeenCalled()
    expect(spies.dmNotesList).not.toHaveBeenCalled()
    expect(spies.getVisibility).not.toHaveBeenCalled()
  })

  it('a draft that reached the client is hidden in the list and by URL', async () => {
    const { layer } = createFakeLayer({ entities: { lugares: [lugar(1, { nombre: 'Aldea' }), lugar(2, { nombre: 'Puerto', estado: 'borrador' })] } })
    const { router } = renderSection('/c/demo/lugares', { layer, isDM: false })
    await waitFor(() => expect(cards()).toHaveLength(1))
    expect(screen.queryByText('Borrador')).toBeNull()
    await act(async () => {
      await router.navigate('/c/demo/lugares/2')
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'Lugar no encontrado' })).toBeInTheDocument()
    expect(screen.queryByText('Puerto')).toBeNull()
  })
})

describe('Lugares as a DM', () => {
  it('sees Notas DM, the wiki id and Borrador / Secreto tags; no lock badges (legacy has none here)', async () => {
    const { layer, spies } = createFakeLayer({
      entities: { lugares: [lugar(1, { nombre: 'Aldea', estado: 'borrador' }), lugar(2, { nombre: 'Puerto', estado: 'secreto' })] },
      dmNotes: { 'lugares:1': { notas: 'Nota del DM', secreto: '', ganchos: '' } },
    })
    const { router } = renderSection('/c/demo/lugares', { layer })
    await waitFor(() => expect(cards()).toHaveLength(2))
    expect(screen.getByText('Borrador')).toBeInTheDocument()
    expect(screen.getByText('Secreto')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Tiene secreto DM' })).toBeNull()
    expect(spies.dmNotesList).not.toHaveBeenCalled()
    await act(async () => {
      await router.navigate('/c/demo/lugares/1')
    })
    expect(await screen.findByText('Nota del DM')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Notas DM' })).toBeInTheDocument()
    expect(screen.getByTitle('ID para wiki-link')).toHaveTextContent('{1G}')
    expect(spies.dmNotesGet).toHaveBeenCalledWith('lugares', 1)
  })

  it('opens the form to create and edit; a delete goes back to the list', async () => {
    const { layer } = createFakeLayer({ entities: { lugares: LUGARES } })
    const { router } = renderSection('/c/demo/lugares', { layer })
    await waitFor(() => expect(cards()).toHaveLength(3))
    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo Lugar' }))
    expect(openFormSpy).toHaveBeenLastCalledWith({ type: 'lugares' })
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(cards()[0])
    await screen.findByRole('heading', { level: 1, name: 'Aldea' })
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(openFormSpy).toHaveBeenLastCalledWith({ type: 'lugares', id: 1, onRemoved: expect.any(Function) })
    await screen.findByRole('dialog')
    await act(async () => openFormSpy.mock.calls.at(-1)?.[0].onRemoved?.())
    await waitFor(() => expect(here(router)).toBe('/c/demo/lugares'))
  })

  it('a failed DM notes read shows a retryable notice, never silence', async () => {
    const { layer, spies } = createFakeLayer({ entities: { lugares: LUGARES }, dmNotes: { 'lugares:1': { notas: 'Nota X', secreto: '', ganchos: '' } } })
    spies.dmNotesGet.mockRejectedValueOnce(new Error('down'))
    renderSection('/c/demo/lugares/1', { layer })
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar las notas del DM')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Nota X')).toBeInTheDocument()
  })
})
