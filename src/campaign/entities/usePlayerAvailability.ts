import { useMemo } from 'react'
import type { PlayerAvailability } from '../../data'
import { useCampaignServices } from './campaignServicesContext'
import { useStoreTables, type TableSnapshot } from './tableStore'

export interface UsePlayerAvailabilityOptions {
  /** False = do not subscribe. */
  enabled?: boolean
}

/**
 * Realtime list of the player availability relevant to this campaign (id order): general rows
 * (`campaign_id` null) and rows pinned to this campaign. RLS decides whose rows arrive (own, campaign
 * mates'); a calendar that only shows this campaign's members must still filter by `user_id`. All
 * callers share ONE channel.
 */
export function usePlayerAvailability(options: UsePlayerAvailabilityOptions = {}): TableSnapshot<PlayerAvailability> {
  const { store } = useCampaignServices()
  const specs = useMemo(() => [store.playerAvailabilitySpec()], [store])
  return useStoreTables(store, specs, options.enabled ?? true)[0]
}
