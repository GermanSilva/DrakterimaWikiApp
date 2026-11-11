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
  type NewCampaignBranding,
  type NewCampaignRequest,
  type Profile,
  type PublicInvitePreview,
  type SystemAction,
  type SystemSummary,
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
  createCampaign(slug: string, name: string, branding?: NewCampaignBranding): Promise<Campaign>
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
  /** Signed out (login page): the campaign branding behind an invite code. Never consumes the invite. */
  previewInvitePublic(code: string): Promise<PublicInvitePreview>
  acceptInvite(code: string): Promise<AcceptInviteResult>
  /** Ids of the characters (pjs) the user owns in the campaign. */
  listMyCharacterIds(campaignId: string, userId: string): Promise<number[]>
  updateProfile(userId: string, patch: { display_name?: string; avatar_url?: string | null }): Promise<Profile>
  /** What the signed-in user may pick as the base of a campaign request (the hub owner's view is wider; the request is checked again). */
  listAvailableSystems(): Promise<SystemSummary[]>
  /** Hub owners: every system, archived included. */
  listAllSystems(): Promise<SystemSummary[]>
  /** Hub owners read every catalogue; a DM / owner only their own (system_not_available otherwise). */
  getSystemActions(systemId: string): Promise<SystemAction[]>
  renameSystem(systemId: string, name: string): Promise<SystemSummary>
  /** Hub owners only. */
  createOriginFromCampaign(campaignId: string, name: string): Promise<SystemSummary>
  /** Hub owners only: a NEW origin from a homebrew or frozen copy. */
  promoteSystem(systemId: string, name?: string): Promise<SystemSummary>
  /** Hub owners only. */
  archiveSystem(systemId: string, archived: boolean): Promise<SystemSummary>
}

/** My memberships plus, for a hub owner, every other campaign (shown as DM through the privilege), sorted by name. */
export function withHubOwnerCampaigns(mine: CampaignWithRole[], all: Campaign[]): CampaignWithRole[] {
  const own = new Set(mine.map((c) => c.id))
  const extra = all.filter((c) => !own.has(c.id)).map((c): CampaignWithRole => ({ ...c, role: 'dm', viaHubOwner: true }))
  return [...mine, ...extra].sort((a, b) => a.name.localeCompare(b.name))
}

export function createHubData(client?: Db): HubData {
  const layer = createDataLayer(client)
  return {
    layer,
    async listMyCampaigns(userId) {
      const mine = await layer.campaigns.listMyCampaigns(userId)
      // The privilege is only a hint here (the database decides what comes back): when the check itself fails, show my own.
      const isOwner = await layer.campaignRequests.isHubOwner().catch(() => false)
      return isOwner ? withHubOwnerCampaigns(mine, await layer.campaigns.listAllCampaigns()) : mine
    },
    createCampaign: (slug, name, branding) => layer.campaigns.createCampaign(slug, name, branding),
    isHubOwner: () => layer.campaignRequests.isHubOwner(),
    listMyCampaignRequests: (userId) => layer.campaignRequests.listMyCampaignRequests(userId),
    createCampaignRequest: (request) => layer.campaignRequests.createCampaignRequest(request),
    cancelCampaignRequest: (id) => layer.campaignRequests.cancelCampaignRequest(id),
    listAllCampaignRequests: () => layer.campaignRequests.listAllCampaignRequests(),
    approveCampaignRequest: (id, overrides) => layer.campaignRequests.approveCampaignRequest(id, overrides),
    rejectCampaignRequest: (id, note) => layer.campaignRequests.rejectCampaignRequest(id, note),
    previewInvite: (code) => layer.campaigns.previewInvite(code),
    previewInvitePublic: (code) => layer.campaigns.previewInvitePublic(code),
    acceptInvite: (code) => layer.campaigns.acceptInvite(code),
    async listMyCharacterIds(campaignId, userId) {
      const pjs = await layer.entity('pjs').list(campaignId)
      return pjs.filter((pj) => pj.owner_id === userId).map((pj) => pj.id)
    },
    updateProfile: (userId, patch) => layer.profiles.update(userId, patch),
    listAvailableSystems: () => layer.systems.listAvailableBases(),
    listAllSystems: () => layer.systems.listAllSystems(),
    getSystemActions: (id) => layer.systems.getSystemActions(id),
    renameSystem: (id, name) => layer.systems.renameSystem(id, name),
    createOriginFromCampaign: (campaignId, name) => layer.systems.createOriginFromCampaign(campaignId, name),
    promoteSystem: (id, name) => layer.systems.promoteSystem(id, name),
    archiveSystem: (id, archived) => layer.systems.archiveSystem(id, archived),
  }
}
