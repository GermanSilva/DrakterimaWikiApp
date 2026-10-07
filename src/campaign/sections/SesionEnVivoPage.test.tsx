import { act, configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConflictError } from '../../data'
import { retryPolicy } from './useSessionLayout'
import { createFakeLayer } from '../testing/fakeLayer'
import { entity, renderSection } from '../testing/renderSection'

configure({ asyncUtilTimeout: 5000 })

// dnd-kit needs real pointer geometry: capture the screen's onDragEnd and drive it directly.
type DragEnd = (event: { active: { id: unknown }; over: { id: unknown } | null }) => void
let dragEnd: DragEnd | null = null
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>()
  return {
    ...actual,
    DndContext: (props: { onDragEnd: DragEnd }) => {
      dragEnd = props.onDragEnd
      return createElement(actual.DndContext, props as never)
    },
  }
})

const DEFAULT_DELAYS = retryPolicy.delays
beforeEach(() => {
  window.confirm = vi.fn(() => true)
  retryPolicy.delays = [5, 5, 5]
})
afterEach(() => {
  retryPolicy.delays = DEFAULT_DELAYS
  dragEnd = null
  vi.restoreAllMocks()
})

type Spies = ReturnType<typeof createFakeLayer>['spies']
const PATH = '/c/demo/sesion-en-vivo'
const COINS0 = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }
const pj = (id: number, over: Record<string, unknown> = {}) =>
  entity(id, { nombre: `PJ ${id}`, jugador: '', clase: 'Guerrero', raza: '', region: 'otro', nivel: 1, sections_updated: {}, monedas: COINS0, monedas_guardado: {}, ...over })
const ELDRIC = pj(1, { nombre: 'Eldric', stat_hp: 40, stat_hp_current: 31, stat_ac: 18, stat_speed: 30 })
const MAISIE = pj(2, { nombre: 'Maisie', stat_hp: 20 }) // no stat_hp_current: defaults to the maximum

const CARDS = [
  { id: 11, tipo: 'stats' },
  { id: 12, tipo: 'notes', text: 'Recordar la emboscada' },
  { id: 13, tipo: 'rules' },
  { id: 14, tipo: 'combat', combatants: [] },
]
const layout = (cards: unknown[] = CARDS) => ({ session_screen: { value: { cards }, updated_at: 'v1' } })
const tab = (name: string) => screen.getByRole('button', { name })
const cardIds = () => Array.from(document.querySelectorAll('[data-card-id]')).map((el) => Number(el.getAttribute('data-card-id')))
const patchCalls = (spies: Spies) => spies.configPatch.mock.calls
const cardsOf = (call: unknown[]) => (call[2] as { cards: { id: number; tipo: string; text?: string; combatants?: { iniciativa: unknown }[] }[] }).cards

async function open(opts: Parameters<typeof createFakeLayer>[0] = {}) {
  const fake = createFakeLayer({ entities: { pjs: [ELDRIC, MAISIE], homebrew_rules: [] }, config: layout(), ...opts })
  const view = renderSection(PATH, { layer: fake.layer })
  await screen.findByRole('button', { name: '+ Agregar pestaña' })
  return { ...fake, view }
}

describe('session screen (hub): rendering', () => {
  it('renders the cards of session_screen as tabs and as the stack, in layout order', async () => {
    const { spies } = await open()
    for (const label of ['Stats', 'Notas', 'Reglas', 'Combate']) expect(tab(label)).toBeInTheDocument()
    expect(cardIds()).toEqual([11, 12, 13, 14])
    expect(spies.configGet).toHaveBeenCalledWith('c1', 'session_screen')
    expect(screen.getByDisplayValue('Recordar la emboscada')).toBeInTheDocument()
    // per-PJ cards list every character
    expect(screen.getByRole('button', { name: /Eldric/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Maisie/ })).toBeInTheDocument()
  })

  it('is full-bleed (no page padding) and listed in the DM nav', async () => {
    await open()
    expect(screen.getByRole('main').firstElementChild?.className).not.toContain('max-w-[1100px]')
    expect(screen.getByRole('link', { name: 'Sesión en vivo' })).toBeInTheDocument()
  })

  it('filters obsolete card types without writing', async () => {
    const { spies } = await open({ config: layout([{ id: 1, tipo: 'hp-ac' }, { id: 2, tipo: 'stats' }, { id: 3, tipo: 'notes', text: '' }]) })
    expect(cardIds()).toEqual([2, 3])
    expect(spies.configPatch).not.toHaveBeenCalled()
  })

  it('a missing session_screen row renders the empty state and the first card creates it (base null)', async () => {
    const fake = createFakeLayer({ entities: { pjs: [ELDRIC], homebrew_rules: [] } })
    renderSection(PATH, { layer: fake.layer })
    await screen.findByText('Todavía no agregaste ninguna pestaña a la pantalla de sesión.')
    fireEvent.click(screen.getAllByRole('button', { name: '+ Agregar pestaña' })[0])
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Notas' }))
    await waitFor(() => expect(fake.spies.configPatch).toHaveBeenCalledTimes(1))
    const call = patchCalls(fake.spies)[0]
    expect(call[1]).toBe('session_screen')
    expect(call[3]).toBe('dm')
    expect(call[4]).toBeNull()
    expect(cardsOf(call).map((c) => c.tipo)).toEqual(['notes'])
  })
})

