import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { useCampaignTable } from '../../data'
import { REFRESH_MIN_INTERVAL_MS, type TableSpec, type TableStore } from './tableStore'

/** Headless: runs the single realtime subscription of one key and publishes it to the store. */
function TableLoader({ store, spec }: { store: TableStore; spec: TableSpec }) {
  const state = useCampaignTable(spec.source, store.campaignId, { client: store.layer.client, sort: spec.sort })
  useEffect(() => {
    store.publish(spec.key, state)
  })
  useEffect(() => () => store.clear(spec.key), [store, spec.key])
  return null
}

/** Mounts the loaders of the retained tables next to the children. */
export function TableStoreHost({ store, children }: { store: TableStore; children: ReactNode }) {
  const active = useSyncExternalStore(store.subscribe, store.getActive)
  useEffect(() => {
    // Back to the tab / window: re-list (at most every 30 s).
    const refresh = () => {
      if (document.visibilityState === 'visible') store.refreshAll(REFRESH_MIN_INTERVAL_MS)
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [store])
  return (
    <>
      {active.map((spec) => (
        <TableLoader key={spec.key} store={store} spec={spec} />
      ))}
      {children}
    </>
  )
}
