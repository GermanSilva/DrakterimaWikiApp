import { useEffect, useMemo } from 'react'
import type { PlayerAvailability } from '../../data'
import { useCampaignServices } from './campaignServicesContext'
import { useStoreTables, type TableSnapshot } from './tableStore'

export interface UsePlayerAvailabilityOptions {
  /** False = do not subscribe. */
  enabled?: boolean
}

/** While a calendar stays open and focused, the list is reconciled at most this often. */
export const AVAILABILITY_RECONCILE_INTERVAL_MS = 60_000

/**
 * Realtime list of the player availability relevant to this campaign (id order): general rows
 * (`campaign_id` null) and rows pinned to this campaign. RLS decides whose rows arrive (own, campaign
 * mates'); a calendar that only shows this campaign's members must still filter by `user_id`. All
 * callers share ONE channel.
 *
 * Realtime cannot tell a member of campaign A (not of B) that a row was re-pinned A -> B: the UPDATE
 * is simply not delivered, so the stale copy would stay forever. It is reconciled by re-listing in
 * place (no loading flash): on SUBSCRIBED (every reconnect), on focus / visibility (TableStoreHost,
 * throttled), after local writes (`usePlayerAvailabilityActions`) and on a slow timer while visible.
 */
export function usePlayerAvailability(options: UsePlayerAvailabilityOptions = {}): TableSnapshot<PlayerAvailability> {
  const { store } = useCampaignServices()
  const specs = useMemo(() => [store.playerAvailabilitySpec()], [store])
  const enabled = options.enabled ?? true
  const snapshot = useStoreTables(store, specs, enabled)[0]

  useEffect(() => {
    if (!enabled) return undefined
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') store.get<PlayerAvailability>(specs[0].key).refresh()
    }, AVAILABILITY_RECONCILE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [store, specs, enabled])

  return snapshot
}
