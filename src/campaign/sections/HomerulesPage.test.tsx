import { act, configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { here } from '../../app/testing/renderApp'
import type { EntityFormRequest } from '../entityFormContext'
import { createFakeLayer } from '../testing/fakeLayer'
import { entity, renderSection } from '../testing/renderSection'

configure({ asyncUtilTimeout: 5000 })

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

const rule = (id: number, over: Record<string, unknown> = {}) => entity(id, { nombre: `Regla ${id}`, texto: `Texto ${id}`, ...over })
const RULES = [
  rule(1, { nombre: 'Crítico doble', texto: 'Los críticos hacen **doble** daño. Ver [[{2H}Fumble]].' }),
  rule(2, { nombre: 'Fumble', texto: '' }),
]

const main = () => within(screen.getByRole('main'))
const cards = () => main().queryAllByRole('link').filter((a) => /\/homerules\/\d+(\?.*)?$/.test(a.getAttribute('href') ?? ''))

describe('Homerules list', () => {
  it('renders cards in id order with a plain teaser and no unread dot', async () => {
    const { layer } = createFakeLayer({ entities: { homebrew_rules: RULES } })
    const { container } = renderSection('/c/demo/homerules', { layer })
    expect(await screen.findByRole('heading', { level: 1, name: 'Homerules' })).toBeInTheDocument()
    await waitFor(() => expect(cards()).toHaveLength(2))
    expect(cards()[0]).toHaveAttribute('href', '/c/demo/homerules/1')
    expect(within(cards()[0]).getByText(/Los críticos hacen doble daño/)).toBeInTheDocument()
    expect(container.querySelectorAll('.unread-dot')).toHaveLength(0)
  })

  it('shows a retryable error when the list cannot load, then the empty state', async () => {
    const { layer, spies } = createFakeLayer({ entities: { homebrew_rules: [] } })
    spies.entityList.mockRejectedValueOnce(new Error('down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderSection('/c/demo/homerules', { layer })
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar las reglas')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Sin reglas')).toBeInTheDocument()
    errorSpy.mockRestore()
  })
})

describe('Homerules detail', () => {
  it('renders the text with wiki links that navigate, and a back link to the list', async () => {
    const { layer } = createFakeLayer({
      entities: { homebrew_rules: RULES },
      index: { homebrew_rules: [{ id: 2, title: 'Fumble', imagen_url: null, estado: 'publicado' }] },
    })
    const { router } = renderSection('/c/demo/homerules/1', { layer })
    expect(await screen.findByRole('heading', { level: 1, name: 'Crítico doble' })).toBeInTheDocument()
    expect(screen.getByText('Homebrew · Regla')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Texto' })).toBeInTheDocument()
    expect(screen.getByText('doble', { selector: 'strong' })).toBeInTheDocument()
    expect(main().getByRole('link', { name: '← Volver' })).toHaveAttribute('href', '/c/demo/homerules')
    fireEvent.click(await screen.findByText('Fumble', { selector: 'span.cursor-pointer' }))
    expect(here(router)).toBe('/c/demo/homerules/2')
    await screen.findByRole('heading', { level: 1, name: 'Fumble' })
    expect(screen.queryByRole('heading', { level: 2, name: 'Texto' })).toBeNull() // empty text: no section
  })

  it('unknown and non-numeric ids are "no encontrado"', async () => {
    const { layer } = createFakeLayer({ entities: { homebrew_rules: RULES } })
    const { router } = renderSection('/c/demo/homerules/77', { layer })
    expect(await screen.findByRole('heading', { level: 1, name: 'Regla no encontrada' })).toBeInTheDocument()
    await act(async () => {
      await router.navigate('/c/demo/homerules/abc')
    })
    expect(await screen.findByText(/no corresponde a ninguna regla/)).toBeInTheDocument()
  })

  it('a load failure is retryable', async () => {
    const { layer, spies } = createFakeLayer({ entities: { homebrew_rules: RULES } })
    spies.entityList.mockRejectedValueOnce(new Error('down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderSection('/c/demo/homerules/1', { layer })
    expect(await screen.findByRole('alert')).toHaveTextContent('problema de conexión')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Crítico doble' })).toBeInTheDocument()
    errorSpy.mockRestore()
  })
})

describe('Homerules as a player', () => {
  it('has no create / edit / wiki id and never reads notes, visibility or read state', async () => {
    const { layer, spies } = createFakeLayer({ entities: { homebrew_rules: RULES } })
    const { router } = renderSection('/c/demo/homerules', { layer, isDM: false })
    await waitFor(() => expect(cards()).toHaveLength(2))
    expect(screen.queryByRole('button', { name: '+ Nueva Regla' })).toBeNull()
    await act(async () => {
      await router.navigate('/c/demo/homerules/1')
    })
    await screen.findByRole('heading', { level: 1, name: 'Crítico doble' })
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
    expect(screen.queryByTitle('ID para wiki-link')).toBeNull()
    expect(spies.dmNotesGet).not.toHaveBeenCalled()
    expect(spies.dmNotesList).not.toHaveBeenCalled()
    expect(spies.getVisibility).not.toHaveBeenCalled()
    expect(layer.readState.markSeen).not.toHaveBeenCalled()
  })

  it('hides a draft that reached the client in the list and by URL; a shared secret shows its tag', async () => {
    const { layer } = createFakeLayer({
      entities: {
        homebrew_rules: [rule(1, { nombre: 'Pública' }), rule(2, { nombre: 'Oculta', estado: 'borrador' }), rule(3, { nombre: 'Compartida', estado: 'secreto' })],
      },
    })
    const { router } = renderSection('/c/demo/homerules', { layer, isDM: false })
    await waitFor(() => expect(cards()).toHaveLength(2))
    expect(screen.getByText('Secreto')).toBeInTheDocument()
    expect(screen.queryByText('Borrador')).toBeNull()
    await act(async () => {
      await router.navigate('/c/demo/homerules/2')
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'Regla no encontrada' })).toBeInTheDocument()
    expect(screen.queryByText('Oculta')).toBeNull()
  })
})

describe('Homerules as a DM', () => {
  it('sees drafts with the Borrador tag and the wiki id, with no DM-note requests', async () => {
    const { layer, spies } = createFakeLayer({ entities: { homebrew_rules: [rule(1, { nombre: 'Borrador regla', estado: 'borrador' })] } })
    renderSection('/c/demo/homerules/1', { layer })
    expect(await screen.findByRole('heading', { level: 1, name: 'Borrador regla' })).toBeInTheDocument()
    expect(screen.getByText('Borrador')).toBeInTheDocument()
    expect(screen.getByTitle('ID para wiki-link')).toHaveTextContent('{1H}')
    expect(spies.dmNotesGet).not.toHaveBeenCalled()
    expect(spies.dmNotesList).not.toHaveBeenCalled()
  })

  it('opens the form to create and edit; a delete goes back to the list', async () => {
    const { layer } = createFakeLayer({ entities: { homebrew_rules: RULES } })
    const { router } = renderSection('/c/demo/homerules', { layer })
    await waitFor(() => expect(cards()).toHaveLength(2))
    fireEvent.click(screen.getByRole('button', { name: '+ Nueva Regla' }))
    expect(openFormSpy).toHaveBeenLastCalledWith({ type: 'homebrew_rules' })
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(cards()[0])
    await screen.findByRole('heading', { level: 1, name: 'Crítico doble' })
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(openFormSpy).toHaveBeenLastCalledWith({ type: 'homebrew_rules', id: 1, onRemoved: expect.any(Function) })
    await screen.findByRole('dialog')
    await act(async () => openFormSpy.mock.calls.at(-1)?.[0].onRemoved?.())
    await waitFor(() => expect(here(router)).toBe('/c/demo/homerules'))
  })
})
