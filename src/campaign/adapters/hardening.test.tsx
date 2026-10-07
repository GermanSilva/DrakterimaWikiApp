import { useEffect } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../../auth/AuthContext'
import { DataContext } from '../../app/DataContext'
import { makeAuth, makeCampaign, makeData } from '../../app/testing/renderApp'
import UnreadDot from '../../components/UnreadDot'
import type { PlayerNote } from '../../data'
import { usePlayerNotesPort, useUnreadPort, type PlayerNotesPort, type UnreadPort } from '../../ports'
import { CampaignContext } from '../CampaignContext'
import { useEntityForm, type EntityFormType } from '../entityFormContext'
import { createFakeLayer } from '../testing/fakeLayer'
import { HubPortsProvider } from './HubPortsProvider'

function renderHub(layer: ReturnType<typeof createFakeLayer>['layer'], children: React.ReactNode, isDM = true) {
  window.scrollTo = vi.fn() as typeof window.scrollTo
  return render(
    <MemoryRouter initialEntries={['/c/demo/lore']}>
      <AuthContext.Provider value={makeAuth()}>
        <DataContext.Provider value={makeData({ layer })}>
          <CampaignContext.Provider
            value={{ campaign: makeCampaign({ id: 'c1', slug: 'demo' }), role: isDM ? 'dm' : 'player', isDM, myCharacterIds: [3], reload: () => undefined }}
          >
            <HubPortsProvider>{children}</HubPortsProvider>
          </CampaignContext.Provider>
        </DataContext.Provider>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

function Opener({ types = ['lore'] as EntityFormType[] }: { types?: EntityFormType[] }) {
  const { openForm } = useEntityForm()
  return (
    <>
      {types.map((t) => (
        <button key={t} onClick={() => openForm({ type: t })}>{`nuevo ${t}`}</button>
      ))}
    </>
  )
}


describe('EntityFormHost: create with failed follow-ups', () => {
  it('stays open as an EDIT of the created row: the retry updates, never creates a duplicate', async () => {
    const { layer, spies } = createFakeLayer()
    spies.dmNotesUpsert.mockRejectedValueOnce(new Error('boom'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderHub(layer, <Opener />)
    fireEvent.click(screen.getByRole('button', { name: 'nuevo lore' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getAllByRole('textbox')[0], { target: { value: 'Nuevo' } })
    const textareas = within(dialog).getAllByRole('textbox').filter((el) => el.tagName === 'TEXTAREA')
    fireEvent.change(textareas[1], { target: { value: 'nota dm' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(spies.dmNotesUpsert).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByText('Editar Lore')).toBeInTheDocument())

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(spies.dmNotesUpsert).toHaveBeenCalledTimes(2))
    const calls = spies.saveEntityWithDmNotes.mock.calls
    expect(calls.filter(([, target]) => (target as { id?: number }).id === undefined)).toHaveLength(1) // one create only
    expect(calls.at(-1)?.[1]).toMatchObject({ id: 99 }) // the retry is an update of the created row
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    errorSpy.mockRestore()
  })
})

describe('EntityFormHost: one host per request', () => {
  it('a new openForm starts from a clean form, never from the previous typed state', async () => {
    const { layer } = createFakeLayer()
    renderHub(layer, <Opener />)
    fireEvent.click(screen.getByRole('button', { name: 'nuevo lore' }))
    let dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getAllByRole('textbox')[0], { target: { value: 'texto viejo' } })
    fireEvent.click(screen.getByRole('button', { name: 'nuevo lore' }))
    dialog = await screen.findByRole('dialog')
    expect(within(dialog).getAllByRole('textbox')[0]).toHaveValue('')
  })
})

describe('regions in hub forms', () => {
  it('a campaign without regions still offers "Otro" and never saves an empty region', async () => {
    const { layer, spies } = createFakeLayer()
    renderHub(layer, <Opener types={['pnjs']} />)
    fireEvent.click(screen.getByRole('button', { name: 'nuevo pnjs' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('option', { name: 'Otro' })).toBeInTheDocument()
    fireEvent.change(within(dialog).getAllByRole('textbox')[0], { target: { value: 'Ana' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(spies.saveEntityWithDmNotes).toHaveBeenCalled())
    expect(spies.saveEntityWithDmNotes.mock.calls[0][2]).toMatchObject({ region: 'otro' })
  })
})

describe('HubPlayerNotesProvider', () => {
  it('ignores a save result that belongs to another campaign', async () => {
    const { layer } = createFakeLayer()
    const foreign = { campaign_id: 'other', user_id: 'user-1', entity_type: 'lore', entity_id: 1, character_id: null, text: 'ajena', created_at: '', updated_at: '' } as PlayerNote
    ;(layer.playerNotes.upsert as ReturnType<typeof vi.fn>).mockResolvedValue(foreign)
    let port: PlayerNotesPort | null = null
    const Probe = () => {
      const p = usePlayerNotesPort()
      useEffect(() => {
        port = p
      })
      return null
    }
    renderHub(layer, <Probe />, false)
    await waitFor(() => expect(port?.loading).toBe(false))
    await act(async () => {
      await port?.save('lore', 1, 'ajena')
    })
    expect(layer.playerNotes.upsert).toHaveBeenCalled()
    expect((port as PlayerNotesPort | null)?.mine('lore', 1)).toBe('')
  })
})

describe('HubUnreadProvider.markRead', () => {
  const T = '2026-01-01T00:00:00Z'
  function setup() {
    const made = createFakeLayer()
    let port: UnreadPort | null = null
    const Probe = () => {
      const p = useUnreadPort()
      useEffect(() => {
        port = p
      })
      return null
    }
    renderHub(made.layer, (
      <>
        <Probe />
        <UnreadDot type="lore" id={1} updatedAt={T} data-testid="dot" />
      </>
    ))
    return { ...made, port: () => port as UnreadPort }
  }

  it('clears the dot at once, writes once with the right arguments, and skips a covered mark', async () => {
    const { layer, port } = setup()
    expect(await screen.findByTestId('dot')).toBeInTheDocument()
    await act(async () => port().markRead('lore', 1, T))
    expect(screen.queryByTestId('dot')).toBeNull()
    const markSeen = layer.readState.markSeen as ReturnType<typeof vi.fn>
    expect(markSeen).toHaveBeenCalledTimes(1)
    const [campaignId, type, id, section, seenAt] = markSeen.mock.calls[0]
    expect([campaignId, type, id, section]).toEqual(['c1', 'lore', 1, ''])
    expect(seenAt).toBeInstanceOf(Date)
    await act(async () => port().markRead('lore', 1, T))
    expect(markSeen).toHaveBeenCalledTimes(1) // already covered: no second write
  })

  it('a failed write is only logged: the dot stays cleared and no toast appears', async () => {
    const { layer, port } = setup()
    await screen.findByTestId('dot')
    ;(layer.readState.markSeen as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await act(async () => port().markRead('lore', 1, T))
    await waitFor(() => expect(errorSpy).toHaveBeenCalled())
    expect(screen.queryByTestId('dot')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    errorSpy.mockRestore()
  })

  it('ignores types that have no read state', async () => {
    const { layer, port } = setup()
    await screen.findByTestId('dot')
    await act(async () => port().markRead('mapas', 1, T))
    expect(layer.readState.markSeen).not.toHaveBeenCalled()
  })
})
