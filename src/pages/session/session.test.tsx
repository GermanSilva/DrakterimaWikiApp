import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppContext } from '../../AppContext'
import { CampaignTestProviders, createFakeLayer } from '../../campaign/testing/fakeLayer'
import { useSessionLayout } from '../../campaign/sections/useSessionLayout'
import { changedPjFields, changedPjSections } from '../../helpers/pjSections'
import { buildSessionPjPatch, coerceSessionPj } from '../../helpers/pjWrites'
import { SessionScreenPortContext, type SessionScreenPort } from '../../ports'
import SessionScreen from '../SessionScreen'
import SessionCardNotes, { NOTES_DEBOUNCE_MS } from './cards/SessionCardNotes'

const makePort = (): SessionScreenPort & { patchCard: ReturnType<typeof vi.fn> } => ({
  setCards: vi.fn(),
  patchCard: vi.fn(),
  savePj: vi.fn(async () => true),
  createRule: vi.fn(async () => true),
  deleteRule: vi.fn(async () => true),
})

describe('SessionCardNotes debounce', () => {
  afterEach(() => vi.useRealTimers())

  function setup(text = 'inicial') {
    vi.useFakeTimers()
    const port = makePort()
    const view = (entry: { id: number; tipo: string; text?: string }) => (
      <SessionScreenPortContext.Provider value={port}>
        <SessionCardNotes entry={entry} onRemove={() => undefined} />
      </SessionScreenPortContext.Provider>
    )
    const utils = render(view({ id: 7, tipo: 'notes', text }))
    return { port, utils, view, box: () => screen.getByPlaceholderText('Notas de la sesión...') as HTMLTextAreaElement }
  }

  it('writes once, a moment after the last keystroke, with the final text', () => {
    const { port, box } = setup()
    fireEvent.change(box(), { target: { value: 'a' } })
    act(() => vi.advanceTimersByTime(NOTES_DEBOUNCE_MS - 1))
    fireEvent.change(box(), { target: { value: 'ab' } }) // restarts the wait
    act(() => vi.advanceTimersByTime(NOTES_DEBOUNCE_MS - 1))
    expect(port.patchCard).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(port.patchCard).toHaveBeenCalledTimes(1)
    expect(port.patchCard).toHaveBeenCalledWith(7, { text: 'ab' })
  })

  it('blur flushes at once and does not write again afterwards', () => {
    const { port, box } = setup()
    fireEvent.change(box(), { target: { value: 'rápido' } })
    fireEvent.blur(box())
    expect(port.patchCard).toHaveBeenCalledWith(7, { text: 'rápido' })
    act(() => vi.advanceTimersByTime(NOTES_DEBOUNCE_MS * 2))
    expect(port.patchCard).toHaveBeenCalledTimes(1)
  })

  it('unmounting flushes the pending text (nothing typed is lost)', () => {
    const { port, box, utils } = setup()
    fireEvent.change(box(), { target: { value: 'pendiente' } })
    utils.unmount()
    expect(port.patchCard).toHaveBeenCalledWith(7, { text: 'pendiente' })
  })

  it('an unchanged text never writes, and a text from outside replaces the draft', () => {
    const { port, box, utils, view } = setup('igual')
    fireEvent.blur(box())
    expect(port.patchCard).not.toHaveBeenCalled()
    utils.rerender(view({ id: 7, tipo: 'notes', text: 'de otra pestaña' }))
    expect(box().value).toBe('de otra pestaña')
    act(() => vi.advanceTimersByTime(NOTES_DEBOUNCE_MS * 2))
    expect(port.patchCard).not.toHaveBeenCalled()
  })
})

describe('buildSessionPjPatch', () => {
  const pj = { id: 1, nombre: 'Eldric', stat_str: 16, stat_hp: 40, stat_hp_current: 31, stat_ac: 18, ataques: [], equipo: [{ id: 1, nombre: 'Soga', cantidad: 1 }] }

  it('is empty when nothing changed, even though the draft is a whole-character copy of string inputs', () => {
    expect(buildSessionPjPatch(pj, { ...pj, stat_str: '16', stat_hp: '40' })).toEqual({})
  })

  it('carries only the edited fields', () => {
    expect(buildSessionPjPatch(pj, { ...pj, equipo: [...pj.equipo, { id: 2, nombre: 'Antorcha', cantidad: 3 }] })).toEqual({
      equipo: [...pj.equipo, { id: 2, nombre: 'Antorcha', cantidad: 3 }],
    })
  })

  it('writes the current HP together with a new maximum, derived when the character had none', () => {
    expect(buildSessionPjPatch(pj, { ...pj, stat_hp: '50' })).toEqual({ stat_hp: 50, stat_hp_current: 31 })
    const noCurrent = { id: 2, nombre: 'Maisie', stat_hp: 20 }
    expect(buildSessionPjPatch(noCurrent, { ...noCurrent, stat_hp: '25' })).toEqual({ stat_hp: 25, stat_hp_current: 25 })
  })

  it('does not write defaults a character lacks (the missing proficiency bonus is not an edit)', () => {
    expect(coerceSessionPj({ id: 3 }).stat_proficiency_bonus).toBe(0)
    expect(buildSessionPjPatch({ id: 3, nombre: 'X' }, { id: 3, nombre: 'X' })).toEqual({})
  })
})

