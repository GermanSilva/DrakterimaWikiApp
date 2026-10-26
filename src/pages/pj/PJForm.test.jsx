import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FormActionsContext, FormPortContext } from '../../ports'
import { createLegacyFormPort } from '../../legacy/legacyPorts'
import PJForm from './PJForm'
import { dnd5eProfile } from '../../campaign/system/systemProfile'

function renderForm(item, port) {
  const actions = { save: vi.fn(), remove: vi.fn(), closeForm: vi.fn(), saving: false, activeFieldRef: createRef() }
  render(
    <FormActionsContext.Provider value={actions}>
      <FormPortContext.Provider value={port}>
        <PJForm item={item} />
      </FormPortContext.Provider>
    </FormActionsContext.Provider>,
  )
  return actions
}

const ELDRIC = { id: 1, nombre: 'Eldric', jugador: 'Ana', clase: 'Paladín', nivel: 5, region: 'nezor', magralita: 'pulso', player_password: 'pw', player_must_change: true, notas: 'dm' }

describe('PJForm over the legacy form port (the Firebase app)', () => {
  const db = { pjs: [ELDRIC], sesiones: [] }

  it('DM: three tabs, the legacy regions and the flat magralita field; the document keeps its access fields', () => {
    const actions = renderForm(ELDRIC, createLegacyFormPort({ db, isDM: true }))
    expect(screen.getByRole('button', { name: 'Mecánicas' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Tierras Heladas' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Relación con la Magralita'), { target: { value: 'nuevo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    const [type, data] = actions.save.mock.calls[0]
    expect(type).toBe('pjs')
    expect(data).toMatchObject({ id: 1, nombre: 'Eldric', nivel: 5, region: 'nezor', magralita: 'nuevo', player_password: 'pw', player_must_change: true, notas: 'dm' })
    expect(data).not.toHaveProperty('custom_fields')
    expect(data.monedas_guardado).toEqual({}) // no longer dropped by a whole-document save
  })

  it('the owner (currentPlayer) gets only the identity tab, without level / XP / notes / visibility', () => {
    renderForm(ELDRIC, createLegacyFormPort({ db, isDM: false, currentPlayer: { id: 1, nombre: 'Eldric' } }))
    expect(screen.queryByRole('button', { name: 'Mecánicas' })).toBeNull()
    expect(screen.queryByText('Nivel')).toBeNull()
    expect(screen.queryByText('Experiencia (XP)')).toBeNull()
    expect(screen.queryByText(/Notas del DM/)).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Visibilidad' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Eliminar' })).toBeNull()
  })

  it('another player is not an owner (and a player with no character neither)', () => {
    renderForm(ELDRIC, createLegacyFormPort({ db, isDM: false, currentPlayer: { id: 2, nombre: 'Maisie' } }))
    expect(screen.getByRole('button', { name: 'Mecánicas' })).toBeInTheDocument()
  })
})

describe('PJForm over a hub-style port', () => {
  const hub = { isDM: true, regions: [{ key: 'norte', label: 'Norte' }], characters: [], sesiones: [], ownCharacterIds: [], characterFields: [{ key: 'lema', label: 'Lema' }], playerAccess: false }

  it('stores campaign fields in custom_fields, sends no legacy access fields and seeds the first campaign region', () => {
    const actions = renderForm(null, hub)
    expect(screen.getByRole('option', { name: 'Norte' }).selected).toBe(true)
    fireEvent.change(screen.getByLabelText('Lema'), { target: { value: 'Adelante' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    const [, data] = actions.save.mock.calls[0]
    expect(data.custom_fields).toEqual({ lema: 'Adelante' })
    expect(data.region).toBe('norte')
    expect(data).not.toHaveProperty('player_password')
    expect(data).not.toHaveProperty('lema')
  })

  it('Guardar is disabled while a save is in flight', () => {
    const actions = { save: vi.fn(), remove: vi.fn(), closeForm: vi.fn(), saving: true, activeFieldRef: createRef() }
    render(
      <FormActionsContext.Provider value={actions}>
        <FormPortContext.Provider value={hub}>
          <PJForm item={null} />
        </FormPortContext.Provider>
      </FormActionsContext.Provider>,
    )
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
  })
})

describe('PJForm over a campaign system document', () => {
  const db = { pjs: [ELDRIC], sesiones: [] }
  const withSystem = (edit) => {
    const system = dnd5eProfile()
    edit(system)
    return { ...createLegacyFormPort({ db, isDM: true }), system }
  }
  const open = (edit) => renderForm(ELDRIC, withSystem(edit))
  const tab = (name) => screen.queryByRole('button', { name })

  it('without a document the form is the D&D 5e one', () => {
    renderForm(ELDRIC, createLegacyFormPort({ db, isDM: true }))
    expect(screen.getByText('Clase')).toBeInTheDocument()
    expect(screen.getByText('Raza / Especie')).toBeInTheDocument()
    expect(screen.getByText('Nivel')).toBeInTheDocument()
    expect(screen.getByText('Experiencia (XP)')).toBeInTheDocument()
    expect(tab('Mecánicas')).not.toBeNull()
    expect(tab('Equipo & Rasgos')).not.toBeNull()
  })

  it('uses the names of the document, the level range, and drops a disabled built-in', () => {
    open((s) => {
      s.character.builtins.clase.enabled = false
      s.character.builtins.raza.label = 'Ocupación'
      s.character.builtins.nivel = { enabled: true, label: 'Rango', min: 0, max: 5 }
    })
    expect(screen.queryByText('Clase')).toBeNull()
    expect(screen.getByText('Ocupación')).toBeInTheDocument()
    const rango = screen.getByText('Rango').parentElement.querySelector('input')
    expect(rango).toHaveAttribute('min', '0')
    expect(rango).toHaveAttribute('max', '5')
  })

  it('drops the level when the built-in is disabled', () => {
    open((s) => { s.character.builtins.nivel.enabled = false })
    expect(screen.queryByText('Nivel')).toBeNull()
  })

  it('drops the D&D identity extras and the mechanics tab when the stats block is off', () => {
    open((s) => { for (const k of ['stats', 'habilidades', 'hechizos']) s.character.sections[k] = false })
    expect(screen.queryByText('Experiencia (XP)')).toBeNull()
    expect(screen.queryByText('Trasfondo D&D')).toBeNull()
    expect(screen.queryByText('Alineamiento')).toBeNull()
    expect(tab('Mecánicas')).toBeNull()
  })

  it('keeps the mechanics tab while any of its blocks is on, and hides only the blocks that are off', () => {
    open((s) => { s.character.sections.stats = false; s.character.sections.hechizos = false })
    fireEvent.click(tab('Mecánicas'))
    expect(screen.queryByText('Atributos')).toBeNull()
    expect(screen.queryByText('Hechicería (opcional)')).toBeNull()
    expect(screen.getByText('Habilidades')).toBeInTheDocument()
  })

  it('drops the equipment tab when none of its blocks is on, and the blocks that are off inside it', () => {
    open((s) => { for (const k of ['ataques', 'hechizos', 'recursos', 'equipo', 'rasgos']) s.character.sections[k] = false })
    expect(tab('Equipo & Rasgos')).toBeNull()
  })

  it('hides single blocks of the equipment tab', () => {
    open((s) => { s.character.sections.ataques = false; s.character.sections.rasgos = false })
    fireEvent.click(tab('Equipo & Rasgos'))
    expect(screen.queryByText('Ataques')).toBeNull()
    expect(screen.queryByText('Proficiencias & Rasgos')).toBeNull()
    expect(screen.getByText('Equipo')).toBeInTheDocument()
  })

  it('drops the appearance and narrative blocks of the identity tab', () => {
    open((s) => { s.character.sections.apariencia = false; s.character.sections.narrativa = false })
    expect(screen.queryByText('Apariencia Física')).toBeNull()
    expect(screen.queryByText('Personalidad')).toBeNull()
    expect(screen.queryByText('Trasfondo & Campaña')).toBeNull()
  })

  it('a disabled built-in keeps its stored value in the payload (nothing is erased by switching it off)', () => {
    const actions = open((s) => { s.character.builtins.clase.enabled = false })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(actions.save.mock.calls[0][1]).toMatchObject({ clase: 'Paladín', nivel: 5 })
  })
})
