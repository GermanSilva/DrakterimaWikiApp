import { CAMPAIGN_PRESENCE_COLUMNS, join } from './columns'
import { unwrap } from './errors'
import { fromTable } from './loose'
import { pagedList } from './pagedList'
import type { Db } from './types'

export interface CampaignPresence {
  campaign_id: string
  user_id: string
  /** ISO timestamp of the member's last connection to the campaign. */
  last_seen_at: string
}

const SELECT = join(CAMPAIGN_PRESENCE_COLUMNS)

/**
 * "Last connection" of campaign members. Members record their own presence through an RPC (the
 * server throttles it and only ever writes the caller's row); only the campaign DM can read rows.
 */
export function createPresenceRepository(client: Db) {
  return {
    /** Records that the caller opened the campaign. A member only; `not_a_member` (42501) otherwise. */
    async touch(campaignId: string): Promise<void> {
      unwrap(await client.rpc('touch_campaign_presence', { p_campaign_id: campaignId }))
    },

    /** DM only (RLS): a player gets an empty list, never someone else's last connection. */
    async list(campaignId: string): Promise<CampaignPresence[]> {
      return pagedList<CampaignPresence>(
        () =>
          fromTable(client, 'campaign_presence')
            .select(SELECT)
            .eq('campaign_id', campaignId)
            .order('user_id', { ascending: true }),
        'campaign_presence',
      )
    },
  }
}

export type PresenceRepository = ReturnType<typeof createPresenceRepository>
