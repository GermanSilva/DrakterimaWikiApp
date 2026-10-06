import { useCallback, useEffect, useState } from 'react'
import { applyDelete, applyUpsert, subscribeToTable, type RealtimeStatus, type TableSource } from './realtime'
import { getSupabase } from './supabaseClient'
import type { Db } from './types'

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
 * arrive while a load is in flight are buffered and replayed over the loaded list. UPDATE rows
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

  useEffect(() => {
    if (!campaignId) return undefined
    const db = client ?? getSupabase()
    let active = true
    let loadSeq = 0
    let loading = false
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
      if (loading) buffer.push(change)
      else patch((s) => ({ ...s, items: order(apply(s.items, change)) }))
    }

    // Every load restarts the buffer; a result is used only if it is still the latest load.
    const load = () => {
      const seq = ++loadSeq
      loading = true
      buffer = []
      source
        .list(campaignId)
        .then((rows) => {
          if (!active || seq !== loadSeq) return
          loading = false
          const merged = buffer.splice(0).reduce(apply, rows)
          patch((s) => ({ ...s, items: order(merged), loading: false, error: null }))
        })
        .catch((e: unknown) => {
          if (!active || seq !== loadSeq) return
          loading = false
          const replay = buffer.splice(0)
          patch((s) => ({
            ...s,
            items: replay.length ? order(replay.reduce(apply, s.items)) : s.items,
            loading: false,
            error: e instanceof Error ? e : new Error(String(e)),
          }))
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

    return () => {
      active = false
      unsubscribe()
    }
  }, [source, campaignId, client, sort, reloadToken])

  const reload = useCallback(() => setReloadToken((n) => n + 1), [])

  if (!campaignId) return { items: [], loading: false, error: null, realtime: 'connecting', reload }
  if (!snapshot || snapshot.campaignId !== campaignId) {
    return { items: [], loading: true, error: null, realtime: 'connecting', reload }
  }
  return { items: snapshot.items, loading: snapshot.loading, error: snapshot.error, realtime: snapshot.realtime, reload }
}
