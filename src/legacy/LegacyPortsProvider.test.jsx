import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppContext } from '../AppContext'
import PlayerNotes from '../components/PlayerNotes'
import UnreadDot from '../components/UnreadDot'
import WikiLinkPicker from '../components/WikiLinkPicker'
import WikiText from '../components/WikiText'
import FormShell from '../components/FormShell'
import { ENTITY_FORMS } from '../components/forms/entityForms'
import { EstadoField } from '../components/forms/formFields'
import { useFormActions, useWikiPort, WikiPortContext } from '../ports'
import LegacyPortsProvider from './LegacyPortsProvider'
import { createLegacyPlayerNotesPort } from './legacyPorts'

const db = {
  lugares: [{ id: 3, nombre: 'Magrales del este', imagen_url: 'https://x/y.png' }],
  pnjs: [{ id: 1, nombre: 'Ana' }],
  lore: [{ id: 2, titulo: 'Cisma', updatedAt: '2026-01-02T00:00:00Z' }],
  pjs: [{ id: 5, nombre: 'Eldric', jugador: 'Pepe' }],
  sesiones: [{ id: 1, numero: 1, titulo: 'Inicio', orden: 100 }],
  player_notes: [{ id: '5_lore_2', pj_id: 5, type: 'lore', entity_id: 2, text: 'mi nota' }],
  read_state: [],
}

function app(over = {}) {
  return {
    db,
    isDM: false,
    currentPlayer: { id: 5, nombre: 'Eldric' },
    goToDetail: vi.fn(),
    markRead: vi.fn(),
    markSectionRead: vi.fn(),
    savePlayerNote: vi.fn(),
    deletePlayerNote: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
    closeForm: vi.fn(),
    activeFieldRef: { current: null },
    ...over,
  }
}

function renderLegacy(ui, over) {
  const ctx = app(over)
  render(
    <AppContext.Provider value={ctx}>
      <LegacyPortsProvider>{ui}</LegacyPortsProvider>
    </AppContext.Provider>,
  )
  return ctx
}

