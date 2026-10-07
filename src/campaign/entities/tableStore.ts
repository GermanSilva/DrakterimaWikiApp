import { useEffect, useMemo, useSyncExternalStore } from 'react'
import {
  entitySource,
  wikiIndexSource,
  WIKI_INDEX_TABLES,
  type CampaignTableState,
  type DataLayer,
  type EntityTable,
  type FlatEntity,
  type TableSource,
  type WikiIndexItem,
  type WikiIndexTable,
} from '../../data'
import { ENTITY_SORT } from './sort'

/** What a consumer of a table reads: the same shape as `useCampaignTable`. */
export type TableSnapshot<T> = CampaignTableState<T>

export interface TableSpec<T = unknown> {
  /** Unique key of the subscription: `entity:<table>` or `index:<table>`. */
  key: string
  source: TableSource<T>
  sort?: (a: T, b: T) => number
}

const noop = () => undefined
/** Minimum time between two focus/visibility re-lists. */
export const REFRESH_MIN_INTERVAL_MS = 30_000
const LOADING: TableSnapshot<never> = { items: [], loading: true, error: null, realtime: 'connecting', reload: noop, refresh: noop }
const DISABLED: TableSnapshot<never> = { items: [], loading: false, error: null, realtime: 'connecting', reload: noop, refresh: noop }

/**
 * One realtime subscription per table for the whole campaign layout.
 *
 * Components never subscribe themselves: they `retain` a spec while mounted (reference counted) and
 * read the shared snapshot. The first retain mounts a headless <TableLoader> (which runs the one
 * `useCampaignTable` for that key), the last release unmounts it and removes the channel. So N
 * components reading `pnjs` open ONE channel, not N.
 */
export class TableStore {
  readonly layer: DataLayer
  readonly campaignId: string
  private specs = new Map<string, TableSpec>()
  private counts = new Map<string, number>()
  private snapshots = new Map<string, TableSnapshot<unknown>>()
  private versions = new Map<string, number>()
  private active: readonly TableSpec[] = []
  private detailVersions = new Map<string, number>()
  private lastRefreshAt = Date.now()
  private listeners = new Set<() => void>()
  private entitySpecs = new Map<EntityTable, TableSpec<FlatEntity>>()
  private indexSpecs = new Map<WikiIndexTable, TableSpec<WikiIndexItem>>()
  /** Stable array of the index specs of every wiki table. */
  readonly allIndexSpecs: readonly TableSpec<WikiIndexItem>[]

  constructor(layer: DataLayer, campaignId: string) {
    this.layer = layer
    this.campaignId = campaignId
    this.allIndexSpecs = WIKI_INDEX_TABLES.map((t) => this.indexSpec(t))
  }

  /** Referentially stable spec of a full entity table (realtime source and sort must not change). */
  entitySpec(table: EntityTable): TableSpec<FlatEntity> {
    let spec = this.entitySpecs.get(table)
    if (!spec) {
      spec = { key: `entity:${table}`, source: entitySource(this.layer.entity(table)), sort: ENTITY_SORT[table] }
      this.entitySpecs.set(table, spec)
    }
    return spec
  }

  /** Referentially stable spec of the lightweight wiki index of a table. */
  indexSpec(table: WikiIndexTable): TableSpec<WikiIndexItem> {
    let spec = this.indexSpecs.get(table)
    if (!spec) {
      spec = {
        key: `index:${table}`,
        source: wikiIndexSource(this.layer.wikiIndex(table)),
        sort: (a, b) => a.id - b.id,
      }
      this.indexSpecs.set(table, spec)
    }
    return spec
  }

