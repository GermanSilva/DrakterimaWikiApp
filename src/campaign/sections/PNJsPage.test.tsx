import { act, configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { here } from '../../app/testing/renderApp'
import type { WikiIndexItem } from '../../data'
import type { EntityFormRequest } from '../entityFormContext'
import { createFakeLayer } from '../testing/fakeLayer'
import { entity, observers, renderSection } from '../testing/renderSection'

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

const pnj = (id: number, over: Record<string, unknown> = {}) =>
  entity(id, { nombre: `PNJ ${id}`, rol: 'Mercader', region: 'magral', relacion: 'neutral', faccion: '', descripcion: `Descripción ${id}`, historia: '', ...over })

const PNJS = [
  pnj(1, { nombre: 'Ana', relacion: 'aliado', faccion: 'Orden de Argan', rol: 'Comandante' }),
  pnj(2, { nombre: 'Bruno', relacion: 'enemigo', region: 'nezor', descripcion: '' }),
  pnj(3, { nombre: 'Carla', relacion: 'neutral', region: 'frontera', historia: 'Su **historia**' }),
]

const main = () => within(screen.getByRole('main'))
const cards = () => main().queryAllByRole('link').filter((a) => /\/pnjs\/\d+(\?.*)?$/.test(a.getAttribute('href') ?? ''))
const names = () => cards().map((a) => within(a).getByText(/^(Ana|Bruno|Carla)$/).textContent)

describe('PNJs list', () => {
  it('renders the cards in id order with an h1, tags and the fallback description', async () => {
    const { layer } = createFakeLayer({ entities: { pnjs: PNJS } })
    renderSection('/c/demo/pnjs', { layer })
    expect(await screen.findByRole('heading', { level: 1, name: 'PNJs' })).toBeInTheDocument()
    await waitFor(() => expect(cards()).toHaveLength(3))
    expect(names()).toEqual(['Ana', 'Bruno', 'Carla'])
    expect(cards()[0]).toHaveAttribute('href', '/c/demo/pnjs/1')
    expect(within(cards()[0]).getByText('Comandante')).toBeInTheDocument()
    expect(within(cards()[0]).getByText('Aliado')).toBeInTheDocument()
    expect(within(cards()[0]).getByText('Orden de Argan')).toBeInTheDocument()
    expect(within(cards()[1]).getByText('Sin descripción.')).toBeInTheDocument()
  })

  it('uses the campaign regions for labels, falling back to the legacy names and then the raw key', async () => {
    const { layer } = createFakeLayer({ entities: { pnjs: PNJS } })
    renderSection('/c/demo/pnjs', { layer, regions: [{ key: 'magral', label: 'Tierras de Magral', color: '#7aad82' }] })
    await waitFor(() => expect(cards()).toHaveLength(3))
    expect(within(cards()[0]).getByText('Tierras de Magral')).toBeInTheDocument()
    expect(within(cards()[1]).getByText('Nezor')).toBeInTheDocument() // legacy name for an unconfigured known key
    expect(within(cards()[2]).getByText('frontera')).toBeInTheDocument() // unknown key
  })

  it('filters by relación (pressed state) and by name / rol / facción search', async () => {
    const { layer } = createFakeLayer({ entities: { pnjs: PNJS } })
    renderSection('/c/demo/pnjs', { layer })
    await waitFor(() => expect(cards()).toHaveLength(3))
    const enemigos = screen.getByRole('button', { name: 'Enemigos' })
    fireEvent.click(enemigos)
    expect(enemigos).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(names()).toEqual(['Bruno']))
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }))
    const search = screen.getByRole('searchbox', { name: 'Buscar PNJs' })
    fireEvent.change(search, { target: { value: 'argan' } }) // facción, case-insensitive
    await waitFor(() => expect(names()).toEqual(['Ana']))
    fireEvent.change(search, { target: { value: 'MERCADER' } }) // rol
    await waitFor(() => expect(names()).toEqual(['Bruno', 'Carla']))
    fireEvent.change(search, { target: { value: 'nadie' } })
    expect(await screen.findByText('Sin resultados')).toBeInTheDocument()
    expect(screen.getByText('No hay PNJs que coincidan con la búsqueda.')).toBeInTheDocument()
  })

  it('empty campaign: invites to add PNJs of this campaign', async () => {
    const { layer } = createFakeLayer({ entities: { pnjs: [] } })
    renderSection('/c/demo/pnjs', { layer })
    expect(await screen.findByText(/poblar Demo/)).toBeInTheDocument()
  })

  it('shows a retryable error when the list cannot load', async () => {
    const { layer, spies } = createFakeLayer({ entities: { pnjs: PNJS } })
    spies.entityList.mockRejectedValueOnce(new Error('down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderSection('/c/demo/pnjs', { layer })
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los PNJs')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(cards()).toHaveLength(3))
    errorSpy.mockRestore()
  })

  it('unread dot per card, cleared once the detail was opened', async () => {
    const { layer } = createFakeLayer({ entities: { pnjs: [PNJS[0]] } })
    const { container, router } = renderSection('/c/demo/pnjs', { layer })
    await waitFor(() => expect(container.querySelectorAll('.unread-dot')).toHaveLength(1))
    fireEvent.click(cards()[0])
    await screen.findByRole('heading', { level: 1, name: 'Ana' })
    await waitFor(() => expect(layer.readState.markSeen).toHaveBeenCalledWith('c1', 'pnjs', 1, '', expect.any(Date)))
    await act(async () => {
      await router.navigate(-1)
    })
    await screen.findByRole('heading', { level: 1, name: 'PNJs' })
    expect(container.querySelectorAll('.unread-dot')).toHaveLength(0)
  })
})

