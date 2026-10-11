import {
  createDataLayer,
  type AcceptInviteResult,
  type Campaign,
  type CampaignRequest,
  type CampaignRequestWithRequester,
  type CampaignWithRole,
  type DataLayer,
  type Db,
  type InvitePreview,
  type NewCampaignRequest,
  type Profile,
} from '../data'

/**
 * The slice of the data layer the hub shell needs. Narrow on purpose: the shell never touches the
 * client directly, and tests inject a plain fake of this interface.
 */
export interface HubData {
  /**
   * The full data layer, for the campaign sections (entity hooks, wiki index, read state, notes).
   * The hub shell itself only uses the narrow methods below.
   */
  readonly layer: DataLayer
  listMyCampaigns(userId: string): Promise<CampaignWithRole[]>
  /** Hub owners only (the database refuses everybody else with reason hub_owner_only). */
  createCampaign(slug: string, name: string): Promise<Campaign>
  /** UI hint only: the database enforces the privilege. */
  isHubOwner(): Promise<boolean>
  listMyCampaignRequests(userId: string): Promise<CampaignRequest[]>
  createCampaignRequest(request: NewCampaignRequest): Promise<CampaignRequest>
  /** Resolves false when the request was no longer pending (nothing cancelled). */
  cancelCampaignRequest(requestId: number): Promise<boolean>
  /** Hub owners: the inbox (all requests, pending first). */
  listAllCampaignRequests(): Promise<CampaignRequestWithRequester[]>
  /** Resolves with the new campaign slug; the requester becomes its DM. */
  approveCampaignRequest(requestId: number, overrides?: { slug?: string; name?: string }): Promise<string>
  rejectCampaignRequest(requestId: number, note?: string): Promise<void>
  /** Read-only: what an invite code leads to. Never consumes the invite. */
  previewInvite(code: string): Promise<InvitePreview>
  acceptInvite(code: string): Promise<AcceptInviteResult>
  /** Ids of the characters (pjs) the user owns in the campaign. */
  listMyCharacterIds(campaignId: string, userId: string): Promise<number[]>
  updateProfile(userId: string, patch: { display_name?: string; avatar_url?: string | null }): Promise<Profile>
}

export function createHubData(client?: Db): HubData {
  const layer = createDataLayer(client)
  return {
    layer,
    listMyCampaigns: (userId) => layer.campaigns.listMyCampaigns(userId),
    createCampaign: (slug, name) => layer.campaigns.createCampaign(slug, name),
    isHubOwner: () => layer.campaignRequests.isHubOwner(),
    listMyCampaignRequests: (userId) => layer.campaignRequests.listMyCampaignRequests(userId),
    createCampaignRequest: (request) => layer.campaignRequests.createCampaignRequest(request),
    cancelCampaignRequest: (id) => layer.campaignRequests.cancelCampaignRequest(id),
    listAllCampaignRequests: () => layer.campaignRequests.listAllCampaignRequests(),
    approveCampaignRequest: (id, overrides) => layer.campaignRequests.approveCampaignRequest(id, overrides),
    rejectCampaignRequest: (id, note) => layer.campaignRequests.rejectCampaignRequest(id, note),
    previewInvite: (code) => layer.campaigns.previewInvite(code),
    acceptInvite: (code) => layer.campaigns.acceptInvite(code),
    async listMyCharacterIds(campaignId, userId) {
      const pjs = await layer.entity('pjs').list(campaignId)
      return pjs.filter((pj) => pj.owner_id === userId).map((pj) => pj.id)
    },
    updateProfile: (userId, patch) => layer.profiles.update(userId, patch),
  }
}
