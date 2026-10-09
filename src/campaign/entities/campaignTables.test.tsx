import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Disponibilidad, GamePot, PlayerAvailability } from '../../data'
import { CampaignTestProviders, createFakeLayer } from '../testing/fakeLayer'
import { TableStore } from './tableStore'
import { useDisponibilidad } from './useDisponibilidad'
import { useGamePot } from './useGamePot'
import { AVAILABILITY_RECONCILE_INTERVAL_MS, usePlayerAvailability } from './usePlayerAvailability'
import { usePlayerAvailabilityActions } from './usePlayerAvailabilityActions'

const dispo = (id: number, over: Partial<Disponibilidad> = {}): Disponibilidad => ({
  id, campaign_id: 'c1', tipo: 'sesion', fecha_inicio: '2026-03-01', fecha_fin: '2026-03-01',
  hora_inicio: '18:00', hora_fin: '22:00', created_by: null, created_at: '', updated_at: '', ...over,
})
const avail = (id: number, over: Partial<PlayerAvailability> = {}): PlayerAvailability => ({
  id, user_id: 'u1', campaign_id: null, tipo: 'no_disponible', fecha: '2026-03-01', fecha_inicio: null, fecha_fin: null,
  hora_inicio: null, hora_fin: null, created_at: '', updated_at: '', ...over,
})
const POT: GamePot = { campaign_id: 'c1', cp: 5, sp: 0, ep: 0, gp: 12, pp: 0, updated_at: '2026-01-01T00:00:00Z' }

function setup(options: Parameters<typeof createFakeLayer>[0] = {}) {
  const made = createFakeLayer(options)
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <CampaignTestProviders layer={made.layer}>{children}</CampaignTestProviders>
  )
  return { ...made, wrapper }
}
const channelOf = (fake: ReturnType<typeof createFakeLayer>['fake'], table: string) =>
  fake.channels.find((c) => c.name.startsWith(`campaign:${table}:`))!

describe('useDisponibilidad', () => {
  it('lists the rows in id order and applies realtime insert, update and delete', async () => {
    const { wrapper, fake } = setup({ disponibilidad: [dispo(3), dispo(1)] })
    const { result } = renderHook(() => useDisponibilidad(), { wrapper })
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items.map((d) => d.id)).toEqual([1, 3])

    const channel = channelOf(fake, 'disponibilidad')
    act(() => channel.emit('INSERT', { new: dispo(2) }))
    expect(result.current.items.map((d) => d.id)).toEqual([1, 2, 3])
    act(() => channel.emit('UPDATE', { new: dispo(2, { hora_fin: '23:00' }) }))
    expect(result.current.items.find((d) => d.id === 2)?.hora_fin).toBe('23:00')
    act(() => channel.emit('DELETE', { old: { id: 1 } }))
    expect(result.current.items.map((d) => d.id)).toEqual([2, 3])
  })

  it('shares one channel and one list call between readers, and removes it with the last one', async () => {
    const { wrapper, fake, spies } = setup({ disponibilidad: [dispo(1)] })
    const { result, unmount } = renderHook(() => ({ a: useDisponibilidad(), b: useDisponibilidad() }), { wrapper })
    await waitFor(() => expect(result.current.a.loading).toBe(false))
    expect(result.current.b.items).toHaveLength(1)
    expect(fake.channels.filter((c) => c.name.startsWith('campaign:disponibilidad:'))).toHaveLength(1)
    expect(spies.disponibilidadList).toHaveBeenCalledTimes(1)
    unmount()
    await waitFor(() => expect(fake.removed.length).toBeGreaterThan(0))
  })

  it('surfaces a load error and recovers on reload', async () => {
    const { wrapper, spies } = setup({ disponibilidad: [dispo(1)] })
    spies.disponibilidadList.mockRejectedValueOnce(new Error('down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { result } = renderHook(() => useDisponibilidad(), { wrapper })
    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.items).toEqual([])
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    expect(result.current.error).toBeNull()
    errorSpy.mockRestore()
  })

  it('does not subscribe when disabled', () => {
    const { wrapper, fake } = setup()
    renderHook(() => useDisponibilidad({ enabled: false }), { wrapper })
    expect(fake.channels).toHaveLength(0)
  })
})

