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
const faccion = (id: number, over: Record<string, unknown> = {}) =>
  entity(id, { nombre: `Facción ${id}`, tipo: 'Gremio', region: 'norte', relacion: 'neutral', descripcion: `Descripción ${id}`, imagen_url: '', ...over })

const FACCIONES = [
  faccion(1, { nombre: 'Orden', relacion: 'aliado', descripcion: 'Rival de [[{2F}Culto]].' }),
  faccion(2, { nombre: 'Culto', relacion: 'enemigo', tipo: '', region: '' }),
]

const main = () => within(screen.getByRole('main'))
const cards = () => main().queryAllByRole('link').filter((a) => /\/facciones\/\d+(\?.*)?$/.test(a.getAttribute('href') ?? ''))

describe('Facciones list', () => {
  it('renders cards in id order with tipo, region, relación and teaser; no filters like the legacy page', async () => {
    const { layer } = createFakeLayer({ entities: { facciones: FACCIONES } })
    renderSection('/c/demo/facciones', { layer, regions: [{ key: 'norte', label: 'Norte' }] })
    expect(await screen.findByRole('heading', { level: 1, name: 'Facciones' })).toBeInTheDocument()
    await waitFor(() => expect(cards()).toHaveLength(2))
    expect(cards()[0]).toHaveAttribute('href', '/c/demo/facciones/1')
    expect(within(cards()[0]).getByText('Orden')).toBeInTheDocument()
    expect(within(cards()[0]).getByText('Gremio')).toBeInTheDocument()
    expect(within(cards()[0]).getByText('Norte')).toBeInTheDocument()
    expect(within(cards()[0]).getByText('Aliado')).toBeInTheDocument()
    expect(within(cards()[0]).getByText('Rival de Culto.')).toBeInTheDocument()
    expect(within(cards()[1]).getByText('Enemigo')).toBeInTheDocument()
    expect(within(cards()[1]).queryByText('Gremio')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Todos' })).toBeNull()
  })

  it('empty state names the campaign; a retryable error when the list cannot load', async () => {
    const { layer, spies } = createFakeLayer({ entities: { facciones: [] } })
    spies.entityList.mockRejectedValueOnce(new Error('down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderSection('/c/demo/facciones', { layer })
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar las facciones')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText(/definir el poder en Demo/)).toBeInTheDocument()
    errorSpy.mockRestore()
  })

  it('unread dot per card, cleared once the detail was opened', async () => {
    const { layer } = createFakeLayer({ entities: { facciones: [FACCIONES[0]] } })
    const { container, router } = renderSection('/c/demo/facciones', { layer })
    await waitFor(() => expect(container.querySelectorAll('.unread-dot')).toHaveLength(1))
    fireEvent.click(cards()[0])
    await screen.findByRole('heading', { level: 1, name: 'Orden' })
    await waitFor(() => expect(layer.readState.markSeen).toHaveBeenCalledWith('c1', 'facciones', 1, '', expect.any(Date)))
    await act(async () => {
      await router.navigate(-1)
    })
    await screen.findByRole('heading', { level: 1, name: 'Facciones' })
    expect(container.querySelectorAll('.unread-dot')).toHaveLength(0)
  })
})

describe('Facciones detail (URL driven)', () => {
  it('renders by URL with tags, description and wiki links; "← Volver" is the list link', async () => {
    const { layer } = createFakeLayer({ entities: { facciones: FACCIONES }, index: { facciones: [indexItem(1, 'Orden'), indexItem(2, 'Culto')] } })
    const { router } = renderSection('/c/demo/facciones/1', { layer })
    expect(await screen.findByRole('heading', { level: 1, name: 'Orden' })).toBeInTheDocument()
    expect(screen.getByText('Facción · Gremio')).toBeInTheDocument()
    expect(screen.getByText('Aliado')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Descripción' })).toBeInTheDocument()
    expect(main().getByRole('link', { name: '← Volver' })).toHaveAttribute('href', '/c/demo/facciones')
    fireEvent.click(await screen.findByText('Culto', { selector: 'span.cursor-pointer' }))
    expect(here(router)).toBe('/c/demo/facciones/2')
    expect(await screen.findByText('Facción · Organización')).toBeInTheDocument() // no tipo: legacy fallback
  })

  it.each(['facción', 'Facción', ' FACCION '])('shows the subtitle once when tipo is the legacy default %j', async (tipo) => {
    const { layer } = createFakeLayer({ entities: { facciones: [faccion(1, { nombre: 'Orden', tipo })] } })
    renderSection('/c/demo/facciones/1', { layer })
    const title = await screen.findByRole('heading', { level: 1, name: 'Orden' })
    expect(title.previousElementSibling?.textContent).toBe('Facción') // the eyebrow, once
  })

  it('unknown and non-numeric ids are "no encontrada" (no DM request); a load failure is retryable', async () => {
    const { layer, spies } = createFakeLayer({ entities: { facciones: FACCIONES } })
    const { router } = renderSection('/c/demo/facciones/77', { layer })
    expect(await screen.findByRole('heading', { level: 1, name: 'Facción no encontrada' })).toBeInTheDocument()
    await act(async () => {
      await router.navigate('/c/demo/facciones/abc')
    })
    expect(await screen.findByText(/no corresponde a ninguna facción/)).toBeInTheDocument()
    expect(spies.dmNotesGet).not.toHaveBeenCalled()

  })
})

describe('Facciones detail: load failure', () => {
  it('shows a retryable alert, then the faction', async () => {
    const { layer, spies } = createFakeLayer({ entities: { facciones: FACCIONES } })
    spies.entityList.mockRejectedValueOnce(new Error('down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderSection('/c/demo/facciones/1', { layer })
    expect(await screen.findByRole('alert')).toHaveTextContent('problema de conexión')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Orden' })).toBeInTheDocument()
    errorSpy.mockRestore()
  })
})

describe('Facciones as a player', () => {
  const dmNotes = { 'facciones:1': { notas: 'NOTA DM', secreto: 'OBJETIVO SECRETO', ganchos: '' } }

  it('never sees objetivos secretos / notas, the wiki id, edit/create, and never reads the DM tables', async () => {
    const { layer, spies } = createFakeLayer({ entities: { facciones: FACCIONES }, dmNotes })
    const { router } = renderSection('/c/demo/facciones', { layer, isDM: false })
    await waitFor(() => expect(cards()).toHaveLength(2))
    expect(screen.queryByRole('button', { name: '+ Nueva Facción' })).toBeNull()
    await act(async () => {
      await router.navigate('/c/demo/facciones/1')
    })
    await screen.findByRole('heading', { level: 1, name: 'Orden' })
    expect(screen.queryByText(/OBJETIVO SECRETO|NOTA DM|Objetivos secretos|Notas DM/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
    expect(screen.queryByTitle('ID para wiki-link')).toBeNull()
    expect(spies.dmNotesGet).not.toHaveBeenCalled()
    expect(spies.dmNotesList).not.toHaveBeenCalled()
    expect(spies.getVisibility).not.toHaveBeenCalled()
  })

  it('a draft that reached the client is hidden in the list and by URL', async () => {
    const { layer } = createFakeLayer({ entities: { facciones: [faccion(1, { nombre: 'Orden' }), faccion(2, { nombre: 'Culto', estado: 'borrador' })] } })
    const { router } = renderSection('/c/demo/facciones', { layer, isDM: false })
    await waitFor(() => expect(cards()).toHaveLength(1))
    await act(async () => {
      await router.navigate('/c/demo/facciones/2')
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'Facción no encontrada' })).toBeInTheDocument()
    expect(screen.queryByText('Culto')).toBeNull()
  })
})

describe('Facciones as a DM', () => {
  it('sees objetivos secretos and notas DM, the wiki id, estado tags', async () => {
    const { layer, spies } = createFakeLayer({
      entities: { facciones: [faccion(1, { nombre: 'Orden', estado: 'secreto' })] },
      dmNotes: { 'facciones:1': { notas: 'Nota del DM', secreto: 'Quieren el trono', ganchos: '' } },
    })
    renderSection('/c/demo/facciones/1', { layer })
    expect(await screen.findByText('Quieren el trono')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Objetivos secretos' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Notas DM' })).toBeInTheDocument()
    expect(screen.getByText('Nota del DM')).toBeInTheDocument()
    expect(screen.getByText('Secreto')).toBeInTheDocument()
    expect(screen.getByTitle('ID para wiki-link')).toHaveTextContent('{1F}')
    expect(spies.dmNotesGet).toHaveBeenCalledWith('facciones', 1)
  })

  it('opens the form to create and edit; a delete goes back to the list', async () => {
    const { layer } = createFakeLayer({ entities: { facciones: FACCIONES } })
    const { router } = renderSection('/c/demo/facciones', { layer })
    await waitFor(() => expect(cards()).toHaveLength(2))
    fireEvent.click(screen.getByRole('button', { name: '+ Nueva Facción' }))
    expect(openFormSpy).toHaveBeenLastCalledWith({ type: 'facciones' })
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(cards()[0])
    await screen.findByRole('heading', { level: 1, name: 'Orden' })
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(openFormSpy).toHaveBeenLastCalledWith({ type: 'facciones', id: 1, onRemoved: expect.any(Function) })
    await screen.findByRole('dialog')
    await act(async () => openFormSpy.mock.calls.at(-1)?.[0].onRemoved?.())
    await waitFor(() => expect(here(router)).toBe('/c/demo/facciones'))
  })

  it('a failed DM read shows a retryable notice', async () => {
    const { layer, spies } = createFakeLayer({ entities: { facciones: FACCIONES }, dmNotes: { 'facciones:1': { notas: 'Nota X', secreto: '', ganchos: '' } } })
    spies.dmNotesGet.mockRejectedValueOnce(new Error('down'))
    renderSection('/c/demo/facciones/1', { layer })
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar las notas del DM')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Nota X')).toBeInTheDocument()
  })
})
