import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { applyDelete, applyUpsert, type TableSource } from './realtime'
import { createFakeClient } from './testing/fakeClient'
import { useCampaignTable } from './useCampaignTable'

interface Item {
  id: number
  campaign_id: string
  name: string
}

function makeSource(lists: Item[][]): TableSource<Item> & { list: ReturnType<typeof vi.fn> } {
  const list = vi.fn(async () => lists.shift() ?? [])
  return {
    table: 'pnjs',
    list,
    fromRow: (row) => row as unknown as Item,
    keyOfItem: (i) => String(i.id),
    keyOfRow: (r) => String(r.id),
  }
}

const item = (id: number, name = `n${id}`): Item => ({ id, campaign_id: 'c1', name })

describe('applyUpsert / applyDelete', () => {
  const source = makeSource([])
  it('replaces by key or appends', () => {
    expect(applyUpsert([item(1)], item(1, 'x'), source)).toEqual([item(1, 'x')])
    expect(applyUpsert([item(1)], item(2), source)).toEqual([item(1), item(2)])
  })
  it('ignores deletes of unknown keys (returns the same array)', () => {
    const items = [item(1)]
    expect(applyDelete(items, '99', source)).toBe(items)
    expect(applyDelete(items, '1', source)).toEqual([])
  })
})

describe('useCampaignTable', () => {
  it('loads, applies insert/update/delete from the channel and unsubscribes on unmount', async () => {
    const fake = createFakeClient()
    const source = makeSource([[item(1), item(2)]])
    const { result, unmount } = renderHook(() => useCampaignTable(source, 'c1', { client: fake.db }))

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items.map((i) => i.id)).toEqual([1, 2])

    const channel = fake.channels[0]
    // subscribed with a campaign filter on INSERT/UPDATE; DELETE is unfiltered by design
    expect(channel.listeners.map((l) => [l.filter.event, l.filter.filter])).toEqual([
      ['INSERT', 'campaign_id=eq.c1'],
      ['UPDATE', 'campaign_id=eq.c1'],
      ['DELETE', undefined],
    ])

    act(() => channel.emit('INSERT', { new: item(3) }))
    expect(result.current.items.map((i) => i.id)).toEqual([1, 2, 3])

    act(() => channel.emit('UPDATE', { new: item(2, 'renamed') }))
    expect(result.current.items.find((i) => i.id === 2)?.name).toBe('renamed')

    act(() => channel.emit('DELETE', { old: { id: 1 } }))
    expect(result.current.items.map((i) => i.id)).toEqual([2, 3])

    // a delete for an id we never had (another campaign) changes nothing
    const before = result.current.items
    act(() => channel.emit('DELETE', { old: { id: 999 } }))
    expect(result.current.items).toBe(before)

    act(() => channel.setStatus('SUBSCRIBED'))
    expect(result.current.realtime).toBe('live')
    act(() => channel.setStatus('CHANNEL_ERROR'))
    expect(result.current.realtime).toBe('error')

    unmount()
    expect(fake.removed).toEqual([channel])
  })

  it('buffers changes that arrive while the initial load is in flight', async () => {
    const fake = createFakeClient()
    let resolveList: (rows: Item[]) => void = () => undefined
    const source = makeSource([])
    source.list.mockImplementation(() => new Promise<Item[]>((r) => (resolveList = r)))
    const { result } = renderHook(() => useCampaignTable(source, 'c1', { client: fake.db }))

    act(() => fake.channels[0].emit('INSERT', { new: item(5) }))
    act(() => fake.channels[0].emit('DELETE', { old: { id: 1 } }))
    expect(result.current.items).toEqual([])
    await act(async () => resolveList([item(1), item(2)]))
    expect(result.current.items.map((i) => i.id)).toEqual([2, 5])
    expect(result.current.loading).toBe(false)
  })

  it('exposes load errors', async () => {
    const fake = createFakeClient()
    const source = makeSource([])
    source.list.mockRejectedValue(new Error('denied'))
    const { result } = renderHook(() => useCampaignTable(source, 'c1', { client: fake.db }))
    await waitFor(() => expect(result.current.error?.message).toBe('denied'))
    expect(result.current.loading).toBe(false)
  })

  it('resubscribes when the campaign changes and drops the previous channel', async () => {
    const fake = createFakeClient()
    const source = makeSource([[item(1)], [{ ...item(9), campaign_id: 'c2' }]])
    const { result, rerender } = renderHook(({ id }) => useCampaignTable(source, id, { client: fake.db }), {
      initialProps: { id: 'c1' },
    })
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    rerender({ id: 'c2' })
    expect(result.current.items).toEqual([]) // no stale rows from c1
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.items.map((i) => i.id)).toEqual([9]))
    expect(fake.removed).toEqual([fake.channels[0]])
    expect(fake.channels[1].listeners[0].filter.filter).toBe('campaign_id=eq.c2')
  })

  it('does nothing without a campaign id', () => {
    const fake = createFakeClient()
    const source = makeSource([])
    const { result } = renderHook(() => useCampaignTable(source, null, { client: fake.db }))
    expect(result.current).toMatchObject({ items: [], loading: false, error: null })
    expect(fake.channels).toHaveLength(0)
    expect(source.list).not.toHaveBeenCalled()
  })

  it('ignores events that arrive after unmount', async () => {
    const fake = createFakeClient()
    const source = makeSource([[item(1)]])
    const { result, unmount } = renderHook(() => useCampaignTable(source, 'c1', { client: fake.db }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    const channel = fake.channels[0]
    unmount()
    expect(() => channel.emit('INSERT', { new: item(2) })).not.toThrow()
  })
})

