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
const item = (id: number, over: Record<string, unknown> = {}) =>
  entity(id, { nombre: `Ítem ${id}`, tipo: 'anillo', rareza: 'raro', requiere_sintonia: false, descripcion: `Propiedades ${id}`, lore: '', poseedor: '', imagen_url: '', ...over })

const ITEMS = [
  item(1, { nombre: 'Anillo', requiere_sintonia: true, poseedor: 'Ana la PJ', lore: 'Forjado por [[{2I}Espada]].', descripcion: 'Da **luz**.' }),
  item(2, { nombre: 'Espada', tipo: '', rareza: '' }),
]

const main = () => within(screen.getByRole('main'))
const cards = () => main().queryAllByRole('link').filter((a) => /\/items\/\d+(\?.*)?$/.test(a.getAttribute('href') ?? ''))

describe('Items list', () => {
  it('renders cards in id order with rareza, tipo and Sintonía tags and a plain teaser', async () => {
    const { layer } = createFakeLayer({ entities: { items: ITEMS } })
    renderSection('/c/demo/items', { layer })
    expect(await screen.findByRole('heading', { level: 1, name: 'Ítems' })).toBeInTheDocument()
    await waitFor(() => expect(cards()).toHaveLength(2))
    expect(cards()[0]).toHaveAttribute('href', '/c/demo/items/1')
    expect(within(cards()[0]).getByText('raro')).toBeInTheDocument()
    expect(within(cards()[0]).getByText('anillo')).toBeInTheDocument()
    expect(within(cards()[0]).getByText('Sintonía')).toBeInTheDocument()
    expect(within(cards()[0]).getByText('Da luz.')).toBeInTheDocument()
    expect(within(cards()[1]).queryByText('Sintonía')).toBeNull()
  })

  it('empty state names the campaign; a retryable error when the list cannot load', async () => {
    const { layer, spies } = createFakeLayer({ entities: { items: [] } })
    spies.entityList.mockRejectedValueOnce(new Error('down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderSection('/c/demo/items', { layer })
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los ítems')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText(/homebrew de Demo/)).toBeInTheDocument()
    errorSpy.mockRestore()
  })

  it('unread dot per card, cleared once the detail was opened', async () => {
    const { layer } = createFakeLayer({ entities: { items: [ITEMS[0]] } })
    const { container, router } = renderSection('/c/demo/items', { layer })
    await waitFor(() => expect(container.querySelectorAll('.unread-dot')).toHaveLength(1))
    fireEvent.click(cards()[0])
    await screen.findByRole('heading', { level: 1, name: 'Anillo' })
    await waitFor(() => expect(layer.readState.markSeen).toHaveBeenCalledWith('c1', 'items', 1, '', expect.any(Date)))
    await act(async () => {
      await router.navigate(-1)
    })
    await screen.findByRole('heading', { level: 1, name: 'Ítems' })
    expect(container.querySelectorAll('.unread-dot')).toHaveLength(0)
  })
})

describe('Items detail (inline, URL driven)', () => {
  it('renders properties, history, poseedor and tags; wiki links navigate; no "· " dangling without rareza', async () => {
    const { layer } = createFakeLayer({ entities: { items: ITEMS }, index: { items: [indexItem(1, 'Anillo'), indexItem(2, 'Espada')] } })
    const { router } = renderSection('/c/demo/items/1', { layer })
    expect(await screen.findByRole('heading', { level: 1, name: 'Anillo' })).toBeInTheDocument()
    expect(screen.getByText('anillo · raro')).toBeInTheDocument()
    expect(screen.getByText('Sintonía')).toBeInTheDocument()
    expect(screen.getByText('Poseedor actual')).toBeInTheDocument()
    expect(screen.getByText('Ana la PJ')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Propiedades' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Historia' })).toBeInTheDocument()
    expect(screen.getByText('luz', { selector: 'strong' })).toBeInTheDocument()
    expect(main().getByRole('link', { name: '← Volver' })).toHaveAttribute('href', '/c/demo/items')
    fireEvent.click(await screen.findByText('Espada', { selector: 'span.cursor-pointer' }))
    expect(here(router)).toBe('/c/demo/items/2')
    expect(await screen.findByText('Ítem')).toBeInTheDocument() // no tipo, no rareza: just the fallback word
    expect(screen.queryByText('Poseedor actual')).toBeNull()
  })

  it('unknown and non-numeric ids are "no encontrado" without DM requests; a load failure is retryable', async () => {
    const { layer, spies } = createFakeLayer({ entities: { items: ITEMS } })
    const { router } = renderSection('/c/demo/items/77', { layer })
    expect(await screen.findByRole('heading', { level: 1, name: 'Ítem no encontrado' })).toBeInTheDocument()
    await act(async () => {
      await router.navigate('/c/demo/items/-1')
    })
    expect(await screen.findByText(/no corresponde a ningún ítem/)).toBeInTheDocument()
    expect(spies.dmNotesGet).not.toHaveBeenCalled()
  })

  it('a load failure is retryable', async () => {
    const { layer, spies } = createFakeLayer({ entities: { items: ITEMS } })
    spies.entityList.mockRejectedValueOnce(new Error('down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderSection('/c/demo/items/1', { layer })
    expect(await screen.findByRole('alert')).toHaveTextContent('problema de conexión')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Anillo' })).toBeInTheDocument()
    errorSpy.mockRestore()
  })
})

describe('Items as a player', () => {
  it('has no edit / create / wiki id and never reads the DM tables', async () => {
    const { layer, spies } = createFakeLayer({ entities: { items: ITEMS } })
    const { router } = renderSection('/c/demo/items', { layer, isDM: false })
    await waitFor(() => expect(cards()).toHaveLength(2))
    expect(screen.queryByRole('button', { name: '+ Nuevo Ítem' })).toBeNull()
    await act(async () => {
      await router.navigate('/c/demo/items/1')
    })
    await screen.findByRole('heading', { level: 1, name: 'Anillo' })
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
    expect(screen.queryByTitle('ID para wiki-link')).toBeNull()
    expect(spies.dmNotesGet).not.toHaveBeenCalled()
    expect(spies.dmNotesList).not.toHaveBeenCalled()
    expect(spies.getVisibility).not.toHaveBeenCalled()
  })

  it('a draft that reached the client is hidden in the list and by URL', async () => {
    const { layer } = createFakeLayer({ entities: { items: [item(1, { nombre: 'Anillo' }), item(2, { nombre: 'Espada', estado: 'borrador' })] } })
    const { router } = renderSection('/c/demo/items', { layer, isDM: false })
    await waitFor(() => expect(cards()).toHaveLength(1))
    await act(async () => {
      await router.navigate('/c/demo/items/2')
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'Ítem no encontrado' })).toBeInTheDocument()
    expect(screen.queryByText('Espada')).toBeNull()
  })

  it('shows the Secreto tag on a row shared with the player, never Borrador', async () => {
    const { layer } = createFakeLayer({ entities: { items: [item(1, { nombre: 'Anillo', estado: 'secreto' })] } })
    renderSection('/c/demo/items', { layer, isDM: false })
    await waitFor(() => expect(cards()).toHaveLength(1))
    expect(screen.getByText('Secreto')).toBeInTheDocument()
    expect(screen.queryByText('Borrador')).toBeNull()
  })
})

describe('Items as a DM', () => {
  it('sees the wiki id and Borrador tag, and the page makes no DM table request (items have no DM fields)', async () => {
    const { layer, spies } = createFakeLayer({ entities: { items: [item(1, { nombre: 'Anillo', estado: 'borrador' })] } })
    renderSection('/c/demo/items/1', { layer })
    expect(await screen.findByRole('heading', { level: 1, name: 'Anillo' })).toBeInTheDocument()
    expect(screen.getByText('Borrador')).toBeInTheDocument()
    expect(screen.getByTitle('ID para wiki-link')).toHaveTextContent('{1I}')
    expect(spies.dmNotesGet).not.toHaveBeenCalled()
    expect(spies.dmNotesList).not.toHaveBeenCalled()
  })

  it('opens the form to create and edit; a delete goes back to the list', async () => {
    const { layer } = createFakeLayer({ entities: { items: ITEMS } })
    const { router } = renderSection('/c/demo/items', { layer })
    await waitFor(() => expect(cards()).toHaveLength(2))
    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo Ítem' }))
    expect(openFormSpy).toHaveBeenLastCalledWith({ type: 'items' })
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(cards()[0])
    await screen.findByRole('heading', { level: 1, name: 'Anillo' })
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(openFormSpy).toHaveBeenLastCalledWith({ type: 'items', id: 1, onRemoved: expect.any(Function) })
    await screen.findByRole('dialog')
    await act(async () => openFormSpy.mock.calls.at(-1)?.[0].onRemoved?.())
    await waitFor(() => expect(here(router)).toBe('/c/demo/items'))
  })
})