describe('usePlayerAvailability', () => {
  it('lists general and pinned rows in id order and follows realtime changes of this campaign only', async () => {
    const { wrapper, fake } = setup({ playerAvailability: [avail(3), avail(1, { campaign_id: 'c1' })] })
    const { result } = renderHook(() => usePlayerAvailability(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items.map((d) => d.id)).toEqual([1, 3])

    const channel = channelOf(fake, 'player_availability')
    // INSERT / UPDATE are subscribed without a campaign filter: a general row (NULL) can never match one
    const configs = channel.listeners.filter((l) => l.filter.event !== 'DELETE').map((l) => l.filter)
    expect(configs).toHaveLength(2)
    for (const c of configs) expect(c).not.toHaveProperty('filter')

    act(() => channel.emit('INSERT', { new: avail(2) }))
    act(() => channel.emit('INSERT', { new: avail(7, { campaign_id: 'other' }) }))
    expect(result.current.items.map((d) => d.id)).toEqual([1, 2, 3])
    act(() => channel.emit('UPDATE', { new: avail(2, { campaign_id: 'c1', fecha: '2026-04-01' }) }))
    expect(result.current.items.find((d) => d.id === 2)?.fecha).toBe('2026-04-01')
    // re-pinned to another campaign: it leaves this campaign's list
    act(() => channel.emit('UPDATE', { new: avail(2, { campaign_id: 'other' }) }))
    expect(result.current.items.map((d) => d.id)).toEqual([1, 3])
    act(() => channel.emit('DELETE', { old: { id: 1 } }))
    expect(result.current.items.map((d) => d.id)).toEqual([3])
  })

  it('shares one channel between readers and does not subscribe when disabled', async () => {
    const { wrapper, fake, spies } = setup({ playerAvailability: [avail(1)] })
    const { result } = renderHook(() => ({ a: usePlayerAvailability(), b: usePlayerAvailability() }), { wrapper })
    await waitFor(() => expect(result.current.a.loading).toBe(false))
    expect(fake.channels.filter((c) => c.name.startsWith('campaign:player_availability:'))).toHaveLength(1)
    expect(spies.playerAvailabilityList).toHaveBeenCalledTimes(1)

    const off = setup()
    renderHook(() => usePlayerAvailability({ enabled: false }), { wrapper: off.wrapper })
    expect(off.fake.channels).toHaveLength(0)
  })
})

describe('player availability reconcile (stale re-pin)', () => {
  // A member of campaign A that is not in B never receives the UPDATE of a row re-pinned A -> B.
  it('drops the stale copy when the tab regains focus (re-list in place)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const { wrapper, spies } = setup({ playerAvailability: [avail(1, { campaign_id: 'c1' })] })
      const { result } = renderHook(() => usePlayerAvailability(), { wrapper })
      await waitFor(() => expect(result.current.items.map((d) => d.id)).toEqual([1]))
      spies.playerAvailabilityList.mockResolvedValue([]) // the server no longer returns it for c1
      vi.setSystemTime(Date.now() + 31_000)
      await act(async () => {
        window.dispatchEvent(new Event('focus'))
      })
      await waitFor(() => expect(result.current.items).toEqual([]))
      expect(result.current.loading).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('drops the stale copy on the slow timer while the tab stays open, without a storm', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const { wrapper, spies } = setup({ playerAvailability: [avail(1, { campaign_id: 'c1' })] })
      const { result } = renderHook(() => usePlayerAvailability(), { wrapper })
      await waitFor(() => expect(result.current.items).toHaveLength(1))
      expect(spies.playerAvailabilityList).toHaveBeenCalledTimes(1)
      spies.playerAvailabilityList.mockResolvedValue([])
      await act(async () => {
        await vi.advanceTimersByTimeAsync(AVAILABILITY_RECONCILE_INTERVAL_MS - 5_000)
      })
      expect(spies.playerAvailabilityList).toHaveBeenCalledTimes(1) // not before the interval
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000)
      })
      await waitFor(() => expect(result.current.items).toEqual([]))
      expect(spies.playerAvailabilityList).toHaveBeenCalledTimes(2) // one re-list, not several
    } finally {
      vi.useRealTimers()
    }
  })

  it('re-lists after a local write and when the channel reconnects', async () => {
    const { wrapper, spies, layer, fake } = setup({ playerAvailability: [avail(1, { campaign_id: 'c1' }), avail(2)] })
    const { result } = renderHook(() => ({ list: usePlayerAvailability(), actions: usePlayerAvailabilityActions() }), { wrapper })
    await waitFor(() => expect(result.current.list.items).toHaveLength(2))
    const before = spies.playerAvailabilityList.mock.calls.length

    ;(layer.playerAvailability.update as ReturnType<typeof vi.fn>).mockResolvedValue(avail(2, { campaign_id: 'other' }))
    spies.playerAvailabilityList.mockResolvedValue([avail(1, { campaign_id: 'c1' })]) // id 2 moved away
    await act(async () => {
      await result.current.actions.update(2, { campaign_id: 'other' })
    })
    await waitFor(() => expect(result.current.list.items.map((d) => d.id)).toEqual([1]))
    expect(spies.playerAvailabilityList.mock.calls.length).toBe(before + 1)

    spies.playerAvailabilityList.mockResolvedValue([])
    act(() => channelOf(fake, 'player_availability').setStatus('SUBSCRIBED'))
    await waitFor(() => expect(result.current.list.items).toEqual([]))
  })

  it('a failed write toasts and does not re-list', async () => {
    const { wrapper, spies, layer } = setup({ playerAvailability: [avail(1)] })
    const { result } = renderHook(() => ({ list: usePlayerAvailability(), actions: usePlayerAvailabilityActions() }), { wrapper })
    await waitFor(() => expect(result.current.list.loading).toBe(false))
    ;(layer.playerAvailability.remove as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'))
    const before = spies.playerAvailabilityList.mock.calls.length
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let ok = true
    await act(async () => {
      ok = await result.current.actions.remove(1)
    })
    errorSpy.mockRestore()
    expect(ok).toBe(false)
    expect(spies.playerAvailabilityList.mock.calls.length).toBe(before)
  })
})

