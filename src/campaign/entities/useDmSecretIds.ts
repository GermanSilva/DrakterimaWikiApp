import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { DmNotesRow, DmNotesType, EntityTable } from '../../data'
import { useCampaign } from '../CampaignContext'
import { useCampaignServices } from './campaignServicesContext'
import { isDmNotesType } from './useDmNotes'
import { useLoad, type LoadState } from './useLoad'

const NONE: ReadonlySet<number> = new Set()

/** Quiet time before a burst of realtime changes triggers ONE re-read of the notes. */
export const SECRET_IDS_REFRESH_DELAY_MS = 600

export interface DmSecretIds {
  /** `idle` for players and for tables without DM notes: no request is made. */
  status: LoadState<unknown>['status']
  ids: ReadonlySet<number>
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
 * Ids of the entities of one table that carry a non-empty DM `secreto`, for list badges (the lock of a
 * PNJ card). DM only: a player never makes the request (RLS would return nothing anyway). Only the
 * notes of this entity type are read. The notes table is not realtime, so the read follows the entity
 * detail versions (a saved entity bumps its version, also when it first appears in the list); that signal is debounced so a realtime burst (an import, a
 * flurry of edits) costs one re-read, not one per event.
 */
export function useDmSecretIds(table: EntityTable, ids: readonly number[]): DmSecretIds {
  const { isDM } = useCampaign()
  const { layer, campaignId, store } = useCampaignServices()
  const rawSignal = useSyncExternalStore(store.subscribe, () => ids.reduce((n, id) => n + store.detailVersion(table, id), 0))
  const signal = useSettled(rawSignal, SECRET_IDS_REFRESH_DELAY_MS)
  const load = useMemo(
    () => (isDM && isDmNotesType(table) ? () => layer.dmNotes.list(campaignId, table as DmNotesType) : null),
    [isDM, table, layer, campaignId],
  )
  const state = useLoad<DmNotesRow[]>(load, `${table}:${campaignId}`, signal)
  const secretIds = useMemo(
    () => (state.data ? new Set(state.data.filter((n) => n.entity_type === table && n.secreto.trim() !== '').map((n) => n.entity_id)) : NONE),
    [state.data, table],
  )
  return { status: state.status, ids: secretIds, refresh: state.refresh }
}
