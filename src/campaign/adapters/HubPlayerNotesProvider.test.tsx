import { useEffect } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../../auth/AuthContext'
import { DataContext } from '../../app/DataContext'
import { makeAuth, makeCampaign, makeData } from '../../app/testing/renderApp'
import type { Member, PlayerNote } from '../../data'
import { usePlayerNotesPort, type PlayerNotesPort } from '../../ports'
import { CampaignContext } from '../CampaignContext'
import { createFakeLayer } from '../testing/fakeLayer'
import { HubPortsProvider } from './HubPortsProvider'

const note = (over: Partial<PlayerNote> = {}): PlayerNote => ({
  campaign_id: 'c1', user_id: 'user-1', entity_type: 'lore', entity_id: 1, character_id: null, text: 'hola', created_at: '', updated_at: '', ...over,
})
const member = (user_id: string, display_name: string | null): Member => ({
  campaign_id: 'c1', user_id, role: 'player', created_at: '', updated_at: '',
  profile: display_name === null ? null : { id: user_id, display_name, avatar_url: null },
})

const current: { port: PlayerNotesPort | null } = { port: null }
const getPort = (): PlayerNotesPort => current.port as PlayerNotesPort
function Probe() {
  const port = usePlayerNotesPort()
  useEffect(() => { current.port = port })
  return <div data-testid="state">{port.loading ? 'loading' : `ready:${port.all().length}`}</div>
}

function renderProbe(layer: ReturnType<typeof createFakeLayer>['layer'], isDM: boolean) {
  const data = makeData({ layer })
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={makeAuth()}>
        <DataContext.Provider value={data}>
          <CampaignContext.Provider value={{ campaign: makeCampaign({ id: 'c1', slug: 'demo' }), role: isDM ? 'dm' : 'player', isDM, myCharacterIds: [3], reload: () => undefined }}>
            <HubPortsProvider>
              <Probe />
            </HubPortsProvider>
          </CampaignContext.Provider>
        </DataContext.Provider>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('hub player notes port: all()', () => {
  it('lists every note with its author key, character name and (DM) the author display name', async () => {
    const { layer, spies } = createFakeLayer({ index: { pjs: [{ id: 3, title: 'Eldric', imagen_url: null, estado: 'publicado' }] } })
    spies.playerNotesList.mockResolvedValue([
      note({ user_id: 'u2', character_id: 3, entity_type: 'pnjs', entity_id: 7, text: 'sospechoso' }),
      note({ user_id: 'u3', character_id: null, text: 'sin personaje' }),
    ])
    spies.membersList.mockResolvedValue([member('u2', 'Pepe'), member('u3', '  Lola ')])
    renderProbe(layer, true)
    await waitFor(() => expect(getPort().all().find((n) => n.key === 'u2')?.author).toBe('Pepe'))
    expect(getPort().all()).toEqual([
      { type: 'pnjs', id: 7, text: 'sospechoso', key: 'u2', label: 'Eldric', author: 'Pepe' },
      { type: 'lore', id: 1, text: 'sin personaje', key: 'u3', label: '', author: 'Lola' },
    ])
  })

  it('a player never asks for the members and gets no author names', async () => {
    const { layer, spies } = createFakeLayer()
    spies.playerNotesList.mockResolvedValue([note()])
    renderProbe(layer, false)
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready:1'))
    expect(spies.membersList).not.toHaveBeenCalled()
    expect(getPort().all()[0].author).toBeUndefined()
  })

  it('a failed load is flagged, and reload() retries and clears the flag', async () => {
    const { layer, spies } = createFakeLayer()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    spies.playerNotesList.mockRejectedValueOnce(new Error('down')).mockResolvedValue([note()])
    renderProbe(layer, false)
    await waitFor(() => expect(getPort().failed).toBe(true))
    expect(getPort().all()).toEqual([])
    act(() => getPort().reload?.())
    await waitFor(() => expect(getPort().failed).toBe(false))
    expect(getPort().all()).toHaveLength(1)
    errorSpy.mockRestore()
  })

  it('while a retry is in flight the port is loading, a second reload() is ignored and the retry result wins', async () => {
    const { layer, spies } = createFakeLayer()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let finishRetry: (items: PlayerNote[]) => void = () => undefined
    spies.playerNotesList
      .mockRejectedValueOnce(new Error('down'))
      .mockImplementationOnce(() => new Promise<PlayerNote[]>((resolve) => { finishRetry = resolve }))
    renderProbe(layer, false)
    await waitFor(() => expect(getPort().failed).toBe(true))
    act(() => getPort().reload?.())
    expect(getPort().loading).toBe(true)
    expect(getPort().failed).toBe(false)
    act(() => getPort().reload?.())
    expect(spies.playerNotesList).toHaveBeenCalledTimes(2)
    await act(async () => finishRetry([note()]))
    expect(getPort().loading).toBe(false)
    expect(getPort().all()).toHaveLength(1)
    errorSpy.mockRestore()
  })

  it('save and remove resolve false on failure and true on success', async () => {
    const { layer, spies } = createFakeLayer()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    spies.playerNotesList.mockResolvedValue([note()])
    ;(layer.playerNotes.upsert as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('x')).mockResolvedValue(note({ text: 'nueva' }))
    ;(layer.playerNotes.remove as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    renderProbe(layer, false)
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready:1'))
    let result: boolean | void = undefined
    await act(async () => { result = await getPort().save('lore', 1, 'nueva') })
    expect(result).toBe(false)
    await act(async () => { result = await getPort().save('lore', 1, 'nueva') })
    expect(result).toBe(true)
    expect(getPort().all()[0].text).toBe('nueva')
    await act(async () => { result = await getPort().remove('lore', 1) })
    expect(result).toBe(true)
    expect(getPort().all()).toEqual([])
    errorSpy.mockRestore()
  })
})
