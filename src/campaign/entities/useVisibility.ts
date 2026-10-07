import { useMemo, useSyncExternalStore } from 'react'
import type { EntityTable } from '../../data'
import { useCampaign } from '../CampaignContext'
import { useCampaignServices } from './campaignServicesContext'
import { useLoad, type LoadState } from './useLoad'

export interface VisibilityState {
  /** `idle` for players (or no ids): no request is made. */
  status: LoadState<unknown>['status']
  /** `{ [entityId]: characterIds }` of the entities that exist (RPC get_entity_visibility). */
  visibility: Record<number, number[]>
  error: Error | null
  refresh: () => void
}

const NONE: Record<number, number[]> = {}

/**
 * Which characters may see each given `secreto` entity. `visible_to` is not readable through table
 * access, so this goes through the DM-only RPC; a player never calls it.
 */
export function useVisibility(table: EntityTable, ids: readonly number[]): VisibilityState {
  const { isDM } = useCampaign()
  const { layer, store } = useCampaignServices()
  const signal = useSyncExternalStore(store.subscribe, () => ids.reduce((n, id) => n + store.detailVersion(table, id), 0))
  const idsKey = ids.join(',')
  const hasIds = ids.length > 0
  const load = useMemo(
    () => (isDM && hasIds ? () => layer.visibility.getVisibility(table, idsKey.split(',').map(Number)) : null),
    [isDM, hasIds, layer, table, idsKey],
  )
  const state = useLoad<Record<number, number[]>>(load, `${table}:${idsKey}`, signal)
  return { status: state.status, visibility: state.data ?? NONE, error: state.error, refresh: state.refresh }
}
