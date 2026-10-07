import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { DmNotesRow, DmNotesType, EntityTable } from '../../data'
import { useCampaign } from '../CampaignContext'
import { useCampaignServices } from './campaignServicesContext'
import { isDmNotesType } from './useDmNotes'
import { useLoad, type LoadState } from './useLoad'

const NONE: ReadonlySet<number> = new Set()
const NO_STAMPS: ReadonlyMap<number, string> = new Map()

/** Quiet time before a burst of realtime changes triggers ONE re-read of the notes. */
export const SECRET_IDS_REFRESH_DELAY_MS = 600

export interface DmSecretIds {
  /** `idle` for players and for tables without DM notes: no request is made. */
  status: LoadState<unknown>['status']
  ids: ReadonlySet<number>
  /** `updated_at` of the DM-notes row of each id in `ids` (the DM-notes unread dot of a character). */
  stamps: ReadonlyMap<number, string>
  refresh: () => void
}

/** The value, but only after it stopped changing for `delayMs` (the first value is immediate). */
function useSettled<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return settled
}

/**
 * Ids of the entities of one table that carry a non-empty DM note (`secreto` by default, or `notas` for the
 * characters), for list badges (the lock of a PNJ / PJ card). DM only: a player never makes the request (RLS would return nothing anyway). Only the
 * notes of this entity type are read. The notes table is not realtime, so the read follows the entity
 * detail versions (a saved entity bumps its version, also when it first appears in the list); that signal is debounced so a realtime burst (an import, a
 * flurry of edits) costs one re-read, not one per event.
 */
export function useDmSecretIds(table: EntityTable, ids: readonly number[], field: 'secreto' | 'notas' = 'secreto'): DmSecretIds {
  const { isDM } = useCampaign()
  const { layer, campaignId, store } = useCampaignServices()
  const rawSignal = useSyncExternalStore(store.subscribe, () => ids.reduce((n, id) => n + store.detailVersion(table, id), 0))
  const signal = useSettled(rawSignal, SECRET_IDS_REFRESH_DELAY_MS)
  const load = useMemo(
    () => (isDM && isDmNotesType(table) ? () => layer.dmNotes.list(campaignId, table as DmNotesType) : null),
    [isDM, table, layer, campaignId],
  )
  const state = useLoad<DmNotesRow[]>(load, `${table}:${campaignId}`, signal)
  const withNote = useMemo(
    () => (state.data ? state.data.filter((n) => n.entity_type === table && n[field].trim() !== '') : null),
    [state.data, table, field],
  )
  const secretIds = useMemo(() => (withNote ? new Set(withNote.map((n) => n.entity_id)) : NONE), [withNote])
  const stamps = useMemo(() => (withNote ? new Map(withNote.map((n) => [n.entity_id, n.updated_at])) : NO_STAMPS), [withNote])
  return { status: state.status, ids: secretIds, stamps, refresh: state.refresh }
}
