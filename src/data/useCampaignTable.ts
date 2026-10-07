import { useCallback, useEffect, useRef, useState } from 'react'
import { applyDelete, applyUpsert, subscribeToTable, type RealtimeStatus, type TableSource } from './realtime'
import { getSupabase } from './supabaseClient'
import type { Db } from './types'

/** Changes buffered while loads are in flight; beyond this the hook restarts from a fresh list. */
const MAX_BUFFERED_CHANGES = 5000

export interface UseCampaignTableOptions<T> {
  /** Defaults to the shared client from getSupabase(). Keep it stable between renders. */
  client?: Db
  /** Applied to the list after every change. Keep it stable between renders. */
  sort?: (a: T, b: T) => number
}

export interface CampaignTableState<T> {
  items: T[]
  loading: boolean
  error: Error | null
  /** 'live' once subscribed; 'error' after CHANNEL_ERROR / TIMED_OUT / CLOSED (data may be stale). */
  realtime: RealtimeStatus
  reload: () => void
  /**
   * Re-lists in place WITHOUT going back to loading (no flash): drops rows that became invisible and
   * picks up changes missed while hidden. A no-op before the subscription exists.
   */
  refresh: () => void
}

interface Snapshot<T> {
  campaignId: string
  items: T[]
  loading: boolean
  error: Error | null
  realtime: RealtimeStatus
}

type Change<T> = { type: 'upsert'; item: T; merge: boolean } | { type: 'delete'; key: string }

/**
 * Loads a campaign's rows and keeps them in sync through Supabase Realtime.
 *
 * `source` and `options.client`/`options.sort` must be referentially stable (module constants or
 * memoized), otherwise the effect resubscribes on every render. The subscription is opened
 * together with an initial load, and the list is loaded AGAIN on every SUBSCRIBED status
 * (initial join and each reconnect) so changes made between the snapshot and the join, or during
 * an outage, are not lost; this also drops rows that became invisible meanwhile. Changes that
 * arrive while a load is in flight stay in one buffer per subscription and are replayed over
 * each load's rows (the newest completed load wins; a stale one is ignored). reload() resets
 * the status to loading / 'connecting'. UPDATE rows
 * are merged onto the previous copy (they may omit unchanged large columns). It resubscribes when
 * `campaignId` changes and removes the channel on unmount.
 * See `subscribeToTable` for the Realtime caveats (privileged columns, DELETE payloads, hidden rows).
 */
export function useCampaignTable<T>(
  source: TableSource<T>,
  campaignId: string | null | undefined,
  options: UseCampaignTableOptions<T> = {},
): CampaignTableState<T> {
  const { client, sort } = options
  const [snapshot, setSnapshot] = useState<Snapshot<T> | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const refreshRef = useRef<() => void>(() => undefined)

  useEffect(() => {
    if (!campaignId) return undefined
    const db = client ?? getSupabase()
    let active = true
    let seq = 0 // id of the latest load started
    // Stale-load watermark: a load result is accepted only if its id is > applied. It is the id of
    // the newest load whose result is on screen, or of the newest load invalidated by a buffer overflow.
    let applied = 0
    let inFlight = 0
    let hasData = false
    // ONE buffer per subscription: every change received while at least one load is in flight.
    // A load replays the part that arrived after it started (buffer.slice(startIndex)) on top of
    // its rows; the buffer is dropped only when no load is in flight.
    let buffer: Change<T>[] = []

    const patch = (fn: (s: Snapshot<T>) => Snapshot<T>) =>
      setSnapshot((prev) =>
        fn(
          prev && prev.campaignId === campaignId
            ? prev
            : { campaignId, items: [], loading: true, error: null, realtime: 'connecting' },
        ),
      )
    const order = (items: T[]) => (sort ? [...items].sort(sort) : items)
    const apply = (items: T[], change: Change<T>) =>
      change.type === 'upsert'
        ? applyUpsert(items, change.item, source, change.merge)
        : applyDelete(items, change.key, source)

    const onChange = (change: Change<T>) => {
      if (!active) return
      if (inFlight > 0) {
        buffer.push(change)
        if (buffer.length > MAX_BUFFERED_CHANGES) {
          // Loads are hanging or overlapping endlessly: invalidate every in-flight load (their
          // results become stale) and start over from a fresh list instead of growing forever.
          buffer = []
          applied = seq
          load()
          return
        }
      }
      // Before the first successful load there is no list to apply to: the buffer is replayed later.
      // A merging UPDATE without a loaded copy would insert a partial row (payloads may omit large
      // unchanged columns), so it is skipped and the next re-list brings the full row.
      const partialWithoutBase = !hasData && change.type === 'upsert' && change.merge
      if ((hasData || inFlight === 0) && !partialWithoutBase) {
        patch((s) => ({ ...s, items: order(apply(s.items, change)) }))
      }
    }

    const load = () => {
      const mine = ++seq
      const start = buffer.length
      inFlight++
      const settle = () => {
        inFlight--
        if (inFlight === 0) buffer = []
      }
      source
        .list(campaignId)
        .then((rows) => {
          if (!active) return
          if (mine > applied) {
            applied = mine
            hasData = true
            const merged = buffer.slice(start).reduce(apply, rows)
            patch((s) => ({ ...s, items: order(merged), loading: false, error: null }))
          } // else: a newer load is already on screen, this result is stale
          settle()
        })
        .catch((e: unknown) => {
          if (!active) return
          if (mine > applied) {
            const error = e instanceof Error ? e : new Error(String(e))
            // nothing on screen yet: show what arrived, except merging UPDATEs (possibly partial rows)
            const replay = hasData
              ? []
              : buffer.slice(start).filter((c) => !(c.type === 'upsert' && c.merge))
            patch((s) => ({ ...s, items: order(replay.reduce(apply, s.items)), loading: false, error }))
          }
          settle()
        })
    }

    const unsubscribe = subscribeToTable(db, source, campaignId, {
      onUpsert: (item, event) => onChange({ type: 'upsert', item, merge: event === 'UPDATE' }),
      onDelete: (key) => onChange({ type: 'delete', key }),
      onStatus: (realtime) => {
        if (!active) return
        patch((s) => ({ ...s, realtime }))
        if (realtime === 'live') load() // initial join and every reconnect
      },
    })
    load()
    refreshRef.current = load

    return () => {
      active = false
      refreshRef.current = () => undefined
      unsubscribe()
    }
  }, [source, campaignId, client, sort, reloadToken])

  // The new subscription starts from 'connecting' / loading until its list and SUBSCRIBED arrive.
  const reload = useCallback(() => {
    setSnapshot((prev) => (prev ? { ...prev, loading: true, realtime: 'connecting' } : prev))
    setReloadToken((n) => n + 1)
  }, [])

  const refresh = useCallback(() => refreshRef.current(), [])
  if (!campaignId) return { items: [], loading: false, error: null, realtime: 'connecting', reload, refresh }
  if (!snapshot || snapshot.campaignId !== campaignId) {
    return { items: [], loading: true, error: null, realtime: 'connecting', reload, refresh }
  }
  return { items: snapshot.items, loading: snapshot.loading, error: snapshot.error, realtime: snapshot.realtime, reload, refresh }
}