describe('legacy adapter keeps the shared components working', () => {
  it('WikiText resolves links against db and navigates with goToDetail', () => {
    const ctx = renderLegacy(<WikiText text={'Ir a [[{3G}Magrales]] o [[{9G}Fantasma]] o [[{3}malo]]'} />)
    fireEvent.click(screen.getByText('Magrales'))
    expect(ctx.goToDetail).toHaveBeenCalledWith('lugares', 3)
    expect(screen.getByText('Fantasma')).toHaveAttribute('title', 'Artículo #9 no encontrado')
    expect(screen.getByText('malo')).toBeInTheDocument()
  })

  it('WikiLinkPicker lists db entities grouped by collection and inserts the link text', () => {
    const onInsert = vi.fn()
    renderLegacy(<WikiLinkPicker onInsert={onInsert} onClose={() => undefined} />)
    expect(screen.getByText('Lugar')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Buscar artículo'), { target: { value: 'ana' } })
    fireEvent.click(screen.getByRole('button', { name: /Ana/ }))
    expect(onInsert).toHaveBeenCalledWith('[[{1N}Ana]]')
  })

  it('PlayerNotes: a player edits their own note through savePlayerNote; a DM sees authors by name', () => {
    const player = renderLegacy(<PlayerNotes entityType="lore" entityId={2} />)
    const box = screen.getByDisplayValue('mi nota')
    fireEvent.change(box, { target: { value: 'otra' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nota' }))
    expect(player.savePlayerNote).toHaveBeenCalledWith(5, 'lore', 2, 'otra')
  })

  it('PlayerNotes (DM) labels each note with the PJ name and saves under that PJ', () => {
    const dm = renderLegacy(<PlayerNotes entityType="lore" entityId={2} />, { isDM: true, currentPlayer: null })
    expect(screen.getByText('Eldric')).toBeInTheDocument()
    fireEvent.change(screen.getByDisplayValue('mi nota'), { target: { value: 'corregida' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nota' }))
    expect(dm.savePlayerNote).toHaveBeenCalledWith(5, 'lore', 2, 'corregida')
  })

  it('PlayerNotes renders nothing without an identity', () => {
    renderLegacy(<PlayerNotes entityType="lore" entityId={2} />, { currentPlayer: null })
    expect(screen.queryByText('Mis notas')).toBeNull()
  })

  it('UnreadDot by type/id: unread without a read_state doc, read after it', () => {
    renderLegacy(<UnreadDot type="lore" id={2} updatedAt="2026-01-02T00:00:00Z" data-testid="d1" />)
    expect(screen.getByTestId('d1')).toBeInTheDocument()
  })

  it('UnreadDot respects a newer read_state entry (legacy semantics)', () => {
    const seen = { ...db, read_state: [{ id: '5_lore_2', seenAt: '2026-01-03T00:00:00Z' }] }
    renderLegacy(<UnreadDot type="lore" id={2} updatedAt="2026-01-02T00:00:00Z" data-testid="d2" />, { db: seen })
    expect(screen.queryByTestId('d2')).toBeNull()
  })

  it('EstadoField lists the pjs from the form port when the entity is secret', () => {
    renderLegacy(<EstadoField estado="secreto" visibilidad={[5]} setF={() => undefined} />)
    expect(screen.getByLabelText('Eldric (Pepe)')).toBeChecked()
  })

  it('the legacy forms render with the legacy ports (regions come from helpers)', () => {
    const Pnj = ENTITY_FORMS.pnjs
    const ctx = app()
    render(
      <AppContext.Provider value={ctx}>
        <LegacyPortsProvider>
          <FormShell type="pnjs" title="Nuevo PNJ" FormComponent={Pnj} item={null} onSave={ctx.save} onRemove={ctx.remove} onClose={ctx.closeForm} />
        </LegacyPortsProvider>
      </AppContext.Provider>,
    )
    expect(screen.getByRole('option', { name: 'Tierras Heladas' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(ctx.save).toHaveBeenCalledWith('pnjs', expect.objectContaining({ region: 'magral', estado: 'publicado' }))
  })
})

describe('port hooks outside a provider', () => {
  it('fail loudly instead of rendering around a missing adapter', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const Probe = () => (useWikiPort(), null)
    expect(() => render(<Probe />)).toThrow(/WikiPortContext/)
    const Actions = () => (useFormActions(), null)
    expect(() => render(<Actions />)).toThrow(/FormShell/)
    spy.mockRestore()
  })
})

describe('pending links', () => {
  it('render as neutral text (no "no encontrado" title) while the port says the table is pending', () => {
    const port = { pending: () => true, resolve: () => null, navigate: () => undefined, search: () => [] }
    render(
      <WikiPortContext.Provider value={port}>
        <WikiText text="[[{3G}Lugar]]" />
      </WikiPortContext.Provider>,
    )
    expect(screen.getByText('Lugar')).not.toHaveAttribute('title')
  })
})

describe('legacy player notes keep the original pj_id', () => {
  it('a DM saving a note of a string pj id sends that exact id, not a Number() round trip', () => {
    const odd = { ...db, player_notes: [{ id: 'abc_lore_2', pj_id: 'abc', type: 'lore', entity_id: 2, text: 'x' }], pjs: [] }
    const ctx = renderLegacy(<PlayerNotes entityType="lore" entityId={2} />, { isDM: true, currentPlayer: null, db: odd })
    fireEvent.change(screen.getByDisplayValue('x'), { target: { value: 'y' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nota' }))
    expect(ctx.savePlayerNote).toHaveBeenCalledWith('abc', 'lore', 2, 'y')
  })
})

describe('legacy player notes without an existing note for the key', () => {
  it('keeps the numeric type of the pj id (looked up from db.pjs), never the string key', () => {
    const savePlayerNote = vi.fn()
    const port = createLegacyPlayerNotesPort({
      db: { player_notes: [], pjs: [{ id: 5, nombre: 'Eldric' }] },
      isDM: true,
      currentPlayer: null,
      savePlayerNote,
      deletePlayerNote: vi.fn(),
    })
    port.save('lore', 2, 'nueva', '5')
    expect(savePlayerNote).toHaveBeenCalledWith(5, 'lore', 2, 'nueva')
    expect(typeof savePlayerNote.mock.calls[0][0]).toBe('number')
  })
})

describe('legacy player notes all()', () => {
  const notes = [
    { id: '5_lore_2', pj_id: 5, type: 'lore', entity_id: 2, text: 'mia' },
    { id: '6_pnjs_1', pj_id: 6, type: 'pnjs', entity_id: 1, text: 'de otro' },
  ]
  const pjs = [{ id: 5, nombre: 'Eldric', jugador: 'Pepe' }, { id: 6, nombre: 'Mara' }]
  const make = (over) =>
    createLegacyPlayerNotesPort({ db: { player_notes: notes, pjs }, isDM: false, currentPlayer: { id: 5 }, savePlayerNote: vi.fn(), deletePlayerNote: vi.fn(), ...over })

  it('a DM lists every note with the PJ name as label and the player as author', () => {
    expect(make({ isDM: true, currentPlayer: null }).all()).toEqual([
      { type: 'lore', id: 2, text: 'mia', key: '5', label: 'Eldric', author: 'Pepe' },
      { type: 'pnjs', id: 1, text: 'de otro', key: '6', label: 'Mara', author: undefined },
    ])
  })

  it('a player only lists their own notes, and nobody without identity lists any', () => {
    expect(make().all().map((n) => n.key)).toEqual(['5'])
    expect(make({ currentPlayer: null }).all()).toEqual([])
  })
})
