import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FormActionsContext, FormPortContext } from '../../ports'
import { createLegacyFormPort } from '../../legacy/legacyPorts'
import PJForm from './PJForm'

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
