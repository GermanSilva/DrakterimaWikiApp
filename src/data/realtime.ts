import { createDisponibilidadRepository, type Disponibilidad } from './disponibilidadRepository'
import type { EntityRepository } from './entityRepository'
import { fromRow, type EntityRow } from './mappers'
import type { Db, FlatEntity } from './types'

/**
 * Describes a table the realtime hook can mirror: how to load the list, how to turn a Realtime
 * row into an item, and how to identify rows (INSERT/UPDATE rows are full, DELETE rows carry only
 * the primary key).
 */
export interface TableSource<T> {
  table: string
  list(campaignId: string): Promise<T[]>
  fromRow(row: Record<string, unknown>): T
  keyOfItem(item: T): string
  keyOfRow(row: Record<string, unknown>): string
}

export type RealtimeStatus = 'connecting' | 'live' | 'error'

export interface TableHandlers<T> {
  /** `event` UPDATE rows may be partial (unchanged large columns omitted): merge, don't replace. */
  onUpsert(item: T, event: 'INSERT' | 'UPDATE'): void
  onDelete(key: string): void
  onStatus?(status: RealtimeStatus): void
}

export function entitySource(repo: EntityRepository): TableSource<FlatEntity> {
  return {
    table: repo.table,
    list: (campaignId) => repo.list(campaignId),
    fromRow: (row) => fromRow(repo.table, row as EntityRow),
    keyOfItem: (item) => String(item.id),
    keyOfRow: (row) => String(row.id),
  }
}

export function disponibilidadSource(client: Db): TableSource<Disponibilidad> {
  const repo = createDisponibilidadRepository(client)
  return {
    table: 'disponibilidad',
    list: (campaignId) => repo.list(campaignId),
    fromRow: (row) => row as unknown as Disponibilidad,
    keyOfItem: (item) => String(item.id),
    keyOfRow: (row) => String(row.id),
  }
}

let channelCounter = 0

/**
 * Subscribes to INSERT/UPDATE of one campaign's rows (server-side filter `campaign_id=eq.<id>`)
 * and to DELETE. Returns an unsubscribe function that removes the channel.
 *
 * Realtime caveats (all verified/decided in the H3/H3b migrations):
 *  - Payloads never include `visible_to`: column privileges are honoured by Realtime's RLS check.
 *  - INSERT/UPDATE are RLS-filtered, so a player only receives rows they may see. A row that
 *    becomes invisible to them (estado -> borrador) produces NO event: the stale copy stays in
 *    local state until the next re-list (the hook re-lists on every SUBSCRIBED and on reload()).
 *  - DELETE payloads carry only the primary key, are not RLS-filtered and cannot be matched by a
 *    `campaign_id` filter (the old record lacks it). The DELETE listener is therefore unfiltered
 *    and handlers must ignore keys that are not in local state (ids only, no content leaks).
 *  - Very large rows may arrive with truncated fields; the mapper tolerates missing columns.
 */
export function subscribeToTable<T>(
  client: Db,
  source: TableSource<T>,
  campaignId: string,
  handlers: TableHandlers<T>,
): () => void {
  const filter = `campaign_id=eq.${campaignId}`
  const base = { schema: 'public', table: source.table } as const
  const upsert = (event: 'INSERT' | 'UPDATE') => (payload: { new: Record<string, unknown> }) =>
    handlers.onUpsert(source.fromRow(payload.new), event)

  const channel = client
    .channel(`campaign:${source.table}:${campaignId}:${++channelCounter}`)
    .on('postgres_changes', { ...base, event: 'INSERT', filter }, upsert('INSERT'))
    .on('postgres_changes', { ...base, event: 'UPDATE', filter }, upsert('UPDATE'))
    .on('postgres_changes', { ...base, event: 'DELETE' }, (payload: { old: Record<string, unknown> }) =>
      handlers.onDelete(source.keyOfRow(payload.old)),
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') handlers.onStatus?.('live')
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') handlers.onStatus?.('error')
    })

  return () => {
    void client.removeChannel(channel)
  }
}

/** Pure list update used by the hook: replace/merge-or-append on upsert, drop on delete (if present). */
export function applyUpsert<T>(items: T[], item: T, source: TableSource<T>, merge = false): T[] {
  const key = source.keyOfItem(item)
  const index = items.findIndex((x) => source.keyOfItem(x) === key)
  if (index === -1) return [...items, item]
  const next = items.slice()
  // merge: an UPDATE payload may omit unchanged large columns, which must keep their old value
  next[index] = merge ? ({ ...items[index], ...item } as T) : item
  return next
}

export function applyDelete<T>(items: T[], key: string, source: TableSource<T>): T[] {
  return items.some((x) => source.keyOfItem(x) === key) ? items.filter((x) => source.keyOfItem(x) !== key) : items
}