describe('session screen (hub): layout writes', () => {
  it('reordering persists the reordered list (obsolete entries dropped) guarded by the loaded updated_at', async () => {
    const { spies } = await open({ config: layout([{ id: 9, tipo: 'hp-ac' }, ...CARDS]) })
    act(() => dragEnd?.({ active: { id: 'tab-14' }, over: { id: 'tab-11' } }))
    await waitFor(() => expect(spies.configPatch).toHaveBeenCalledTimes(1))
    const call = patchCalls(spies)[0]
    expect([call[0], call[1], call[3], call[4]]).toEqual(['c1', 'session_screen', 'dm', 'v1'])
    expect(cardsOf(call).map((c) => c.id)).toEqual([14, 11, 12, 13])
    await waitFor(() => expect(cardIds()).toEqual([14, 11, 12, 13]))
  })

  it('two quick changes compose on the latest list and the follow-up write uses the version the first one returned', async () => {
    const { spies } = await open()
    act(() => {
      dragEnd?.({ active: { id: 14 }, over: { id: 11 } }) // 14 11 12 13
      dragEnd?.({ active: { id: 13 }, over: { id: 14 } }) // 13 14 11 12
    })
    await waitFor(() => expect(patchCalls(spies)).toHaveLength(2))
    // exactly two writes: the first change alone, then the newest list chained on the version the first one returned
    expect(patchCalls(spies).map((c) => c[4])).toEqual(['v1', 'v2'])
    expect(cardsOf(patchCalls(spies)[0]).map((c) => c.id)).toEqual([14, 11, 12, 13])
    expect(cardsOf(patchCalls(spies)[1]).map((c) => c.id)).toEqual([13, 14, 11, 12])
  })

  it('adds a tab from the picker (only missing types are offered) and removes one', async () => {
    const { spies } = await open()
    fireEvent.click(tab('+ Agregar pestaña'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByRole('button', { name: 'Stats' })).toBeNull() // already present
    fireEvent.click(within(dialog).getByRole('button', { name: 'Inspiración' }))
    await waitFor(() => expect(patchCalls(spies)).toHaveLength(1))
    expect(cardsOf(patchCalls(spies)[0]).map((c) => c.tipo)).toEqual(['stats', 'notes', 'rules', 'combat', 'inspiration'])
    await waitFor(() => expect(tab('Inspiración')).toBeInTheDocument())

    fireEvent.click(within(document.getElementById('session-card-12') as HTMLElement).getByRole('button', { name: 'Quitar pestaña' }))
    await waitFor(() => expect(patchCalls(spies)).toHaveLength(2))
    expect(cardsOf(patchCalls(spies)[1]).map((c) => c.id)).not.toContain(12)
    expect(patchCalls(spies)[1][4]).toBe('v2')
  })

  it('a conflicting write (another tab changed the layout) shows a toast and reloads the stored layout', async () => {
    const { spies } = await open()
    spies.configPatch.mockRejectedValueOnce(new ConflictError())
    // the other tab's version is what the reload finds
    spies.configRows.set('session_screen', { value: { cards: [{ id: 21, tipo: 'notes', text: 'de la otra pestaña' }] }, updated_at: 'v7', visibility: 'dm' })
    act(() => dragEnd?.({ active: { id: 14 }, over: { id: 11 } }))
    expect(await screen.findByText(/cambió en otra pestaña o dispositivo/)).toBeInTheDocument()
    await waitFor(() => expect(cardIds()).toEqual([21]))
    expect(spies.configGet).toHaveBeenCalledTimes(2)
    // and the next change is guarded by the NEW version
    fireEvent.click(tab('+ Agregar pestaña'))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Combate' }))
    await waitFor(() => expect(patchCalls(spies).at(-1)?.[4]).toBe('v7'))
  })

  it('a plain write failure keeps the local edits on screen and retries them (no reload)', async () => {
    const { spies } = await open()
    spies.configPatch.mockRejectedValueOnce(new Error('boom'))
    act(() => dragEnd?.({ active: { id: 14 }, over: { id: 11 } }))
    await waitFor(() => expect(patchCalls(spies)).toHaveLength(2)) // the retry
    expect(cardIds()).toEqual([14, 11, 12, 13])
    expect(spies.configGet).toHaveBeenCalledTimes(1) // never reloaded
    expect(cardsOf(patchCalls(spies)[1]).map((c) => c.id)).toEqual([14, 11, 12, 13])
    expect(patchCalls(spies)[1][4]).toBe('v1')
  })

  it('when every retry fails the edits stay queued, the toast says so, and the next change sends them', async () => {
    const { spies } = await open()
    spies.configPatch.mockRejectedValue(new Error('offline'))
    act(() => dragEnd?.({ active: { id: 14 }, over: { id: 11 } }))
    expect((await screen.findAllByText(/se reintentan con el próximo cambio/)).length).toBeGreaterThan(0) // toast + persistent banner
    expect(patchCalls(spies)).toHaveLength(4) // first try + 3 retries
    expect(cardIds()).toEqual([14, 11, 12, 13])
    spies.configPatch.mockReset()
    spies.configPatch.mockImplementation(async () => ({ campaign_id: 'c1', key: 'session_screen', value: {}, visibility: 'dm', updated_at: 'v2' }))
    act(() => dragEnd?.({ active: { id: 13 }, over: { id: 14 } }))
    await waitFor(() => expect(spies.configPatch).toHaveBeenCalledTimes(1))
    expect(cardsOf(patchCalls(spies)[0]).map((c) => c.id)).toEqual([13, 14, 11, 12]) // both edits in one write
  })

  it('refuses growth past the size limit (measured in bytes) but still allows changes that do not grow it', async () => {
    const huge = 'ñ'.repeat(260_000) // 260k characters = 520k bytes
    const { spies } = await open({ config: layout([{ id: 1, tipo: 'notes', text: huge }, { id: 2, tipo: 'combat', combatants: [] }]) })
    fireEvent.click(tab('+ Agregar pestaña'))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Stats' }))
    expect(await screen.findByText(/demasiado grande/)).toBeInTheDocument()
    expect(spies.configPatch).not.toHaveBeenCalled()
    expect(cardIds()).toEqual([1, 2]) // refused: nothing changed on screen
    act(() => dragEnd?.({ active: { id: 2 }, over: { id: 1 } })) // same size: allowed
    await waitFor(() => expect(spies.configPatch).toHaveBeenCalledTimes(1))
    fireEvent.click(within(document.getElementById('session-card-2') as HTMLElement).getByRole('button', { name: 'Quitar pestaña' })) // smaller: allowed
    await waitFor(() => expect(spies.configPatch).toHaveBeenCalledTimes(2))
  })

  it('a load failure offers a retry', async () => {
    const fake = createFakeLayer({ entities: { pjs: [ELDRIC], homebrew_rules: [] }, config: layout() })
    fake.spies.configGet.mockRejectedValueOnce(new Error('offline'))
    renderSection(PATH, { layer: fake.layer })
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))
    await screen.findByRole('button', { name: 'Stats' })
  })
})