describe('legacy host of the session screen (unchanged behaviour)', () => {
  afterEach(() => vi.unstubAllGlobals())
  const pjs = [{ id: 1, nombre: 'Eldric', stat_hp: 40 }]
  const layout = { id: 'session_screen', cards: [{ id: 1, tipo: 'inspiration' }, { id: 2, tipo: 'hp-ac' }] }

  function renderLegacy(over: Record<string, unknown> = {}) {
    vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} unobserve() {} takeRecords() { return [] } })
    window.scrollTo = vi.fn() as typeof window.scrollTo
    const app = {
      db: { pjs, homebrew_rules: [], game_config: [layout] },
      isDM: true,
      saveSessionScreen: vi.fn(async () => undefined),
      save: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
      ...over,
    }
    render(
      <AppContext.Provider value={app as never}>
        <SessionScreen />
      </AppContext.Provider>,
    )
    return app
  }

  it('renders nothing for a non-DM', () => {
    renderLegacy({ isDM: false })
    expect(screen.queryByRole('button', { name: '+ Agregar pestaña' })).toBeNull()
  })

  it('adding a card saves the whole Firestore document (with its id) through saveSessionScreen', async () => {
    const app = renderLegacy()
    fireEvent.click(screen.getByRole('button', { name: '+ Agregar pestaña' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Notas' }))
    expect(app.saveSessionScreen).toHaveBeenCalledTimes(1)
    const saved = (app.saveSessionScreen.mock.calls[0] as unknown[])[0] as { id: string; cards: { tipo: string }[] }
    expect(saved.id).toBe('session_screen')
    expect(saved.cards.map((c) => c.tipo)).toEqual(['inspiration', 'hp-ac', 'notes']) // the obsolete entry survives until a reorder
  })

  it('editing a character saves it through the legacy save (whole document, as before)', async () => {
    const app = renderLegacy()
    fireEvent.click(screen.getByRole('button', { name: /Eldric/ }).parentElement?.querySelector('button:last-child') as HTMLElement)
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(dialog.querySelector('input[type="checkbox"]') as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await act(async () => {})
    expect(app.save).toHaveBeenCalledWith('pjs', expect.objectContaining({ id: 1, nombre: 'Eldric', stat_inspiration: true }))
  })
})

describe('refused writes and nested values', () => {
  it('a notes text the host refused stays unsent: the next blur tries again', () => {
    const port = makePort()
    port.patchCard.mockReturnValue(false)
    render(
      <SessionScreenPortContext.Provider value={port}>
        <SessionCardNotes entry={{ id: 7, tipo: 'notes', text: '' }} onRemove={() => undefined} />
      </SessionScreenPortContext.Provider>,
    )
    const box = screen.getByPlaceholderText('Notas de la sesión...')
    fireEvent.change(box, { target: { value: 'largo' } })
    fireEvent.blur(box)
    fireEvent.blur(box)
    expect(port.patchCard).toHaveBeenCalledTimes(2)
    port.patchCard.mockReturnValue(true)
    fireEvent.blur(box)
    fireEvent.blur(box)
    expect(port.patchCard).toHaveBeenCalledTimes(3) // accepted once, then nothing left to send
  })

  it('nested false / 0 leaves are real changes (toggling portando, emptying a quantity, unpreparing a spell)', () => {
    const pj = {
      id: 1, nombre: 'Eldric',
      equipo: [{ id: 1, nombre: 'Soga', cantidad: 2 }], // legacy item without portando
      hechizos: [{ id: 5, nombre: 'Luz', nivel: 1, preparado: true }],
    }
    const toggled = { ...pj, equipo: [{ ...pj.equipo[0], portando: false }] }
    expect(buildSessionPjPatch(pj, toggled)).toEqual({ equipo: toggled.equipo })
    const zeroed = { ...pj, equipo: [{ ...pj.equipo[0], cantidad: 0 }] }
    expect(buildSessionPjPatch(pj, zeroed)).toEqual({ equipo: zeroed.equipo })
    const unprepared = { ...pj, hechizos: [{ ...pj.hechizos[0], preparado: false }] }
    expect(buildSessionPjPatch(pj, unprepared)).toEqual({ hechizos: unprepared.hechizos })
    // top-level empty defaults are still "no edit"
    expect(changedPjFields({ id: 1 }, { id: 1, equipo: [], monedas: {}, ataques: undefined })).toEqual({})
    expect(changedPjSections(pj, toggled)).not.toEqual([])
  })
})

describe('legacy host reports the real outcome', () => {
  afterEach(() => vi.unstubAllGlobals())
  function renderLegacy(over: Record<string, unknown>, cards: unknown[]) {
    vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} unobserve() {} takeRecords() { return [] } })
    window.scrollTo = vi.fn() as typeof window.scrollTo
    const app = {
      db: {
        pjs: [{ id: 1, nombre: 'Eldric', stat_hp: 40 }],
        homebrew_rules: [{ id: 9, nombre: 'Crítico', texto: 'Doble dado' }],
        game_config: [{ id: 'session_screen', cards }],
      },
      isDM: true,
      saveSessionScreen: vi.fn(async () => undefined),
      save: vi.fn(async () => true),
      remove: vi.fn(async () => true),
      ...over,
    }
    render(
      <AppContext.Provider value={app as never}>
        <SessionScreen />
      </AppContext.Provider>,
    )
    return app
  }

  it('a cancelled or failed delete leaves the rule selected; a real one clears it', async () => {
    const app = renderLegacy({ remove: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true) }, [{ id: 3, tipo: 'rules' }])
    fireEvent.click(screen.getByRole('button', { name: 'Crítico' }))
    expect(screen.getByText('Doble dado')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar regla' }))
    await act(async () => {})
    expect(app.remove).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Doble dado')).toBeInTheDocument() // cancelled / failed: nothing cleared
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar regla' }))
    await act(async () => {})
    expect(screen.queryByText('Doble dado')).toBeNull()
  })

  it('a failed character save keeps the edit modal open', async () => {
    const app = renderLegacy({ save: vi.fn(async () => false) }, [{ id: 1, tipo: 'inspiration' }])
    fireEvent.click(screen.getByRole('button', { name: /Eldric/ }).parentElement?.querySelector('button:last-child') as HTMLElement)
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(dialog.querySelector('input[type="checkbox"]') as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await act(async () => {})
    expect(app.save).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('useSessionLayout before the layout is loaded', () => {
  it('refuses the change (returns false) and says why, instead of dropping it silently', async () => {
    const fake = createFakeLayer({ config: {} })
    const gate = { release: () => undefined as void }
    const held = new Promise<void>((r) => { gate.release = r })
    fake.spies.configGet.mockImplementation(async () => { await held; return null })
    const { result } = renderHook(() => useSessionLayout(true), {
      wrapper: ({ children }) => <CampaignTestProviders layer={fake.layer}>{children}</CampaignTestProviders>,
    })
    let accepted: boolean | undefined
    act(() => { accepted = result.current.update((cards) => [...cards, { id: 1, tipo: 'notes' }]) })
    expect(accepted).toBe(false)
    expect(fake.spies.configPatch).not.toHaveBeenCalled()
    expect(await screen.findByText(/todavía se está cargando/)).toBeInTheDocument()
    await act(async () => { gate.release() })
    await waitFor(() => expect(result.current.status).toBe('ready'))
  })
})

describe('echoes of our own writes', () => {
  const withPort = (port: SessionScreenPort, node: React.ReactNode) => <SessionScreenPortContext.Provider value={port}>{node}</SessionScreenPortContext.Provider>

  it('notes: the echo of an OLDER flush never replaces a newer draft; a foreign text still does', () => {
    const port = makePort()
    const view = (text: string) => withPort(port, <SessionCardNotes entry={{ id: 7, tipo: 'notes', text }} onRemove={() => undefined} />)
    const utils = render(view(''))
    const box = () => screen.getByPlaceholderText('Notas de la sesión...') as HTMLTextAreaElement
    fireEvent.change(box(), { target: { value: 'a' } })
    fireEvent.blur(box()) // flush 1
    fireEvent.change(box(), { target: { value: 'ab' } })
    fireEvent.blur(box()) // flush 2, before any echo
    fireEvent.change(box(), { target: { value: 'abc' } }) // newer draft, not flushed
    expect(port.patchCard).toHaveBeenCalledTimes(2)
    utils.rerender(view('a')) // echo of flush 1 arrives late
    expect(box().value).toBe('abc')
    utils.rerender(view('ab')) // echo of flush 2
    expect(box().value).toBe('abc')
    fireEvent.blur(box())
    expect(port.patchCard).toHaveBeenLastCalledWith(7, { text: 'abc' })
    utils.rerender(view('de otra pestaña'))
    expect(box().value).toBe('de otra pestaña') // nothing unsent any more: a foreign text is adopted
  })

  it('combat: a revert sent before the echo is written, and an older echo does not roll the state back', async () => {
    const { default: SessionCardCombat } = await import('./cards/SessionCardCombat')
    const port = makePort()
    const orc = { id: 1, tipo: 'custom', bando: 'enemigo', nombre: 'Orco', iniciativa: 3, hp_actual: 10, hp_max: 10, hp_temp: 0, ac: 12, ac_temp: 0, velocidad: 30 }
    const view = (nombre: string) =>
      withPort(port, <SessionCardCombat db={{ pjs: [] }} entry={{ id: 14, tipo: 'combat', combatants: [{ ...orc, nombre }] }} onRemove={() => undefined} />)
    const utils = render(view('Orco'))
    const name = () => screen.getByDisplayValue(/Orco/) as HTMLInputElement
    fireEvent.change(name(), { target: { value: 'Orco jefe' } })
    fireEvent.blur(name())
    fireEvent.change(name(), { target: { value: 'Orco' } }) // back to the confirmed value, before the echo
    fireEvent.blur(name())
    expect(port.patchCard).toHaveBeenCalledTimes(2)
    expect((port.patchCard.mock.calls[1][1] as { combatants: { nombre: string }[] }).combatants[0].nombre).toBe('Orco')
    utils.rerender(view('Orco jefe')) // late echo of the first send
    expect(name().value).toBe('Orco')
    fireEvent.blur(name()) // nothing new to send
    expect(port.patchCard).toHaveBeenCalledTimes(2)
  })
})

describe('coerceSessionPj / buildSessionPjPatch (direct)', () => {
  it('coerces numeric inputs, defaults the current HP to the maximum and does not mutate its input', () => {
    const draft = { stat_str: '16', stat_dex: 'x', stat_hp: '40', stat_hp_temp: '', stat_proficiency_bonus: '3', nombre: 'A' }
    const out = coerceSessionPj(draft)
    expect(out).toMatchObject({ stat_str: 16, stat_dex: 0, stat_hp: 40, stat_hp_current: 40, stat_hp_temp: 0, stat_proficiency_bonus: 3, nombre: 'A' })
    expect(draft.stat_str).toBe('16')
    expect(coerceSessionPj({ stat_hp: '40', stat_hp_current: '7' }).stat_hp_current).toBe(7)
    expect(coerceSessionPj({ stat_hp: 40, stat_hp_current: 0 }).stat_hp_current).toBe(0)
  })

  it('an untouched legacy character (rows without the newer defaults) produces an empty patch', () => {
    const pj = {
      id: 4, nombre: 'Vieja', stat_hp: 20,
      equipo: [{ id: 1, nombre: 'Soga', cantidad: 2 }],
      ataques: [{ id: 2, nombre: 'Daga' }],
      hechizos: [{ id: 3, nombre: 'Luz', nivel: 0 }],
      recursos: [{ id: 4, nombre: 'Furia', actual: 1, maximo: 2 }],
    }
    expect(buildSessionPjPatch(pj, { ...pj })).toEqual({})
    expect(buildSessionPjPatch(pj, structuredClone(pj))).toEqual({})
  })
})

describe('legacy host keeps its optimistic layout between renders', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('two quick additions compose even though the component re-renders in between (props unchanged)', async () => {
    vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} unobserve() {} takeRecords() { return [] } })
    window.scrollTo = vi.fn() as typeof window.scrollTo
    const app = {
      db: { pjs: [], homebrew_rules: [], game_config: [{ id: 'session_screen', cards: [{ id: 1, tipo: 'inspiration' }] }] },
      isDM: true,
      saveSessionScreen: vi.fn(async () => undefined),
      save: vi.fn(),
      remove: vi.fn(),
    }
    render(
      <AppContext.Provider value={app as never}>
        <SessionScreen />
      </AppContext.Provider>,
    )
    fireEvent.click(screen.getByRole('button', { name: '+ Agregar pestaña' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Notas' }))
    fireEvent.click(screen.getByRole('button', { name: '+ Agregar pestaña' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Combate' }))
    expect(app.saveSessionScreen).toHaveBeenCalledTimes(2)
    const second = (app.saveSessionScreen.mock.calls[1] as unknown[])[0] as { cards: { tipo: string }[] }
    expect(second.cards.map((c) => c.tipo)).toEqual(['inspiration', 'notes', 'combat'])
  })
})
