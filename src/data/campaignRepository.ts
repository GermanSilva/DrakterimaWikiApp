import {
  CAMPAIGN_COLUMNS,
  CAMPAIGN_MEMBER_COLUMNS,
  INVITE_COLUMNS,
  INVITE_WRITE_COLUMNS,
  join,
} from './columns'
import { ConflictError, DataError, unwrap, unwrapWrite } from './errors'
import { fromTable } from './loose'
import { pagedList } from './pagedList'
import type { Profile } from './profileRepository'
import type { Db } from './types'
import { throwZeroRows } from './zeroRows'

export type CampaignRole = 'dm' | 'player'

export interface Campaign {
  id: string
  slug: string
  name: string
  system: string
  branding: Record<string, unknown>
  regions: unknown[]
  character_custom_fields: unknown[]
  settings: Record<string, unknown>
  created_by: string | null
  created_at: string
  updated_at: string
}

export type CampaignWithRole = Campaign & { role: CampaignRole }

export interface Member {
  campaign_id: string
  user_id: string
  role: CampaignRole
  created_at: string
  updated_at: string
  profile: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> | null
}

export interface Invite {
  id: string
  campaign_id: string
  code: string
  role: CampaignRole
  character_id: number | null
  max_uses: number
  uses: number
  expires_at: string | null
  created_by: string | null
  created_at: string
}

export interface NewInvite {
  campaign_id: string
  role?: CampaignRole
  character_id?: number | null
  max_uses?: number
  expires_at?: string | null
}

/** Return shape of the preview_invite RPC: what the invited user sees before accepting. */
export interface InvitePreview {
  campaign_name: string
  campaign_slug: string
  /** https URL or null. */
  logo_url: string | null
  role: CampaignRole
  /** Name of the character offered by a claim invite. */
  character_name: string | null
  is_member: boolean
  /** The caller is already a member and has nothing left to claim: accepting would change nothing. */
  nothing_to_do: boolean
}

/** Return shape of the accept_invite RPC. */
export interface AcceptInviteResult {
  joined: boolean
  claimed: boolean
  campaign_id: string
  slug: string
  role: CampaignRole
  character_id: number | null
}

/**
 * What `updateCampaign` may change. `branding` holds the keys to set: a string sets it, `null` removes it, keys
 * not mentioned are kept as stored (including keys this client does not know). `regions` and
 * `character_custom_fields` replace the stored array as a whole (an array cannot be merged); the caller validates
 * the entries (see the Ajustes validators). Slug, system and settings are deliberately not editable here.
 */
export interface CampaignPatch {
  name?: string
  branding?: Record<string, string | null>
  regions?: unknown[]
  character_custom_fields?: unknown[]
}

const CAMPAIGN_SELECT = join(CAMPAIGN_COLUMNS)
const PROFILE_EMBED = 'id, display_name, avatar_url'

