import { describe, expect, it, vi } from 'vitest'
import { createFakeLayer } from '../testing/fakeLayer'
import { TableStore, type TableSnapshot } from './tableStore'

const snapshot = (refresh: () => void): TableSnapshot<unknown> => ({ items: [], loading: false, error: null, realtime: 'live', reload: () => undefined, refresh })

describe('TableStore', () => {
  it('refcounts retains: the subscription stays until the last release, and double release is harmless', () => {
    const store = new TableStore(createFakeLayer().layer, 'c1')
    const spec = store.entitySpec('pnjs')
    const a = store.retain(spec)
    const b = store.retain(spec)
    expect(store.activeCount).toBe(1)
    a()
    a() // idempotent
    expect(store.activeCount).toBe(1)
    b()
    expect(store.activeCount).toBe(0)
    store.retain(store.indexSpec('pnjs'))
    store.retain(spec)
    expect(store.activeCount).toBe(2) // entity and index specs are separate subscriptions
  })

  it('specs are referentially stable per table', () => {
    const store = new TableStore(createFakeLayer().layer, 'c1')
    expect(store.entitySpec('lore')).toBe(store.entitySpec('lore'))
    expect(store.indexSpec('lore')).toBe(store.indexSpec('lore'))
    expect(store.allIndexSpecs).toHaveLength(9)
  })

  it('refreshAll re-lists open tables only after the throttle window', () => {
    const store = new TableStore(createFakeLayer().layer, 'c1')
    const spec = store.entitySpec('pnjs')
    store.retain(spec)
    const refresh = vi.fn()
    store.publish(spec.key, snapshot(refresh))
    const t0 = Date.now()
    expect(store.refreshAll(30_000, t0 + 1_000)).toBe(false)
    expect(refresh).not.toHaveBeenCalled()
    expect(store.refreshAll(30_000, t0 + 31_000)).toBe(true)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(store.refreshAll(30_000, t0 + 40_000)).toBe(false) // window restarts at the last refresh
  })

  it('does not refresh released tables and detail versions only change on invalidate', () => {
    const store = new TableStore(createFakeLayer().layer, 'c1')
    const spec = store.entitySpec('pnjs')
    const release = store.retain(spec)
    const refresh = vi.fn()
    store.publish(spec.key, snapshot(refresh))
    release()
    store.refreshAll(0, Date.now() + 1)
    expect(refresh).not.toHaveBeenCalled()
    expect(store.detailVersion('lore', 1)).toBe(0)
    store.invalidateDetail('lore', 1)
    expect(store.detailVersion('lore', 1)).toBe(1)
    expect(store.detailVersion('lore', 2)).toBe(0)
  })
})