describe('session screen (hub): cards that persist their own state', () => {
  it('notes text is saved into its own entry, through the guarded patch, when the field loses focus', async () => {
    const { spies } = await open()
    const box = screen.getByDisplayValue('Recordar la emboscada')
    fireEvent.change(box, { target: { value: 'Nueva nota' } })
    expect(spies.configPatch).not.toHaveBeenCalled() // debounced
    fireEvent.blur(box)
    await waitFor(() => expect(spies.configPatch).toHaveBeenCalledTimes(1))
    const call = patchCalls(spies)[0]
    expect(call[4]).toBe('v1')
    expect(cardsOf(call).find((c) => c.id === 12)?.text).toBe('Nueva nota')
    expect(cardsOf(call).map((c) => c.id)).toEqual([11, 12, 13, 14]) // order untouched
  })

  it('combat state is persisted in its entry (and only when it really changed)', async () => {
    const orc = { id: 1, tipo: 'custom', bando: 'enemigo', nombre: 'Orco', iniciativa: 3, hp_actual: 10, hp_max: 10, hp_temp: 0, ac: 12, ac_temp: 0, velocidad: 30 }
    const { spies } = await open({ config: layout([{ id: 14, tipo: 'combat', combatants: [orc] }]) })
    await screen.findByDisplayValue('Orco')
    const init = screen.getByText('Iniciativa').nextElementSibling as HTMLInputElement
    fireEvent.blur(init) // untouched: no write
    expect(spies.configPatch).not.toHaveBeenCalled()
    fireEvent.change(init, { target: { value: '17' } })
    fireEvent.blur(init)
    await waitFor(() => expect(spies.configPatch).toHaveBeenCalledTimes(1))
    const [card] = cardsOf(patchCalls(spies)[0])
    expect(card.id).toBe(14)
    expect(String(card.combatants?.[0].iniciativa)).toBe('17')
  })
})