describe('PNJs detail (URL driven)', () => {
  it('renders by URL with description and history, links back to the list, and back/forward work', async () => {
    const { layer } = createFakeLayer({ entities: { pnjs: PNJS } })
    const { router } = renderSection('/c/demo/pnjs', { layer })
    await waitFor(() => expect(cards()).toHaveLength(3))
    fireEvent.click(cards()[2])
    expect(await screen.findByRole('heading', { level: 1, name: 'Carla' })).toBeInTheDocument()
    expect(here(router)).toBe('/c/demo/pnjs/3')
    expect(screen.getByRole('heading', { level: 2, name: 'Historia' })).toBeInTheDocument()
    expect(screen.getByText('historia', { selector: 'strong' })).toBeInTheDocument() // WikiText markdown
    expect(screen.getByRole('heading', { level: 2, name: 'Descripción' })).toBeInTheDocument()
    expect(main().getByRole('link', { name: '← Volver' })).toHaveAttribute('href', '/c/demo/pnjs')
    await act(async () => {
      await router.navigate(-1)
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'PNJs' })).toBeInTheDocument()
  })

  it('says it does not exist for an unknown id and for a non-numeric id (no request for it)', async () => {
    const { layer, spies } = createFakeLayer({ entities: { pnjs: PNJS } })
    const { router } = renderSection('/c/demo/pnjs/77', { layer })
    expect(await screen.findByRole('heading', { level: 1, name: 'PNJ no encontrado' })).toBeInTheDocument()
    expect(screen.getByText(/ya no existe/)).toBeInTheDocument()
    expect(spies.dmNotesGet).not.toHaveBeenCalled() // an id that does not exist is never read from the DM table
    await act(async () => {
      await router.navigate('/c/demo/pnjs/x1')
    })
    expect(await screen.findByText(/no corresponde a ningún PNJ/)).toBeInTheDocument()
    expect(spies.dmNotesGet).not.toHaveBeenCalled()
  })

  it('distinguishes a load failure from not-found', async () => {
    const { layer, spies } = createFakeLayer({ entities: { pnjs: PNJS } })
    spies.entityList.mockRejectedValueOnce(new Error('down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderSection('/c/demo/pnjs/1', { layer })
    expect(await screen.findByRole('alert')).toHaveTextContent('problema de conexión')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Ana' })).toBeInTheDocument()
    errorSpy.mockRestore()
  })

  it('turns into "ya no existe" when the row is deleted in realtime while open', async () => {
    const { layer, fake } = createFakeLayer({ entities: { pnjs: PNJS } })
    renderSection('/c/demo/pnjs/1', { layer })
    await screen.findByRole('heading', { level: 1, name: 'Ana' })
    act(() => fake.channels.find((c) => c.name.startsWith('campaign:pnjs:'))?.emit('DELETE', { old: { id: 1 } }))
    expect(await screen.findByRole('heading', { level: 1, name: 'PNJ no encontrado' })).toBeInTheDocument()
  })

  it('fades the name into the sticky bar when the title leaves the viewport', async () => {
    const { layer } = createFakeLayer({ entities: { pnjs: PNJS } })
    renderSection('/c/demo/pnjs/1', { layer })
    const title = await screen.findByRole('heading', { level: 1, name: 'Ana' })
    const bar = title.ownerDocument.querySelector('.sticky span[aria-hidden="true"]') as HTMLElement
    expect(bar.style.opacity).toBe('0')
    await waitFor(() => expect(observers.some((o) => o.target === title)).toBe(true))
    const observer = observers.find((o) => o.target === title)
    act(() => observer?.callback([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver))
    expect(bar.style.opacity).toBe('1')
  })

  it('wiki links in the long fields navigate to the hub routes', async () => {
    const { layer } = createFakeLayer({
      entities: { pnjs: [pnj(1, { nombre: 'Ana', descripcion: 'Hermana de [[{4N}Kardevir]].' })] },
      index: { pnjs: [indexItem(1, 'Ana'), indexItem(4, 'Kardevir')] },
    })
    const { router } = renderSection('/c/demo/pnjs/1', { layer })
    fireEvent.click(await screen.findByText('Kardevir', { selector: 'span.cursor-pointer' }))
    expect(here(router)).toBe('/c/demo/pnjs/4')
  })
})

describe('PNJs as a player', () => {
  const dmNotes = { 'pnjs:1': { notas: 'NOTA DEL DM', secreto: 'MOTIVACION SECRETA', ganchos: '' } }

  it('never sees secreto / notas, lock icons, edit or create, and never reads the DM tables', async () => {
    const { layer, spies } = createFakeLayer({ entities: { pnjs: PNJS }, dmNotes })
    const { router } = renderSection('/c/demo/pnjs', { layer, isDM: false })
    await waitFor(() => expect(cards()).toHaveLength(3))
    expect(screen.queryByRole('img', { name: 'Tiene secreto DM' })).toBeNull()
    expect(screen.queryByRole('button', { name: '+ Nuevo PNJ' })).toBeNull()
    await act(async () => {
      await router.navigate('/c/demo/pnjs/1')
    })
    await screen.findByRole('heading', { level: 1, name: 'Ana' })
    expect(screen.queryByText(/MOTIVACION SECRETA|NOTA DEL DM/)).toBeNull()
    expect(screen.queryByText(/Motivaciones secretas|Notas DM/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
    expect(spies.dmNotesGet).not.toHaveBeenCalled()
    expect(spies.dmNotesList).not.toHaveBeenCalled()
    expect(spies.getVisibility).not.toHaveBeenCalled()
  })

  it('a draft that reached the client is hidden in the list and by URL; no estado tags for published rows', async () => {
    const { layer } = createFakeLayer({ entities: { pnjs: [pnj(1, { nombre: 'Ana' }), pnj(2, { nombre: 'Bruno', estado: 'borrador' })] } })
    const { router } = renderSection('/c/demo/pnjs', { layer, isDM: false })
    await waitFor(() => expect(cards()).toHaveLength(1))
    expect(screen.queryByText('Bruno')).toBeNull()
    expect(screen.queryByText('Borrador')).toBeNull()
    await act(async () => {
      await router.navigate('/c/demo/pnjs/2')
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'PNJ no encontrado' })).toBeInTheDocument()
    expect(screen.queryByText('Bruno')).toBeNull()
  })
})

describe('PNJs as a DM', () => {
  it('sees the lock only on PNJs with a DM secret, and the secret blocks in the detail', async () => {
    const { layer, spies } = createFakeLayer({
      entities: { pnjs: PNJS },
      dmNotes: {
        'pnjs:1': { notas: 'Nota DM de Ana', secreto: 'Quiere el trono', ganchos: '' },
        'pnjs:2': { notas: 'solo notas', secreto: '   ', ganchos: '' },
      },
    })
    const { router } = renderSection('/c/demo/pnjs', { layer })
    await waitFor(() => expect(cards()).toHaveLength(3))
    await waitFor(() => expect(screen.getAllByRole('img', { name: 'Tiene secreto DM' })).toHaveLength(1))
    expect(within(cards()[0]).getByRole('img', { name: 'Tiene secreto DM' })).toBeInTheDocument()
    expect(spies.dmNotesList).toHaveBeenCalled()
    await act(async () => {
      await router.navigate('/c/demo/pnjs/1')
    })
    expect(await screen.findByText('Quiere el trono')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Motivaciones secretas' })).toBeInTheDocument()
    expect(screen.getByText('Nota DM de Ana')).toBeInTheDocument()
    expect(spies.dmNotesGet).toHaveBeenCalledWith('pnjs', 1)
  })

  it('shows Borrador / Secreto tags', async () => {
    const { layer } = createFakeLayer({ entities: { pnjs: [pnj(1, { nombre: 'Ana', estado: 'borrador' }), pnj(2, { nombre: 'Bruno', estado: 'secreto' })] } })
    renderSection('/c/demo/pnjs', { layer })
    await waitFor(() => expect(cards()).toHaveLength(2))
    expect(screen.getByText('Borrador')).toBeInTheDocument()
    expect(screen.getByText('Secreto')).toBeInTheDocument()
  })

  it('opens the form to create and, from the detail, to edit this PNJ; a delete goes back to the list', async () => {
    const { layer } = createFakeLayer({ entities: { pnjs: PNJS } })
    const { router } = renderSection('/c/demo/pnjs', { layer })
    await waitFor(() => expect(cards()).toHaveLength(3))
    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo PNJ' }))
    expect(openFormSpy).toHaveBeenLastCalledWith({ type: 'pnjs' })
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    fireEvent.click(cards()[0])
    await screen.findByRole('heading', { level: 1, name: 'Ana' })
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(openFormSpy).toHaveBeenLastCalledWith({ type: 'pnjs', id: 1, onRemoved: expect.any(Function) })
    await screen.findByRole('dialog')
    await act(async () => openFormSpy.mock.calls.at(-1)?.[0].onRemoved?.())
    await waitFor(() => expect(here(router)).toBe('/c/demo/pnjs'))
  })
})

describe('PNJs: list filters live in the URL', () => {
  it('?rel= and ?q= restore the filtered list and survive detail, "← Volver" and browser back', async () => {
    const { layer } = createFakeLayer({ entities: { pnjs: PNJS } })
    const { router } = renderSection('/c/demo/pnjs?rel=aliado&q=argan', { layer })
    await waitFor(() => expect(names()).toEqual(['Ana']))
    expect(screen.getByRole('button', { name: 'Aliados' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('searchbox', { name: 'Buscar PNJs' })).toHaveValue('argan')
    expect(cards()[0]).toHaveAttribute('href', '/c/demo/pnjs/1?rel=aliado&q=argan')
    fireEvent.click(cards()[0])
    await screen.findByRole('heading', { level: 1, name: 'Ana' })
    expect(main().getByRole('link', { name: '← Volver' })).toHaveAttribute('href', '/c/demo/pnjs?rel=aliado&q=argan')
    fireEvent.click(main().getByRole('link', { name: '← Volver' }))
    await waitFor(() => expect(names()).toEqual(['Ana']))
    expect(screen.getByRole('searchbox', { name: 'Buscar PNJs' })).toHaveValue('argan')
    await act(async () => {
      await router.navigate(-1)
    })
    await screen.findByRole('heading', { level: 1, name: 'Ana' })
    await act(async () => {
      await router.navigate(-1)
    })
    await waitFor(() => expect(here(router)).toBe('/c/demo/pnjs?rel=aliado&q=argan'))
  })

  it('typing and picking a filter rewrite the URL; defaults are not written; an unknown ?rel= is "Todos"', async () => {
    const { layer } = createFakeLayer({ entities: { pnjs: PNJS } })
    const { router } = renderSection('/c/demo/pnjs?rel=raro', { layer })
    await waitFor(() => expect(cards()).toHaveLength(3))
    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar PNJs' }), { target: { value: 'bru' } })
    await waitFor(() => expect(here(router)).toContain('q=bru'))
    fireEvent.click(screen.getByRole('button', { name: 'Enemigos' }))
    await waitFor(() => expect(here(router)).toContain('rel=enemigo'))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar PNJs' }), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }))
    await waitFor(() => expect(here(router)).toBe('/c/demo/pnjs'))
  })
})

describe('PNJs: DM-only reads never fail silently', () => {
  it('shows a retryable notice when the DM notes of the detail cannot be read', async () => {
    const { layer, spies } = createFakeLayer({ entities: { pnjs: PNJS }, dmNotes: { 'pnjs:1': { notas: 'Nota X', secreto: '', ganchos: '' } } })
    spies.dmNotesGet.mockRejectedValueOnce(new Error('down'))
    renderSection('/c/demo/pnjs/1', { layer })
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar las notas del DM')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Nota X')).toBeInTheDocument()
  })

  it('shows a discreet notice in the list when the lock icons cannot be loaded, and retries', async () => {
    const { layer, spies } = createFakeLayer({ entities: { pnjs: PNJS }, dmNotes: { 'pnjs:1': { notas: '', secreto: 'S', ganchos: '' } } })
    spies.dmNotesList.mockRejectedValueOnce(new Error('down'))
    renderSection('/c/demo/pnjs', { layer })
    expect(await screen.findByRole('alert')).toHaveTextContent('candados')
    expect(screen.queryByRole('img', { name: 'Tiene secreto DM' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('img', { name: 'Tiene secreto DM' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('reads only the PNJ notes, and the lock has a hover tooltip', async () => {
    const { layer, spies } = createFakeLayer({ entities: { pnjs: PNJS }, dmNotes: { 'pnjs:1': { notas: '', secreto: 'S', ganchos: '' }, 'lugares:5': { notas: '', secreto: 'L', ganchos: '' } } })
    renderSection('/c/demo/pnjs', { layer })
    expect(await screen.findByTitle('Tiene secreto DM')).toBeInTheDocument()
    expect(spies.dmNotesList).toHaveBeenCalledWith('c1', 'pnjs')
  })

  it('a player never gets the lock notice (no DM read is made)', async () => {
    const { layer, spies } = createFakeLayer({ entities: { pnjs: PNJS } })
    spies.dmNotesList.mockRejectedValue(new Error('would fail'))
    renderSection('/c/demo/pnjs', { layer, isDM: false })
    await waitFor(() => expect(cards()).toHaveLength(3))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(spies.dmNotesList).not.toHaveBeenCalled()
  })
})
