import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createEntityRepository } from './entityRepository'
import { disponibilidadSource, entitySource, type TableSource } from './realtime'
import { createFakeClient } from './testing/fakeClient'
import { useCampaignTable } from './useCampaignTable'

interface Item {
  id: number
  campaign_id: string
  name: string
}

const item = (id: number, name = `n${id}`): Item => ({ id, campaign_id: 'c1', name })

/** A source whose list() calls stay pending until the test resolves/rejects them. */
function deferredSource() {
  const pending: { resolve: (rows: Item[]) => void; reject: (e: Error) => void }[] = []
  const list = vi.fn(
    () => new Promise<Item[]>((resolve, reject) => pending.push({ resolve, reject })),
  )
  const source: TableSource<Item> = {
    table: 'pnjs',
    list,
    fromRow: (row) => row as unknown as Item,
    keyOfItem: (i) => String(i.id),
    keyOfRow: (r) => String(r.id),
  }
  return { source, list, pending }
}

describe('useCampaignTable: reload, buffering and sorting', () => {
  it('reload() goes back to loading / connecting until the new list and SUBSCRIBED arrive', async () => {
    const fake = createFakeClient()
    const { source, pending } = deferredSource()
    const { result } = renderHook(() => useCampaignTable(source, 'c1', { client: fake.db }))
    await act(async () => pending[0].resolve([item(1)]))
    act(() => fake.channels[0].setStatus('SUBSCRIBED'))
    await act(async () => pending[1].resolve([item(1)]))
    expect(result.current).toMatchObject({ loading: false, realtime: 'live' })

    act(() => result.current.reload())
    expect(result.current).toMatchObject({ loading: true, realtime: 'connecting' })
    expect(fake.removed).toEqual([fake.channels[0]]) // old subscription dropped

    act(() => fake.channels[1].setStatus('SUBSCRIBED'))
    expect(result.current.realtime).toBe('live')
    await act(async () => {
      pending[2].resolve([item(1), item(2)])
      pending[3].resolve([item(1), item(2)])
    })
    expect(result.current).toMatchObject({ loading: false })
    expect(result.current.items).toHaveLength(2)
  })

  it('keeps events buffered for an in-flight first load when a second load starts', async () => {
    const fake = createFakeClient()
    const { source, pending } = deferredSource()
    const { result } = renderHook(() => useCampaignTable(source, 'c1', { client: fake.db }))
    act(() => fake.channels[0].emit('INSERT', { new: item(5) })) // buffered for load #1
    act(() => fake.channels[0].setStatus('SUBSCRIBED')) // starts load #2 while #1 is pending

    await act(async () => pending[0].resolve([item(1)])) // #1 completes first: replays its buffer
    expect(result.current.items.map((i) => i.id)).toEqual([1, 5])
    act(() => fake.channels[0].emit('INSERT', { new: item(6) })) // still buffered for #2, applied live
    expect(result.current.items.map((i) => i.id)).toEqual([1, 5, 6])

    await act(async () => pending[1].resolve([item(1), item(5), item(6)])) // newest load wins
    expect(result.current.items.map((i) => i.id)).toEqual([1, 5, 6])
    expect(result.current.loading).toBe(false)
  })

  it('does not insert a partial UPDATE row when no list has loaded yet', async () => {
    const fake = createFakeClient()
    const { source, pending } = deferredSource()
    const { result } = renderHook(() => useCampaignTable(source, 'c1', { client: fake.db }))
    await act(async () => pending[0].reject(new Error('boom'))) // nothing on screen, no load in flight
    act(() => fake.channels[0].emit('UPDATE', { new: { id: 9, campaign_id: 'c1' } })) // partial row
    expect(result.current.items).toEqual([])
    act(() => fake.channels[0].emit('INSERT', { new: item(10) })) // full inserts still show
    expect(result.current.items.map((i) => i.id)).toEqual([10])
  })

  it('restarts from a fresh list when buffered changes overflow', async () => {
    const fake = createFakeClient()
    const { source, list, pending } = deferredSource()
    renderHook(() => useCampaignTable(source, 'c1', { client: fake.db }))
    expect(list).toHaveBeenCalledTimes(1) // load #1 hangs
    act(() => {
      for (let i = 0; i <= 5000; i++) fake.channels[0].emit('INSERT', { new: item(100 + i) })
    })
    expect(list).toHaveBeenCalledTimes(2) // overflow invalidated #1 and started a fresh load
    expect(pending).toHaveLength(2)
  })

  it('shows buffered events and the error when the first load fails', async () => {
    const fake = createFakeClient()
    const { source, pending } = deferredSource()
    const { result } = renderHook(() => useCampaignTable(source, 'c1', { client: fake.db }))
    act(() => fake.channels[0].emit('INSERT', { new: item(7) }))
    await act(async () => pending[0].reject(new Error('list failed')))
    expect(result.current.error?.message).toBe('list failed')
    expect(result.current.loading).toBe(false)
    expect(result.current.items.map((i) => i.id)).toEqual([7])
    // after a failed load, later events apply directly
    act(() => fake.channels[0].emit('INSERT', { new: item(8) }))
    expect(result.current.items.map((i) => i.id)).toEqual([7, 8])
  })

  it('applies the sort option after the load and after each change', async () => {
    const fake = createFakeClient()
    const { source, pending } = deferredSource()
    const sort = (a: Item, b: Item) => b.id - a.id
    const { result } = renderHook(() => useCampaignTable(source, 'c1', { client: fake.db, sort }))
    await act(async () => pending[0].resolve([item(1), item(3)]))
    expect(result.current.items.map((i) => i.id)).toEqual([3, 1])
    act(() => fake.channels[0].emit('INSERT', { new: item(2) }))
    expect(result.current.items.map((i) => i.id)).toEqual([3, 2, 1])
  })

  it('does nothing after unmount: no list() call, no state update', async () => {
    const fake = createFakeClient()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { source, list, pending } = deferredSource()
    const { result, unmount } = renderHook(() => useCampaignTable(source, 'c1', { client: fake.db }))
    const channel = fake.channels[0]
    unmount()
    const before = result.current
    channel.setStatus('SUBSCRIBED') // reconnect after unmount must not re-list
    channel.emit('INSERT', { new: item(1) })
    await act(async () => pending[0].resolve([item(9)])) // in-flight load completes late
    expect(list).toHaveBeenCalledTimes(1)
    expect(result.current).toBe(before)
    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})

describe('sources', () => {
  it('entitySource maps rows and merges a partial UPDATE row onto the loaded copy', async () => {
    const fake = createFakeClient()
    const repo = createEntityRepository(fake.db, 'pnjs')
    fake.enqueue({
      data: [{ id: 4, campaign_id: 'c1', nombre: 'Aldric', updated_at: 'v1', data: { rol: 'herrero', descripcion: 'grande' } }],
    })
    const source = entitySource(repo)
    const { result } = renderHook(() => useCampaignTable(source, 'c1', { client: fake.db }))
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    expect(result.current.items[0]).toMatchObject({ id: 4, nombre: 'Aldric', rol: 'herrero', descripcion: 'grande' })

    // Realtime omitted the unchanged `data` column
    act(() => fake.channels[0].emit('UPDATE', { new: { id: 4, campaign_id: 'c1', nombre: 'Renombrado', updated_at: 'v2' } }))
    expect(result.current.items[0]).toMatchObject({ nombre: 'Renombrado', rol: 'herrero', descripcion: 'grande', updated_at: 'v2' })

    expect(source.keyOfRow({ id: 4 })).toBe('4')
    expect(source.keyOfItem(result.current.items[0])).toBe('4')
  })

  it('disponibilidadSource identifies rows by id', () => {
    const fake = createFakeClient()
    const source = disponibilidadSource(fake.db)
    expect(source.table).toBe('disponibilidad')
    expect(source.keyOfRow({ id: 12 })).toBe('12')
    expect(source.keyOfItem({ id: 12 } as never)).toBe('12')
    expect(source.fromRow({ id: 12, tipo: 'sesion' })).toMatchObject({ id: 12, tipo: 'sesion' })
  })
})
