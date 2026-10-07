import {
  createDataLayer,
  type AcceptInviteResult,
  type Campaign,
  type CampaignWithRole,
  type DataLayer,
  type Db,
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
  createCampaign(slug: string, name: string): Promise<Campaign>
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
    acceptInvite: (code) => layer.campaigns.acceptInvite(code),
    async listMyCharacterIds(campaignId, userId) {
      const pjs = await layer.entity('pjs').list(campaignId)
      return pjs.filter((pj) => pj.owner_id === userId).map((pj) => pj.id)
    },
    updateProfile: (userId, patch) => layer.profiles.update(userId, patch),
  }
}
