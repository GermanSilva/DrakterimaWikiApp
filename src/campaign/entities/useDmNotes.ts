import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { DM_NOTES_TYPES, type DmNotesRow, type DmNotesType, type EntityTable } from '../../data'
import { useCampaign } from '../CampaignContext'
import { useCampaignServices } from './campaignServicesContext'
import { useLoad, type LoadState } from './useLoad'

/** Small stable number from a string, so a version (e.g. `updated_at`) can ride the numeric reload `signal`. */
const hashOf = (value: string): number => {
  let h = 0
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0
  return h
}

export const isDmNotesType = (t: EntityTable): t is DmNotesType => (DM_NOTES_TYPES as readonly string[]).includes(t)

export interface DmNotesFieldsState {
  notas: string
  secreto: string
  ganchos: string
}

export interface DmNotesState {
  /** `idle` for players and for tables without DM notes: no request is made. */
  status: LoadState<unknown>['status']
  /** The stored row, or null when the DM never wrote any note for this entity. */
  row: DmNotesRow | null
  /** The three fields with '' defaults, ready to seed a form. */
  fields: DmNotesFieldsState
  error: Error | null
  refresh: () => void
}

const EMPTY: DmNotesFieldsState = { notas: '', secreto: '', ganchos: '' }

/**
 * DM-private fields (`notas`, `secreto`, `ganchos`) of one entity, fetched on demand (the table is not
 * published to Realtime). DM only: for a player it makes no request at all (RLS would return nothing
 * anyway). `version` (e.g. the entity's `updated_at`) triggers a re-read when it changes.
 */
export function useDmNotes(table: EntityTable, id: number | null, version?: string | null): DmNotesState {
  const { isDM } = useCampaign()
  const { layer, store } = useCampaignServices()
  const signal = useSyncExternalStore(store.subscribe, () => store.detailVersion(table, id))
  const supported = isDM && id !== null && isDmNotesType(table)
  const load = useMemo(
    () => (supported ? () => layer.dmNotes.get(table as DmNotesType, id as number) : null),
    [supported, layer, table, id],
  )
  // The version is a reload SIGNAL, not part of the key: a new version re-reads while the previous
  // notes stay on screen (a key change would blank them and make the DM blocks flicker).
  const state = useLoad<DmNotesRow | null>(load, `${table}:${id}`, signal + hashOf(version ?? ''))
  const { refresh } = state
  const row = state.data
  return {
    status: state.status,
    row,
    fields: useMemo(() => (row ? { notas: row.notas, secreto: row.secreto, ganchos: row.ganchos } : EMPTY), [row]),
    error: state.error,
    refresh: useCallback(() => refresh(), [refresh]),
  }
}