describe('useCampaignTable resilience', () => {
  it('merges UPDATE payloads onto the previous copy (omitted columns keep their value)', async () => {
    const fake = createFakeClient()
    const full = { ...item(1, 'old'), big: 'unchanged large column' } as Item
    const source = makeSource([[full]])
    const { result } = renderHook(() => useCampaignTable(source, 'c1', { client: fake.db }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    // partial payload: no `big`
    act(() => fake.channels[0].emit('UPDATE', { new: { id: 1, campaign_id: 'c1', name: 'new' } }))
    expect(result.current.items[0]).toMatchObject({ name: 'new', big: 'unchanged large column' })
    // INSERT replaces (a fresh row is complete)
    act(() => fake.channels[0].emit('INSERT', { new: { id: 1, campaign_id: 'c1', name: 'again' } }))
    expect(result.current.items[0]).not.toHaveProperty('big')
  })

  it('re-lists on every SUBSCRIBED (join and reconnect), dropping rows that vanished meanwhile', async () => {
    const fake = createFakeClient()
    const source = makeSource([[item(1), item(2)], [item(1), item(2), item(3)], [item(1)]])
    const { result } = renderHook(() => useCampaignTable(source, 'c1', { client: fake.db }))
    await waitFor(() => expect(result.current.items).toHaveLength(2))

    await act(async () => fake.channels[0].setStatus('SUBSCRIBED')) // join: picks up item 3
    await waitFor(() => expect(result.current.items.map((i) => i.id)).toEqual([1, 2, 3]))
    expect(result.current.realtime).toBe('live')

    act(() => fake.channels[0].setStatus('TIMED_OUT'))
    expect(result.current.realtime).toBe('error')
    await act(async () => fake.channels[0].setStatus('SUBSCRIBED')) // reconnect: 2 and 3 are gone/hidden
    await waitFor(() => expect(result.current.items.map((i) => i.id)).toEqual([1]))
    expect(source.list).toHaveBeenCalledTimes(3)
  })

  it('maps CLOSED and CHANNEL_ERROR to the error status', async () => {
    const fake = createFakeClient()
    const source = makeSource([[]])
    const { result } = renderHook(() => useCampaignTable(source, 'c1', { client: fake.db }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => fake.channels[0].setStatus('CLOSED'))
    expect(result.current.realtime).toBe('error')
    act(() => fake.channels[0].setStatus('CHANNEL_ERROR'))
    expect(result.current.realtime).toBe('error')
  })

  it('ignores a stale list result when a newer load started, and reload() re-lists', async () => {
    const fake = createFakeClient()
    const resolvers: ((rows: Item[]) => void)[] = []
    const source = makeSource([])
    source.list.mockImplementation(() => new Promise<Item[]>((r) => resolvers.push(r)))
    const { result } = renderHook(() => useCampaignTable(source, 'c1', { client: fake.db }))
    act(() => fake.channels[0].setStatus('SUBSCRIBED')) // second load while the first is pending
    await act(async () => resolvers[1]([item(2)]))
    await act(async () => resolvers[0]([item(1)])) // stale: must be ignored
    expect(result.current.items.map((i) => i.id)).toEqual([2])

    act(() => result.current.reload())
    await waitFor(() => expect(source.list).toHaveBeenCalledTimes(3)) // initial + SUBSCRIBED + reload
  })
})