describe('useGamePot', () => {
  it('exposes the single pot row and follows realtime updates', async () => {
    const { wrapper, fake } = setup({ pot: POT })
    const { result } = renderHook(() => useGamePot(), { wrapper })
    expect(result.current.pot).toBeNull()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.pot?.gp).toBe(12)
    act(() => channelOf(fake, 'game_pot').emit('UPDATE', { new: { ...POT, gp: 20 } }))
    expect(result.current.pot?.gp).toBe(20)
    expect(result.current.pot?.cp).toBe(5)
  })

  it('is null (not an error) before the first prize and appears on realtime insert', async () => {
    const { wrapper, fake } = setup({ pot: null })
    const { result } = renderHook(() => useGamePot(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.pot).toBeNull()
    expect(result.current.error).toBeNull()
    act(() => channelOf(fake, 'game_pot').emit('INSERT', { new: POT }))
    expect(result.current.pot?.gp).toBe(12)
  })

  it('reports a load error and reloads', async () => {
    const { wrapper, spies } = setup({ pot: POT })
    spies.potGet.mockRejectedValueOnce(new Error('down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { result } = renderHook(() => useGamePot(), { wrapper })
    await waitFor(() => expect(result.current.error).not.toBeNull())
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.pot?.gp).toBe(12))
    errorSpy.mockRestore()
  })
})

describe('TableStore generic specs', () => {
  it('are referentially stable, keyed dispo / pavail / pot, and separate subscriptions', () => {
    const store = new TableStore(createFakeLayer().layer, 'c1')
    expect(store.disponibilidadSpec()).toBe(store.disponibilidadSpec())
    expect(store.gamePotSpec()).toBe(store.gamePotSpec())
    expect(store.disponibilidadSpec().key).toBe('dispo')
    expect(store.gamePotSpec().key).toBe('pot')
    expect(store.playerAvailabilitySpec()).toBe(store.playerAvailabilitySpec())
    expect(store.playerAvailabilitySpec().key).toBe('pavail')
    store.retain(store.disponibilidadSpec())
    store.retain(store.gamePotSpec())
    store.retain(store.playerAvailabilitySpec())
    expect(store.activeCount).toBe(3)
  })
})
