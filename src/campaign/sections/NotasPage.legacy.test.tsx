import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { makeCampaign } from '../../app/testing/renderApp'
import { createLegacyPlayerNotesPort } from '../../legacy/legacyPorts'
import { PlayerNotesPortContext, type PlayerNotesPort } from '../../ports'
import { CampaignContext } from '../CampaignContext'
import { ToastContext } from '../toastContext'
import { NotasPage } from './NotasPage'

vi.mock('../entities/useWikiIndex', () => ({
  useWikiIndex: () => ({
    byTable: { lore: [{ id: 1, title: 'El Cisma', imagen_url: null, estado: 'publicado' }], pjs: [], pnjs: [], lugares: [], facciones: [], items: [], sesiones: [] },
    loading: false,
    error: null,
    status: {},
  }),
}))

/** The page driven through the LEGACY adapter, whose writes resolve void on success and have no failure channel. */
function renderLegacyNotes(write: { savePlayerNote: () => Promise<void>; deletePlayerNote: () => Promise<void> }) {
  const db = {
    pjs: [{ id: 5, nombre: 'Eldric', jugador: 'Pepe' }],
    player_notes: [{ id: '5_lore_1', pj_id: 5, type: 'lore', entity_id: 1, text: 'mi nota' }],
  }
  const showToast = vi.fn()
  const port = createLegacyPlayerNotesPort({ db, isDM: false, currentPlayer: { id: 5, nombre: 'Eldric' }, ...write }) as PlayerNotesPort
  render(
    <MemoryRouter>
      <ToastContext.Provider value={{ showToast }}>
        <CampaignContext.Provider value={{ campaign: makeCampaign({ slug: 'demo' }), role: 'player', isDM: false, myCharacterIds: [5], reload: () => undefined }}>
          <PlayerNotesPortContext.Provider value={port}>
            <NotasPage />
          </PlayerNotesPortContext.Provider>
        </CampaignContext.Provider>
      </ToastContext.Provider>
    </MemoryRouter>,
  )
  return { showToast }
}

const openNote = () => fireEvent.click(screen.getByText('mi nota').closest('button') as HTMLElement)
const editTo = (text: string) => {
  fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
  fireEvent.change(screen.getByLabelText('Texto de la nota'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar nota' }))
}

describe('Notas through the legacy adapter', () => {
  it('treats a save that resolves void as success: the editor closes and no failure is shown', async () => {
    const savePlayerNote = vi.fn(async () => undefined)
    const { showToast } = renderLegacyNotes({ savePlayerNote, deletePlayerNote: vi.fn(async () => undefined) })
    openNote()
    editTo('cambiada')
    await waitFor(() => expect(screen.queryByLabelText('Texto de la nota')).toBeNull())
    expect(savePlayerNote).toHaveBeenCalledWith(5, 'lore', 1, 'cambiada')
    expect(showToast).not.toHaveBeenCalled()
  })

  it('treats a remove that resolves void as success: the confirmation closes', async () => {
    const deletePlayerNote = vi.fn(async () => undefined)
    renderLegacyNotes({ savePlayerNote: vi.fn(async () => undefined), deletePlayerNote })
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar nota de El Cisma' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(deletePlayerNote).toHaveBeenCalledWith('5_lore_1')
  })

  it('a rejected save shows a failure and keeps the editor with the draft', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { showToast } = renderLegacyNotes({ savePlayerNote: vi.fn(async () => Promise.reject(new Error('down'))), deletePlayerNote: vi.fn(async () => undefined) })
    openNote()
    editTo('borrador')
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('No se pudo guardar la nota', 'error'))
    expect(screen.getByLabelText('Texto de la nota')).toHaveValue('borrador')
    errorSpy.mockRestore()
  })

  it('a rejected remove shows a failure and keeps the confirmation open', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { showToast } = renderLegacyNotes({ savePlayerNote: vi.fn(async () => undefined), deletePlayerNote: vi.fn(async () => Promise.reject(new Error('down'))) })
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar nota de El Cisma' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('No se pudo eliminar la nota', 'error'))
    expect(screen.getByRole('dialog', { name: '¿Eliminar esta nota?' })).toBeInTheDocument()
    errorSpy.mockRestore()
  })
})
