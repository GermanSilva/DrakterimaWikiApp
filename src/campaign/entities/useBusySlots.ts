import { useCampaignServices } from './campaignServicesContext'
import { useLoad, type LoadState } from './useLoad'
import type { BusySlot } from '../../data'

/**
 * Slots during which a member of this campaign is booked by a session of ANOTHER campaign. The other
 * campaign is not identifiable (by design). Not realtime: `refresh()` re-reads in place.
 */
export function useBusySlots(): LoadState<BusySlot[]> & { refresh: () => void } {
  const { layer, campaignId } = useCampaignServices()
  return useLoad(() => layer.playerAvailability.busySlots(campaignId), `busy:${campaignId}`)
}
