import { useMemo } from 'react'
import type { EntityTable, FlatEntity } from '../../data'
import { useCampaignServices } from './campaignServicesContext'
import { useStoreTables, type TableSnapshot } from './tableStore'

export interface UseEntitiesOptions {
  /** False = do not subscribe (e.g. a form that only needs the list for some entity types). */
  enabled?: boolean
}

/**
 * Realtime list of one entity table of the current campaign, sorted per table (sesiones by timeline
 * position, the rest by id). All callers of the same table share ONE realtime channel.
 * RLS decides what each viewer receives; nothing is filtered here.
 */
export function useEntities(table: EntityTable, options: UseEntitiesOptions = {}): TableSnapshot<FlatEntity> {
  const { store } = useCampaignServices()
  const specs = useMemo(() => [store.entitySpec(table)], [store, table])
  return useStoreTables(store, specs, options.enabled ?? true)[0]
}