describe('session screen (hub): homebrew rules', () => {
  const RULE = entity(5, { nombre: 'Crítico doble', texto: 'Se duplican los dados.' })

  it('creates a rule through the entity actions and keeps the form when the save fails', async () => {
    const { spies } = await open()
    fireEvent.click(screen.getByRole('button', { name: '+ Crear regla' }))
    fireEvent.change(screen.getByText('Nombre').nextElementSibling as HTMLInputElement, { target: { value: 'Nueva regla' } })
    fireEvent.change(screen.getByText('Texto').nextElementSibling as HTMLTextAreaElement, { target: { value: 'Detalle' } })
    spies.saveEntityWithDmNotes.mockRejectedValueOnce(new Error('rls'))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar regla' }))
    await screen.findByText(/No se pudo guardar/)
    expect(screen.getByDisplayValue('Nueva regla')).toBeInTheDocument() // typed text kept

    fireEvent.click(screen.getByRole('button', { name: 'Guardar regla' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Guardar regla' })).toBeNull())
    expect(spies.saveEntityWithDmNotes.mock.calls.at(-1)).toEqual(['homebrew_rules', { campaignId: 'c1' }, { nombre: 'Nueva regla', texto: 'Detalle' }])
  })

  it('selects (expands) a rule and hard-deletes it only after the confirmation', async () => {
    const { spies } = await open({ entities: { pjs: [ELDRIC], homebrew_rules: [RULE] } })
    fireEvent.click(await screen.findByRole('button', { name: 'Crítico doble' }))
    expect(screen.getByText('Se duplican los dados.')).toBeInTheDocument()

    vi.mocked(window.confirm).mockReturnValueOnce(false)
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar regla' }))
    await act(async () => {})
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(spies.entityRemove).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar regla' }))
    await waitFor(() => expect(spies.entityRemove).toHaveBeenCalledWith(5))
  })
})

describe('session screen (hub): character edits', () => {
  async function openEdit(name: RegExp) {
    const fake = await open()
    const row = screen.getByRole('button', { name }).parentElement?.parentElement as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Editar' }))
    return { ...fake, dialog: await screen.findByRole('dialog') }
  }
  const inputOf = (dialog: HTMLElement, label: string) => within(dialog).getByText(label).parentElement?.querySelector('input') as HTMLInputElement
  const lastWrite = (spies: Spies) => {
    const [table, target, patch] = spies.saveEntityWithDmNotes.mock.calls.at(-1) as [string, { id: number; base?: { updated_at: string } }, Record<string, unknown>]
    return { table, target, patch }
  }

  it('sends only the changed fields (plus stat_hp_current when stat_hp changes) with the row version as base', async () => {
    const { spies, dialog } = await openEdit(/Eldric/)
    fireEvent.change(inputOf(dialog, 'HP Máx.'), { target: { value: '50' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(spies.saveEntityWithDmNotes).toHaveBeenCalledTimes(1))
    const { table, target, patch } = lastWrite(spies)
    expect(table).toBe('pjs')
    expect(target.id).toBe(1)
    expect(target.base?.updated_at).toBe('2026-01-02T10:00:00Z')
    const { sections_updated: stamps, ...fields } = patch
    expect(fields).toEqual({ stat_hp: 50, stat_hp_current: 31 }) // nothing else: no whole-object overwrite
    expect(Object.keys(stamps as object).length).toBeGreaterThan(0)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('writes the derived current HP when the character never had one', async () => {
    const { spies, dialog } = await openEdit(/Maisie/)
    fireEvent.change(inputOf(dialog, 'HP Máx.'), { target: { value: '25' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(spies.saveEntityWithDmNotes).toHaveBeenCalledTimes(1))
    const { sections_updated: stamps, ...fields } = lastWrite(spies).patch
    void stamps
    expect(fields).toEqual({ stat_hp: 25, stat_hp_current: 25 })
  })

  it('saving without changes writes nothing and closes', async () => {
    const { spies, dialog } = await openEdit(/Eldric/)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(spies.saveEntityWithDmNotes).not.toHaveBeenCalled()
  })

  it('a failed save keeps the modal (and the edits) open', async () => {
    const { spies, dialog } = await openEdit(/Eldric/)
    spies.saveEntityWithDmNotes.mockRejectedValueOnce(new ConflictError())
    fireEvent.change(inputOf(dialog, 'AC'), { target: { value: '20' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    await screen.findByText(/Alguien más modificó este registro/)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(inputOf(screen.getByRole('dialog'), 'AC').value).toBe('20')
  })

  it('a long rest writes only the resource fields', async () => {
    const kay = pj(3, {
      nombre: 'Kay', stat_hp: 30, stat_hp_current: 5,
      recursos: [{ id: 1, nombre: 'Furia', actual: 0, maximo: 2, recuperacion: 'largo' }],
      spell_slots: { 1: 2 }, spell_slots_current: { 1: 0 },
    })
    const fake = createFakeLayer({ entities: { pjs: [kay], homebrew_rules: [] }, config: layout([{ id: 31, tipo: 'resources' }]) })
    renderSection(PATH, { layer: fake.layer })
    fireEvent.click(await screen.findByRole('button', { name: /Kay/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Descanso Largo' }))
    await waitFor(() => expect(fake.spies.saveEntityWithDmNotes).toHaveBeenCalledTimes(1))
    const { sections_updated: stamps, ...fields } = lastWrite(fake.spies).patch
    void stamps
    expect(Object.keys(fields).sort()).toEqual(['recursos', 'spell_slots_current', 'stat_hp_current'])
    expect(fields.stat_hp_current).toBe(30)
  })
})

describe('session screen (hub): access', () => {
  it('a player gets the 404 in layout, never requests session_screen and has no nav entry', async () => {
    const fake = createFakeLayer({ entities: { pjs: [ELDRIC], homebrew_rules: [] }, config: layout() })
    renderSection(PATH, { layer: fake.layer, isDM: false })
    expect(await screen.findByRole('heading', { name: 'Sección no encontrada' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sesión en vivo' })).toBeNull()
    expect(fake.spies.configGet).not.toHaveBeenCalled()
    expect(fake.spies.configPatch).not.toHaveBeenCalled()
    expect(fake.spies.entityList).not.toHaveBeenCalledWith('pjs')
    expect(screen.queryByRole('button', { name: 'Stats' })).toBeNull()
  })
})

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('session screen (hub): lost-write guards', () => {
  it('unmounting while a write is in flight still writes the later edit', async () => {
    const { spies, view } = await open()
    const real = spies.configPatch.getMockImplementation() as (...a: never[]) => Promise<unknown>
    const gate = deferred<void>()
    spies.configPatch.mockImplementationOnce((async (...a: never[]) => {
      await gate.promise
      return real(...a)
    }) as never)
    act(() => dragEnd?.({ active: { id: 14 }, over: { id: 11 } })) // write 1 now in flight
    const box = screen.getByDisplayValue('Recordar la emboscada')
    fireEvent.change(box, { target: { value: 'tarde' } })
    fireEvent.blur(box) // edit 2, queued behind write 1
    view.unmount()
    gate.resolve()
    await waitFor(() => expect(spies.configPatch).toHaveBeenCalledTimes(2))
    expect(patchCalls(spies)[1][4]).toBe('v2')
    expect(cardsOf(patchCalls(spies)[1]).find((c) => c.id === 12)?.text).toBe('tarde')
  })

  it('a conflict keeps an unsent notes draft: the textarea is not overwritten and the draft is written on top', async () => {
    const { spies } = await open()
    spies.configPatch.mockRejectedValueOnce(new ConflictError())
    spies.configRows.set('session_screen', {
      value: { cards: [{ id: 12, tipo: 'notes', text: 'texto del servidor' }, { id: 11, tipo: 'stats' }] },
      updated_at: 'v7',
      visibility: 'dm',
    })
    const box = screen.getByDisplayValue('Recordar la emboscada') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: 'mi borrador' } }) // typed, not flushed yet
    act(() => dragEnd?.({ active: { id: 14 }, over: { id: 11 } })) // this write conflicts
    expect(await screen.findByText(/cambió en otra pestaña o dispositivo/)).toBeInTheDocument()
    await waitFor(() => expect(cardIds()).toEqual([12, 11]))
    expect(box.value).toBe('mi borrador')
    fireEvent.blur(box)
    await waitFor(() => expect(patchCalls(spies).at(-1)?.[4]).toBe('v7'))
    expect(cardsOf(patchCalls(spies).at(-1) as unknown[]).find((c) => c.id === 12)?.text).toBe('mi borrador')
  })

  it('a conflict re-applies already-sent card state (notes) on top of the reloaded layout and writes it with the new version', async () => {
    const { spies } = await open()
    spies.configPatch.mockRejectedValueOnce(new ConflictError())
    spies.configRows.set('session_screen', {
      value: { cards: [{ id: 12, tipo: 'notes', text: 'texto del servidor' }, { id: 11, tipo: 'stats' }] },
      updated_at: 'v7',
      visibility: 'dm',
    })
    const box = screen.getByDisplayValue('Recordar la emboscada')
    fireEvent.change(box, { target: { value: 'nota local' } })
    fireEvent.blur(box)
    await waitFor(() => expect(spies.configPatch).toHaveBeenCalledTimes(2))
    expect(patchCalls(spies)[1][4]).toBe('v7')
    expect(cardsOf(patchCalls(spies)[1]).map((c) => c.id)).toEqual([12, 11]) // the server's order
    expect(cardsOf(patchCalls(spies)[1]).find((c) => c.id === 12)?.text).toBe('nota local')
  })

  it('edits made while a conflict reload is pending are queued, never written concurrently', async () => {
    const { spies } = await open()
    spies.configPatch.mockRejectedValueOnce(new ConflictError())
    const reload = deferred<void>()
    const real = spies.configGet.getMockImplementation() as (...a: never[]) => Promise<unknown>
    spies.configGet.mockImplementationOnce((async (...a: never[]) => {
      await reload.promise
      return real(...a)
    }) as never)
    spies.configRows.set('session_screen', { value: { cards: [{ id: 12, tipo: 'notes', text: 'srv' }] }, updated_at: 'v7', visibility: 'dm' })
    act(() => dragEnd?.({ active: { id: 14 }, over: { id: 11 } })) // conflicts, reload now pending
    await waitFor(() => expect(spies.configGet).toHaveBeenCalledTimes(2))
    const box = screen.getByDisplayValue('Recordar la emboscada')
    fireEvent.change(box, { target: { value: 'durante la recarga' } })
    fireEvent.blur(box)
    expect(spies.configPatch).toHaveBeenCalledTimes(1) // nothing in parallel with the reload
    reload.resolve()
    await waitFor(() => expect(spies.configPatch).toHaveBeenCalledTimes(2))
    expect(patchCalls(spies)[1][4]).toBe('v7')
    expect(cardsOf(patchCalls(spies)[1]).find((c) => c.id === 12)?.text).toBe('durante la recarga')
  })

  it('a refused change (size limit) shows the toast and the notes card keeps the text unsent', async () => {
    const big = 'x'.repeat(511_800)
    const { spies } = await open({ config: layout([{ id: 12, tipo: 'notes', text: big }]) })
    const box = screen.getByDisplayValue(big) as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: big + 'y'.repeat(600) } })
    fireEvent.blur(box)
    expect(await screen.findByText(/demasiado grande/)).toBeInTheDocument()
    expect(spies.configPatch).not.toHaveBeenCalled()
    fireEvent.change(box, { target: { value: 'corto' } }) // shrinking is allowed, and still goes out
    fireEvent.blur(box)
    await waitFor(() => expect(spies.configPatch).toHaveBeenCalledTimes(1))
  })
})

describe('session screen (hub): character write bases', () => {
  const entityWithVersion = (n: number) => async (_t: string, target: { id: number }, flat: Record<string, unknown>) => ({
    entity: { ...ELDRIC, ...flat, id: target.id, updated_at: `2026-02-0${n}T00:00:00Z` },
    dmNotes: null,
  })
  const inputOf = (dialog: HTMLElement, label: string) => within(dialog).getByText(label).parentElement?.querySelector('input') as HTMLInputElement
  const eldricRow = () => screen.getByRole('button', { name: /Eldric/ }).parentElement?.parentElement as HTMLElement
  async function editStats(change: (dialog: HTMLElement) => void) {
    fireEvent.click(within(eldricRow()).getByRole('button', { name: 'Editar' }))
    const dialog = await screen.findByRole('dialog')
    change(dialog)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  }
  const baseOfCall = (spies: Spies, n: number) => (spies.saveEntityWithDmNotes.mock.calls[n] as unknown as [string, { base?: { updated_at: string } }])[1].base?.updated_at
  const pjChannel = (fake: ReturnType<typeof createFakeLayer>['fake']) => fake.channels.find((c) => c.name.startsWith('campaign:pjs:'))
  const onlyEldric = { entities: { pjs: [ELDRIC], homebrew_rules: [] } }

  it('uses the version the DM worked from when someone else changed a field this save touches (a conflict, not an overwrite)', async () => {
    const { spies, fake } = await open(onlyEldric)
    fireEvent.click(within(eldricRow()).getByRole('button', { name: 'Editar' }))
    const dialog = await screen.findByRole('dialog')
    act(() => pjChannel(fake)?.emit('UPDATE', { new: { id: 1, campaign_id: 'c1', updated_at: '2026-03-01T00:00:00Z', data: { stat_ac: 25 } } }))
    fireEvent.change(inputOf(dialog, 'AC'), { target: { value: '20' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(spies.saveEntityWithDmNotes).toHaveBeenCalledTimes(1))
    expect(baseOfCall(spies, 0)).toBe('2026-01-02T10:00:00Z') // opened, not the newer row
  })

  it('uses the latest version when the other change touched a different field (the edits merge)', async () => {
    const { spies, fake } = await open(onlyEldric)
    fireEvent.click(within(eldricRow()).getByRole('button', { name: 'Editar' }))
    const dialog = await screen.findByRole('dialog')
    act(() => pjChannel(fake)?.emit('UPDATE', { new: { id: 1, campaign_id: 'c1', updated_at: '2026-03-01T00:00:00Z', data: { stat_speed: 35 } } }))
    fireEvent.change(inputOf(dialog, 'AC'), { target: { value: '20' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(spies.saveEntityWithDmNotes).toHaveBeenCalledTimes(1))
    expect(baseOfCall(spies, 0)).toBe('2026-03-01T00:00:00Z')
  })

  it('a second action on the same character right after the first uses the returned version (no spurious conflict)', async () => {
    const { spies } = await open(onlyEldric)
    spies.saveEntityWithDmNotes.mockImplementationOnce(entityWithVersion(1) as never).mockImplementationOnce(entityWithVersion(2) as never)
    await editStats((d) => fireEvent.change(inputOf(d, 'AC'), { target: { value: '20' } }))
    await editStats((d) => fireEvent.change(inputOf(d, 'AC'), { target: { value: '22' } })) // modal opened from the not-yet-echoed row
    expect(baseOfCall(spies, 0)).toBe('2026-01-02T10:00:00Z')
    expect(baseOfCall(spies, 1)).toBe('2026-02-01T00:00:00Z')
  })

  it('a rest that changes nothing writes nothing', async () => {
    const full = pj(3, {
      nombre: 'Kay', stat_hp: 30, stat_hp_current: 30,
      recursos: [{ id: 1, nombre: 'Furia', actual: 2, maximo: 2, recuperacion: 'largo' }],
      spell_slots: { 1: 2 }, spell_slots_current: { 1: 2 },
    })
    const fake = createFakeLayer({ entities: { pjs: [full], homebrew_rules: [] }, config: layout([{ id: 31, tipo: 'resources' }]) })
    renderSection(PATH, { layer: fake.layer })
    fireEvent.click(await screen.findByRole('button', { name: /Kay/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Descanso Largo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Descanso Corto' }))
    await act(async () => {})
    expect(fake.spies.saveEntityWithDmNotes).not.toHaveBeenCalled()
  })
})

describe('session screen (hub): untouched legacy characters', () => {
  it('opening any edit modal and saving without touching anything writes nothing', async () => {
    const legacy = pj(4, {
      nombre: 'Vieja', stat_hp: 20,
      equipo: [{ id: 1, nombre: 'Soga', cantidad: 2 }],
      ataques: [{ id: 2, nombre: 'Daga', bono_ataque: '+3', dano: '1d4' }],
      hechizos: [{ id: 3, nombre: 'Luz', nivel: 0 }],
      recursos: [{ id: 4, nombre: 'Furia', actual: 1, maximo: 2 }],
    })
    const types = ['stats', 'skills', 'weapons', 'spells', 'inventory', 'resources', 'inspiration']
    const fake = createFakeLayer({
      entities: { pjs: [legacy], homebrew_rules: [] },
      config: layout(types.map((tipo, i) => ({ id: 40 + i, tipo }))),
    })
    renderSection(PATH, { layer: fake.layer })
    await screen.findByRole('button', { name: '+ Agregar pestaña' })
    for (let i = 0; i < types.length; i++) {
      const card = await waitFor(() => document.getElementById(`session-card-${40 + i}`) as HTMLElement)
      fireEvent.click(within(card).getByRole('button', { name: 'Editar' }))
      const dialog = await screen.findByRole('dialog')
      fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    }
    expect(fake.spies.saveEntityWithDmNotes).not.toHaveBeenCalled()
  })

})

describe('session screen (hub): giving up never loses edits', () => {
  it('after repeated conflicts the edits stay queued behind a persistent warning with Reintentar, and leaving is guarded', async () => {
    const { spies, view } = await open()
    const real = spies.configPatch.getMockImplementation() as never
    spies.configPatch.mockRejectedValue(new ConflictError())
    const box = screen.getByDisplayValue('Recordar la emboscada')
    fireEvent.change(box, { target: { value: 'no se pierde' } })
    fireEvent.blur(box)
    const alert = await screen.findByText(/sigue cambiando desde otro lugar/)
    expect(alert).toBeInTheDocument()
    expect(screen.getByDisplayValue('no se pierde')).toBeInTheDocument()

    // unload guard while edits are pending
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
    // route-leave guard: refused, then accepted
    vi.mocked(window.confirm).mockReturnValueOnce(false)
    await act(async () => { await view.router.navigate('/c/demo/pjs') })
    expect(view.router.state.location.pathname).toBe(PATH)
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('sin guardar'))

    // retry works once the layout stops moving
    spies.configPatch.mockImplementation(real)
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(screen.queryByText(/sigue cambiando desde otro lugar/)).toBeNull())
    expect(cardsOf(patchCalls(spies).at(-1) as unknown[]).find((c) => c.id === 12)?.text).toBe('no se pierde')
    await act(async () => { await view.router.navigate('/c/demo/pjs') })
    expect(view.router.state.location.pathname).toBe('/c/demo/pjs') // nothing pending: no prompt
  })

  it('a failed reload after a conflict retries the READ (not a stale-base write) and keeps the edits', async () => {
    const { spies } = await open()
    spies.configPatch.mockRejectedValueOnce(new ConflictError())
    spies.configRows.set('session_screen', {
      value: { cards: [{ id: 12, tipo: 'notes', text: 'servidor' }] },
      updated_at: 'v7',
      visibility: 'dm',
    })
    const realGet = spies.configGet.getMockImplementation() as never
    spies.configGet.mockRejectedValue(new Error('offline'))
    const box = screen.getByDisplayValue('Recordar la emboscada')
    fireEvent.change(box, { target: { value: 'sigue aquí' } })
    fireEvent.blur(box)
    expect(await screen.findByText(/No pudimos recargar la última versión/)).toBeInTheDocument()
    expect(spies.configPatch).toHaveBeenCalledTimes(1) // never resent with the stale base
    expect(spies.configGet).toHaveBeenCalledTimes(1 + 4) // initial load + first try + 3 backoff retries
    expect(screen.getByDisplayValue('sigue aquí')).toBeInTheDocument()

    spies.configGet.mockImplementation(realGet)
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(spies.configPatch).toHaveBeenCalledTimes(3)) // stale base conflicts once more, then the merged write
    expect(patchCalls(spies).at(-1)?.[4]).toBe('v7')
    expect(cardsOf(patchCalls(spies).at(-1) as unknown[]).find((c) => c.id === 12)?.text).toBe('sigue aquí')
    await waitFor(() => expect(screen.queryByText(/No pudimos recargar/)).toBeNull())
  })
})