/** Campaigns, membership and invites. */
export function createCampaignRepository(client: Db) {
  return {
    /** Campaigns the user belongs to, each with their role in it. */
    async listMyCampaigns(userId: string): Promise<CampaignWithRole[]> {
      const rows = await pagedList<{ role: CampaignRole; campaign: Campaign | null }>(
        () =>
          fromTable(client, 'campaign_members')
            .select(`role, campaign:campaigns(${CAMPAIGN_SELECT})`)
            .eq('user_id', userId)
            .order('campaign_id', { ascending: true }),
        'campaign_members',
      )
      return rows
        .filter((r): r is { role: CampaignRole; campaign: Campaign } => r.campaign !== null)
        .map((r) => ({ ...r.campaign, role: r.role }))
        .sort((a, b) => a.name.localeCompare(b.name))
    },

    /** RLS only returns campaigns the caller belongs to, so a stranger's slug yields null. */
    async getCampaignBySlug(slug: string): Promise<Campaign | null> {
      return unwrap<Campaign | null>(
        await fromTable(client, 'campaigns').select(CAMPAIGN_SELECT).eq('slug', slug).maybeSingle(),
      )
    },

    /** RPC: creates the campaign and makes the caller its DM. Errors: reserved_slug, campaign_limit_reached. */
    async createCampaign(slug: string, name: string): Promise<Campaign> {
      return unwrap(await client.rpc('create_campaign', { p_slug: slug, p_name: name })) as unknown as Campaign
    },

    /**
     * DM only (RLS + column grant). Updates only the whitelisted `name` / `branding` / `regions` / `character_custom_fields` columns; `branding` is merged
     * key by key onto the stored object. `base` is the `updated_at` the caller's form was built from: when the stored
     * row is not at that version nothing is written and a ConflictError is thrown (the caller re-reads, never
     * overwrites). The write itself is guarded by `updated_at` too, so a change between our read and write also
     * conflicts. Returns the updated row.
     */
    async updateCampaign(campaignId: string, patch: CampaignPatch, base?: string): Promise<Campaign> {
      const read = async () =>
        unwrap<Campaign | null>(await fromTable(client, 'campaigns').select(CAMPAIGN_SELECT).eq('id', campaignId).maybeSingle())
      const current = await read()
      if (!current) throw new DataError('not_found', 'campaign: not found (missing or not visible)')
      if (base !== undefined && current.updated_at !== base) throw new ConflictError()

      const update: { name?: string; branding?: Record<string, unknown>; regions?: unknown[]; character_custom_fields?: unknown[] } = {}
      for (const key of ['regions', 'character_custom_fields'] as const) {
        if (patch[key] !== undefined && !Array.isArray(patch[key])) throw new DataError('validation', `campaign: ${key} must be an array`)
      }
      if (patch.name !== undefined) update.name = patch.name
      if (patch.regions !== undefined) update.regions = patch.regions
      if (patch.character_custom_fields !== undefined) update.character_custom_fields = patch.character_custom_fields
      if (patch.branding !== undefined) {
        const merged: Record<string, unknown> = { ...(current.branding ?? {}) }
        for (const [key, value] of Object.entries(patch.branding)) {
          if (value === null) delete merged[key]
          else merged[key] = value
        }
        update.branding = merged
      }
      if (Object.keys(update).length === 0) return current

      const row = unwrap<Campaign | null>(
        await fromTable(client, 'campaigns')
          .update(update)
          .eq('id', campaignId)
          .eq('updated_at', current.updated_at)
          .select(CAMPAIGN_SELECT)
          .maybeSingle(),
      )
      if (row) return row
      const latest = await read()
      if (!latest) throw new DataError('not_found', 'campaign: not found (missing or not visible)')
      if (latest.updated_at === current.updated_at) throw new DataError('permission', 'campaign: update affected no rows (not permitted)')
      throw new ConflictError()
    },

    async listMembers(campaignId: string): Promise<Member[]> {
      return pagedList<Member>(
        () =>
          fromTable(client, 'campaign_members')
            .select(`${join(CAMPAIGN_MEMBER_COLUMNS)}, profile:profiles(${PROFILE_EMBED})`)
            .eq('campaign_id', campaignId)
            .order('created_at', { ascending: true })
            .order('user_id', { ascending: true }),
        'campaign_members',
      )
    },

    /**
     * DM only (RLS: the code is a credential). Newest first, spent and expired invites included so the DM can see
     * their status and clean them up.
     */
    async listInvites(campaignId: string): Promise<Invite[]> {
      return pagedList<Invite>(
        () =>
          fromTable(client, 'campaign_invites')
            .select(join(INVITE_COLUMNS))
            .eq('campaign_id', campaignId)
            .order('created_at', { ascending: false })
            .order('id', { ascending: true }),
        'campaign_invites',
      )
    },

    /** DM only. Revoking = deleting: the code stops working at once. Throws not_found when it is already gone. */
    async revokeInvite(inviteId: string): Promise<void> {
      const rows = unwrap<unknown[]>(await fromTable(client, 'campaign_invites').delete().eq('id', inviteId).select('id'))
      if (rows.length === 0) await throwZeroRows(client, 'campaign_invites', { id: inviteId }, 'invite')
    },

    /**
     * DM only. The generated `code` is returned (it is a credential). Errors raised by the triggers keep their
     * reason (kind 'validation'): character_already_owned, character_already_has_pending_invite.
     */
    async createInvite(invite: NewInvite): Promise<Invite> {
      const payload = Object.fromEntries(
        INVITE_WRITE_COLUMNS.filter((k) => invite[k] !== undefined).map((k) => [k, invite[k]]),
      )
      return unwrapWrite<Invite>(
        await fromTable(client, 'campaign_invites').insert(payload).select(join(INVITE_COLUMNS)).single(),
      )
    },

    /**
     * RPC, read-only: what the code leads to, WITHOUT consuming it. Errors (kind 'business', message = reason) are
     * acceptInvite's: invite_not_found, invite_expired, invite_exhausted, character_already_claimed.
     */
    async previewInvite(code: string): Promise<InvitePreview> {
      return unwrap(await client.rpc('preview_invite', { p_code: code })) as unknown as InvitePreview
    },

    /** RPC. Errors (kind 'business', message = reason): invite_not_found, invite_expired, invite_exhausted, character_already_claimed. */
    async acceptInvite(code: string): Promise<AcceptInviteResult> {
      return unwrap(await client.rpc('accept_invite', { p_code: code })) as unknown as AcceptInviteResult
    },

    /** A member removes themselves. The last DM cannot leave (23514 validation error). */
    async leaveCampaign(campaignId: string, userId: string): Promise<void> {
      const rows = unwrap<unknown[]>(
        await fromTable(client, 'campaign_members')
          .delete()
          .eq('campaign_id', campaignId)
          .eq('user_id', userId)
          .select('user_id'),
      )
      if (rows.length === 0) {
        await throwZeroRows(client, 'campaign_members', { campaign_id: campaignId, user_id: userId }, 'membership')
      }
    },
  }
}

export type CampaignRepository = ReturnType<typeof createCampaignRepository>
