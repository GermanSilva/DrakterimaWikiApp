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
const lore = (id: number, over: Record<string, unknown> = {}) =>
  entity(id, { titulo: `Entrada ${id}`, categoria: 'historia', descripcion: `Descripción ${id}`, ...over })

const LORE = [
  lore(1, { titulo: 'La Caída', categoria: 'historia', descripcion: 'Ver [[{2L}Los Dioses]] y **más**.' }),
  lore(2, { titulo: 'Los Dioses', categoria: 'religión' }),
  lore(3, { titulo: 'Sin categoría', categoria: '', descripcion: '' }),
]

const main = () => within(screen.getByRole('main'))
const cards = () => main().queryAllByRole('link').filter((a) => /\/lore\/\d+(\?.*)?$/.test(a.getAttribute('href') ?? ''))
const titles = () => cards().map((a) => within(a).getByText(/^(La Caída|Los Dioses|Sin categoría)$/).textContent)

describe('Lore list', () => {
  it('renders cards in id order with category tags and plain-text teasers', async () => {
    const { layer } = createFakeLayer({ entities: { lore: LORE } })
    renderSection('/c/demo/lore', { layer })
    expect(await screen.findByRole('heading', { level: 1, name: 'Lore del Mundo' })).toBeInTheDocument()
    await waitFor(() => expect(cards()).toHaveLength(3))
    expect(titles()).toEqual(['La Caída', 'Los Dioses', 'Sin categoría'])
    expect(cards()[0]).toHaveAttribute('href', '/c/demo/lore/1')
    expect(within(cards()[0]).getByText('historia')).toBeInTheDocument()
    expect(within(cards()[0]).getByText('Ver Los Dioses y más.')).toBeInTheDocument()
  })

  it('category pills come from the data (capitalized, none without category), filter and live in ?cat=', async () => {
    const { layer } = createFakeLayer({ entities: { lore: LORE } })
    const { router } = renderSection('/c/demo/lore?cat=religi%C3%B3n', { layer })
    await waitFor(() => expect(titles()).toEqual(['Los Dioses']))
    expect(screen.getByRole('button', { name: 'Religión' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Historia' })).toBeInTheDocument()
    expect(cards()[0]).toHaveAttribute('href', '/c/demo/lore/2?cat=religi%C3%B3n')
    fireEvent.click(screen.getByRole('button', { name: 'Historia' }))
    await waitFor(() => expect(titles()).toEqual(['La Caída']))
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }))
    await waitFor(() => expect(here(router)).toBe('/c/demo/lore'))
    await act(async () => {
      await router.navigate('/c/demo/lore?cat=inexistente') // a category that does not exist reads as Todos
    })
    await waitFor(() => expect(cards()).toHaveLength(3))
    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('the filter survives detail and "← Volver"', async () => {
    const { layer } = createFakeLayer({ entities: { lore: LORE } })
    renderSection('/c/demo/lore?cat=historia', { layer })
    await waitFor(() => expect(titles()).toEqual(['La Caída']))
    fireEvent.click(cards()[0])
    await screen.findByRole('heading', { level: 1, name: 'La Caída' })
    expect(main().getByRole('link', { name: '← Volver' })).toHaveAttribute('href', '/c/demo/lore?cat=historia')
    fireEvent.click(main().getByRole('link', { name: '← Volver' }))
    await waitFor(() => expect(titles()).toEqual(['La Caída']))
  })

  it('empty state names the campaign; a retryable error when the list cannot load', async () => {
    const { layer, spies } = createFakeLayer({ entities: { lore: [] } })
    spies.entityList.mockRejectedValueOnce(new Error('down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderSection('/c/demo/lore', { layer })
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar el lore')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText(/documentar el mundo de Demo/)).toBeInTheDocument()
    errorSpy.mockRestore()
  })

  it('unread dot per card, cleared once the detail was opened', async () => {
    const { layer } = createFakeLayer({ entities: { lore: [LORE[0]] } })
    const { container, router } = renderSection('/c/demo/lore', { layer })
    await waitFor(() => expect(container.querySelectorAll('.unread-dot')).toHaveLength(1))
    fireEvent.click(cards()[0])
    await screen.findByRole('heading', { level: 1, name: 'La Caída' })
    await waitFor(() => expect(layer.readState.markSeen).toHaveBeenCalledWith('c1', 'lore', 1, '', expect.any(Date)))
    await act(async () => {
      await router.navigate(-1)
    })
    await screen.findByRole('heading', { level: 1, name: 'Lore del Mundo' })
    expect(container.querySelectorAll('.unread-dot')).toHaveLength(0)
  })
})

describe('Lore detail (URL driven)', () => {
  it('renders by URL with category eyebrow, Markdown, wiki links; General when there is no category', async () => {
    const { layer } = createFakeLayer({ entities: { lore: LORE }, index: { lore: [indexItem(1, 'La Caída'), indexItem(2, 'Los Dioses')] } })
    const { router } = renderSection('/c/demo/lore/1', { layer })
    expect(await screen.findByRole('heading', { level: 1, name: 'La Caída' })).toBeInTheDocument()
    expect(screen.getByText('Lore · historia')).toBeInTheDocument()
    expect(screen.getByText('más', { selector: 'strong' })).toBeInTheDocument()
    fireEvent.click(await screen.findByText('Los Dioses', { selector: 'span.cursor-pointer' }))
    expect(here(router)).toBe('/c/demo/lore/2')
    await act(async () => {
      await router.navigate('/c/demo/lore/3')
    })
    expect(await screen.findByText('Lore · General')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'Descripción' })).toBeNull()
  })

  it('unknown and non-numeric ids are "no encontrada" without DM requests', async () => {
    const { layer, spies } = createFakeLayer({ entities: { lore: LORE } })
    const { router } = renderSection('/c/demo/lore/77', { layer })
    expect(await screen.findByRole('heading', { level: 1, name: 'Entrada no encontrada' })).toBeInTheDocument()
    await act(async () => {
      await router.navigate('/c/demo/lore/2x')
    })
    expect(await screen.findByText(/no corresponde a ninguna entrada de lore/)).toBeInTheDocument()
    expect(spies.dmNotesGet).not.toHaveBeenCalled()
  })

  it('a load failure is retryable', async () => {
    const { layer, spies } = createFakeLayer({ entities: { lore: LORE } })
    spies.entityList.mockRejectedValueOnce(new Error('down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderSection('/c/demo/lore/1', { layer })
    expect(await screen.findByRole('alert')).toHaveTextContent('problema de conexión')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'La Caída' })).toBeInTheDocument()
    errorSpy.mockRestore()
  })
})

describe('Lore as a player', () => {
  it('never sees the secret block, the wiki id, edit/create, and never reads the DM tables', async () => {
    const { layer, spies } = createFakeLayer({ entities: { lore: LORE }, dmNotes: { 'lore:1': { notas: 'SECRETO DEL MUNDO', secreto: '', ganchos: '' } } })
    const { router } = renderSection('/c/demo/lore', { layer, isDM: false })
    await waitFor(() => expect(cards()).toHaveLength(3))
    expect(screen.queryByRole('button', { name: '+ Nueva Entrada' })).toBeNull()
    await act(async () => {
      await router.navigate('/c/demo/lore/1')
    })
    await screen.findByRole('heading', { level: 1, name: 'La Caída' })
    expect(screen.queryByText(/SECRETO DEL MUNDO|Secretos DM/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
    expect(screen.queryByTitle('ID para wiki-link')).toBeNull()
    expect(spies.dmNotesGet).not.toHaveBeenCalled()
    expect(spies.dmNotesList).not.toHaveBeenCalled()
    expect(spies.getVisibility).not.toHaveBeenCalled()
  })

  it('a draft that reached the client is hidden in the list, in the categories and by URL', async () => {
    const { layer } = createFakeLayer({ entities: { lore: [lore(1, { titulo: 'La Caída' }), lore(2, { titulo: 'Los Dioses', categoria: 'oculta', estado: 'borrador' })] } })
    const { router } = renderSection('/c/demo/lore', { layer, isDM: false })
    await waitFor(() => expect(cards()).toHaveLength(1))
    expect(screen.queryByRole('button', { name: 'Oculta' })).toBeNull() // a hidden row leaks no category name
    await act(async () => {
      await router.navigate('/c/demo/lore/2')
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'Entrada no encontrada' })).toBeInTheDocument()
    expect(screen.queryByText('Los Dioses')).toBeNull()
  })
})

describe('Lore as a DM', () => {
  it('sees "Secretos DM" (notas), the wiki id and estado tags', async () => {
    const { layer, spies } = createFakeLayer({
      entities: { lore: [lore(1, { titulo: 'La Caída', estado: 'secreto' })] },
      dmNotes: { 'lore:1': { notas: 'Los dioses mienten', secreto: '', ganchos: '' } },
    })
    renderSection('/c/demo/lore/1', { layer })
    expect(await screen.findByText('Los dioses mienten')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Secretos DM' })).toBeInTheDocument()
    expect(screen.getByText('Secreto')).toBeInTheDocument()
    expect(screen.getByTitle('ID para wiki-link')).toHaveTextContent('{1L}')
    expect(spies.dmNotesGet).toHaveBeenCalledWith('lore', 1)
  })

  it('opens the form to create and edit; a delete goes back to the list', async () => {
    const { layer } = createFakeLayer({ entities: { lore: LORE } })
    const { router } = renderSection('/c/demo/lore', { layer })
    await waitFor(() => expect(cards()).toHaveLength(3))
    fireEvent.click(screen.getByRole('button', { name: '+ Nueva Entrada' }))
    expect(openFormSpy).toHaveBeenLastCalledWith({ type: 'lore' })
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(cards()[0])
    await screen.findByRole('heading', { level: 1, name: 'La Caída' })
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(openFormSpy).toHaveBeenLastCalledWith({ type: 'lore', id: 1, onRemoved: expect.any(Function) })
    await screen.findByRole('dialog')
    await act(async () => openFormSpy.mock.calls.at(-1)?.[0].onRemoved?.())
    await waitFor(() => expect(here(router)).toBe('/c/demo/lore'))
  })

  it('a failed DM read shows a retryable notice', async () => {
    const { layer, spies } = createFakeLayer({ entities: { lore: LORE }, dmNotes: { 'lore:1': { notas: 'Nota X', secreto: '', ganchos: '' } } })
    spies.dmNotesGet.mockRejectedValueOnce(new Error('down'))
    renderSection('/c/demo/lore/1', { layer })
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar las notas del DM')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Nota X')).toBeInTheDocument()
  })
})
