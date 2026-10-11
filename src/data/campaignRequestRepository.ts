import { CAMPAIGN_REQUEST_COLUMNS, CAMPAIGN_REQUEST_WRITE_COLUMNS, join } from './columns'
import { unwrap, unwrapWrite } from './errors'
import { fromTable } from './loose'
import { pagedList } from './pagedList'
import type { Profile } from './profileRepository'
import type { Db } from './types'

export type CampaignRequestStatus = 'pending' | 'approved' | 'rejected'

export interface CampaignRequest {
  id: number
  requester_id: string
  name: string
  slug_wanted: string | null
  message: string | null
  status: CampaignRequestStatus
  decision_note: string | null
  decided_at: string | null
  campaign_id: string | null
  created_at: string
  updated_at: string
}

/** A request as the hub owner's inbox sees it: with who asked. */
export type CampaignRequestWithRequester = CampaignRequest & {
  requester: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> | null
}

export interface NewCampaignRequest {
  name: string
  slug_wanted?: string | null
  message?: string | null
}

const SELECT = join(CAMPAIGN_REQUEST_COLUMNS)
const PROFILE_EMBED = 'id, display_name, avatar_url'

/**
 * Hub owner / campaign requests (H15). The database enforces every rule; `isHubOwner` is only a hint for the UI.
 * Errors keep their reason (see errors.ts): hub_owner_only, too_many_pending_requests, too_many_requests_recently, request_not_pending,
 * request_not_found, slug_taken, invalid_slug, invalid_name, reserved_slug, campaign_limit_reached.
 */
export function createCampaignRequestRepository(client: Db) {
  return {
    /** RPC: whether the signed-in user is a hub owner. */
    async isHubOwner(): Promise<boolean> {
      return unwrap(await client.rpc('is_hub_owner')) === true
    },

    /** The caller's own requests, newest first (RLS: a requester only ever sees their own; a hub owner sees all, hence the filter). */
    async listMyCampaignRequests(userId: string): Promise<CampaignRequest[]> {
      return pagedList<CampaignRequest>(
        () =>
          fromTable(client, 'campaign_requests')
            .select(SELECT)
            .eq('requester_id', userId)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false }),
        'campaign_requests',
      )
    },

    /** Always pending on creation (status is not insertable). Errors: too_many_pending_requests, too_many_requests_recently, reserved_slug. */
    async createCampaignRequest(request: NewCampaignRequest): Promise<CampaignRequest> {
      const payload = Object.fromEntries(
        CAMPAIGN_REQUEST_WRITE_COLUMNS.filter((k) => request[k] !== undefined).map((k) => [k, request[k]]),
      )
      return unwrapWrite<CampaignRequest>(await fromTable(client, 'campaign_requests').insert(payload).select(SELECT).single())
    },

    /** The requester withdraws their own PENDING request. Resolves false when there was nothing to cancel (already decided or gone). */
    async cancelCampaignRequest(requestId: number): Promise<boolean> {
      const rows = unwrap<unknown[]>(await fromTable(client, 'campaign_requests').delete().eq('id', requestId).select('id'))
      return rows.length > 0
    },

    /** Hub owner only (RLS shows everything to them): every request, pending first, newest first. */
    async listAllCampaignRequests(): Promise<CampaignRequestWithRequester[]> {
      const rows = await pagedList<CampaignRequestWithRequester>(
        () =>
          fromTable(client, 'campaign_requests')
            .select(`${SELECT}, requester:profiles!campaign_requests_requester_id_fkey(${PROFILE_EMBED})`)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false }),
        'campaign_requests',
      )
      const rank = (r: CampaignRequest) => (r.status === 'pending' ? 0 : 1)
      return [...rows].sort((a, b) => rank(a) - rank(b))
    },

    /** RPC, hub owner only. Creates the campaign with the REQUESTER as DM and resolves with its slug. */
    async approveCampaignRequest(requestId: number, overrides: { slug?: string; name?: string } = {}): Promise<string> {
      const args: { p_request_id: number; p_slug?: string; p_name?: string } = { p_request_id: requestId }
      if (overrides.slug !== undefined) args.p_slug = overrides.slug
      if (overrides.name !== undefined) args.p_name = overrides.name
      return unwrap(await client.rpc('approve_campaign_request', args)) as unknown as string
    },

    /** RPC, hub owner only. */
    async rejectCampaignRequest(requestId: number, note?: string): Promise<void> {
      const args: { p_request_id: number; p_note?: string } = { p_request_id: requestId }
      if (note !== undefined) args.p_note = note
      unwrap(await client.rpc('reject_campaign_request', args))
    },
  }
}

export type CampaignRequestRepository = ReturnType<typeof createCampaignRequestRepository>
