import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { DM_NOTES_TYPES, type DmNotesRow, type DmNotesType, type EntityTable } from '../../data'
import { useCampaign } from '../CampaignContext'
import { useCampaignServices } from './campaignServicesContext'
import { useLoad, type LoadState } from './useLoad'

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
  const state = useLoad<DmNotesRow | null>(load, `${table}:${id}:${version ?? ''}`, signal)
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
