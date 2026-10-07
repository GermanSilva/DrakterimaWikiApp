import { useMemo } from 'react'
import { WIKI_INDEX_TABLES, type WikiIndexItem, type WikiIndexTable } from '../../data'
import { useCampaignServices } from './campaignServicesContext'
import { useStoreTables } from './tableStore'

export interface WikiIndex {
  byTable: Record<WikiIndexTable, WikiIndexItem[]>
  /** True until every table delivered its first list. */
  loading: boolean
  error: Error | null
  /** Per table: `loading` until its first list, `error` when it failed (its links must not read "not found"). */
  status: Record<WikiIndexTable, 'loading' | 'ready' | 'error'>
}

/**
 * Campaign-wide index of everything a wiki link can point at: id, title, image and estado per
 * table, kept fresh by Realtime (one channel per table, shared by every consumer). It carries no
 * long text and no DM-private field, and RLS already limits it to what the viewer may see.
 * Consumed through the hub WikiPort; pages normally never call it directly.
 */
export function useWikiIndex(): WikiIndex {
  const { store } = useCampaignServices()
  const snapshots = useStoreTables(store, store.allIndexSpecs)
  return useMemo(() => {
    const byTable = Object.fromEntries(WIKI_INDEX_TABLES.map((t, i) => [t, snapshots[i].items])) as WikiIndex['byTable']
    const status = Object.fromEntries(
      WIKI_INDEX_TABLES.map((t, i) => [t, snapshots[i].error ? 'error' : snapshots[i].loading ? 'loading' : 'ready']),
    ) as WikiIndex['status']
    return {
      byTable,
      status,
      loading: snapshots.some((s) => s.loading),
      error: snapshots.find((s) => s.error)?.error ?? null,
    }
  }, [snapshots])
}