  retain<T>(specOfAnyRow: TableSpec<T>): () => void {
    const spec = specOfAnyRow as TableSpec
    const count = this.counts.get(spec.key) ?? 0
    this.counts.set(spec.key, count + 1)
    if (count === 0) {
      this.specs.set(spec.key, spec)
      this.recomputeActive()
    }
    let released = false
    return () => {
      if (released) return
      released = true
      const left = (this.counts.get(spec.key) ?? 1) - 1
      if (left <= 0) {
        this.counts.delete(spec.key)
        this.specs.delete(spec.key)
        this.recomputeActive()
      } else {
        this.counts.set(spec.key, left)
      }
    }
  }

  /** Number of subscriptions currently open (one per retained key). */
  get activeCount(): number {
    return this.active.length
  }

  getActive = (): readonly TableSpec[] => this.active

  get<T>(key: string): TableSnapshot<T> {
    return (this.snapshots.get(key) as TableSnapshot<T> | undefined) ?? (LOADING as TableSnapshot<T>)
  }

  /** Changes whenever any of the keys publishes: a primitive, so it is a valid external-store snapshot. */
  versionOf(keys: readonly string[]): number {
    let sum = 0
    for (const key of keys) sum += this.versions.get(key) ?? 0
    return sum
  }

  publish(key: string, snapshot: TableSnapshot<unknown>): void {
    const prev = this.snapshots.get(key)
    if (
      prev &&
      prev.items === snapshot.items &&
      prev.loading === snapshot.loading &&
      prev.error === snapshot.error &&
      prev.realtime === snapshot.realtime &&
      prev.reload === snapshot.reload &&
      prev.refresh === snapshot.refresh
    ) {
      return
    }
    this.snapshots.set(key, snapshot)
    this.bump(key)
  }

  /**
   * Per-entity "reload your on-demand reads" signal (DM notes, visibility): they are not realtime, so
   * a writer bumps it after a successful save and `useDmNotes` / `useVisibility` re-read.
   */
  detailVersion(table: string, id: number | null): number {
    return id === null ? 0 : (this.detailVersions.get(`${table}:${id}`) ?? 0)
  }

  invalidateDetail(table: string, id: number): void {
    const key = `${table}:${id}`
    this.detailVersions.set(key, (this.detailVersions.get(key) ?? 0) + 1)
    for (const l of [...this.listeners]) l()
  }

  /**
   * Re-lists every open table in place (no loading flash). Throttled: rows that became secreto/borrador
   * produce no realtime event for a player, so this is how a long-open tab drops them.
   */
  refreshAll(minIntervalMs = 0, now = Date.now()): boolean {
    if (now - this.lastRefreshAt < minIntervalMs) return false
    this.lastRefreshAt = now
    for (const spec of this.active) this.snapshots.get(spec.key)?.refresh()
    return true
  }

  clear(key: string): void {
    if (this.snapshots.delete(key)) this.bump(key)
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private bump(key: string) {
    this.versions.set(key, (this.versions.get(key) ?? 0) + 1)
    for (const l of [...this.listeners]) l()
  }

  private recomputeActive() {
    this.active = [...this.specs.values()]
    for (const l of [...this.listeners]) l()
  }
}

/**
 * Retains `specs` while `enabled` and returns their snapshots (same order). When disabled nothing
 * is subscribed and every snapshot is empty and idle. `specs` must be referentially stable.
 */
export function useStoreTables<T>(store: TableStore, specs: readonly TableSpec<T>[], enabled = true): TableSnapshot<T>[] {
  useEffect(() => {
    if (!enabled) return undefined
    const releases = specs.map((spec) => store.retain(spec as TableSpec))
    return () => releases.forEach((release) => release())
  }, [store, specs, enabled])
  const keys = useMemo(() => specs.map((s) => s.key), [specs])
  const version = useSyncExternalStore(store.subscribe, () => store.versionOf(keys))
  return useMemo(
    () => specs.map((spec) => (enabled ? store.get<T>(spec.key) : (DISABLED as TableSnapshot<T>))),
    // `version` is the change signal of the store, not a value read inside
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, specs, enabled, version],
  )
}
