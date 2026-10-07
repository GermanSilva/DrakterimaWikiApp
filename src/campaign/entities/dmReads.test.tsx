import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CampaignTestProviders, createFakeLayer } from '../testing/fakeLayer'
import { useCampaignServices } from './campaignServicesContext'
import { SECRET_IDS_REFRESH_DELAY_MS, useDmSecretIds } from './useDmSecretIds'

afterEach(() => vi.useRealTimers())

describe('useDmSecretIds', () => {
  const setup = () => {
    const made = createFakeLayer({
      dmNotes: { 'pnjs:1': { notas: '', secreto: 'algo', ganchos: '' }, 'pnjs:2': { notas: 'n', secreto: '  ', ganchos: '' }, 'lugares:3': { notas: '', secreto: 'otro', ganchos: '' } },
    })
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <CampaignTestProviders layer={made.layer} isDM>
        {children}
      </CampaignTestProviders>
    )
    return { ...made, wrapper }
  }

  it('reads only the notes of the requested entity type and keeps ids with a non-blank secreto', async () => {
    const { wrapper, spies } = setup()
    const { result } = renderHook(() => useDmSecretIds('pnjs', [1, 2]), { wrapper })
    await vi.waitFor(() => expect(result.current.status).toBe('ready'))
    expect(spies.dmNotesList).toHaveBeenCalledWith('c1', 'pnjs')
    expect([...result.current.ids]).toEqual([1])
  })

  it('a burst of realtime detail changes costs ONE re-read, after the quiet period', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { wrapper, spies } = setup()
    const { result } = renderHook(() => ({ secrets: useDmSecretIds('pnjs', [1, 2]), services: useCampaignServices() }), { wrapper })
    await act(async () => undefined) // first read
    expect(spies.dmNotesList).toHaveBeenCalledTimes(1)

    act(() => {
      for (let i = 0; i < 8; i++) result.current.services.store.invalidateDetail('pnjs', 1 + (i % 2))
    })
    await act(async () => {
      vi.advanceTimersByTime(SECRET_IDS_REFRESH_DELAY_MS - 100)
    })
    expect(spies.dmNotesList).toHaveBeenCalledTimes(1) // still inside the quiet period

    act(() => result.current.services.store.invalidateDetail('pnjs', 1)) // another event restarts the wait
    await act(async () => {
      vi.advanceTimersByTime(SECRET_IDS_REFRESH_DELAY_MS - 100)
    })
    expect(spies.dmNotesList).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    expect(spies.dmNotesList).toHaveBeenCalledTimes(2)
  })

  it('makes no request for a player', async () => {
    const made = createFakeLayer()
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <CampaignTestProviders layer={made.layer} isDM={false}>
        {children}
      </CampaignTestProviders>
    )
    const { result } = renderHook(() => useDmSecretIds('pnjs', [1]), { wrapper })
    await act(async () => undefined)
    expect(result.current.status).toBe('idle')
    expect(result.current.ids.size).toBe(0)
    expect(made.spies.dmNotesList).not.toHaveBeenCalled()
  })
})
