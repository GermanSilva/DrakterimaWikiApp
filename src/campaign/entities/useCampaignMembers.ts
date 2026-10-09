import { useCampaignServices } from './campaignServicesContext'
import { useLoad, type LoadState } from './useLoad'
import type { Member } from '../../data'

/**
 * The campaign's members (DM included) in a stable order (join date, then user id). Read once per
 * mount: membership changes rarely and the calendar only needs it to decide whose rows to draw.
 */
export function useCampaignMembers(): LoadState<Member[]> & { refresh: () => void } {
  const { layer, campaignId } = useCampaignServices()
  return useLoad(() => layer.campaigns.listMembers(campaignId), `members:${campaignId}`)
}
