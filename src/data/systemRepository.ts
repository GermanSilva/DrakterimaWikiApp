import { join, SYSTEM_COLUMNS } from './columns'
import { unwrap } from './errors'
import { fromTable } from './loose'
import { pagedList } from './pagedList'
import type { Db } from './types'

export type SystemKind = 'origin' | 'homebrew' | 'frozen'

/** A system without its document (lists never carry the 64 KB jsonb). */
export interface SystemSummary {
  id: string
  name: string
  kind: SystemKind
  /** Homebrew: the campaign it was branched from; frozen / origin: informational, null once that campaign is gone. */
  campaign_id: string | null
  /** The user who keeps it (homebrew creator / frozen copy); null for an origin, which belongs to the hub. */
  owner_id: string | null
  /** Informational lineage. */
  branched_from: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

type SystemRow = SystemSummary & { document: unknown }

const SELECT = join(SYSTEM_COLUMNS)

function summary(row: SystemRow): SystemSummary {
  const { document: _document, ...rest } = row
  void _document
  return rest
}

/**
 * Systems (S25): origins marked by the hub owner, homebrew branched by DMs, frozen copies kept for former DMs. The database enforces
 * every rule through RLS (select only) and RPCs. Errors keep their reason (see errors.ts): dm_only, hub_owner_only, system_owner_only,
 * system_not_found, system_not_available, invalid_system_kind, systems_limit_reached, campaign_not_found, invalid_name.
 */
export function createSystemRepository(client: Db) {
  const rpc = async (name: string, args: Record<string, unknown>): Promise<SystemSummary> =>
    summary(unwrap((await client.rpc(name as never, args as never)) as unknown as { data: SystemRow; error: null }))

  return {
    /**
     * What the caller can pick as the base of a new campaign: non-archived origins, the homebrew of the campaigns they DM and their own
     * frozen copies, in that order. (A hub owner's RLS view is wider; the request itself is checked again by the database.)
     */
    async listAvailableBases(): Promise<SystemSummary[]> {
      const rows = await pagedList<SystemSummary>(
        () => fromTable(client, 'systems').select(SELECT).is('archived_at', null).order('name').order('id'),
        'systems',
      )
      const rank = (s: SystemSummary) => (s.kind === 'origin' ? 0 : s.kind === 'homebrew' ? 1 : 2)
      return [...rows].sort((a, b) => rank(a) - rank(b))
    },

    /** Hub owner: every system, archived included (RLS shows everything to them and only non-archived ones to everybody else). */
    async listAllSystems(): Promise<SystemSummary[]> {
      return pagedList<SystemSummary>(
        () => fromTable(client, 'systems').select(SELECT).order('created_at', { ascending: false }).order('id'),
        'systems',
      )
    },

    /** The document of one system (the template a new campaign would copy), or null when it does not exist or is not visible. */
    async getSystemDocument(systemId: string): Promise<unknown> {
      const rows = unwrap<{ document: unknown }[]>(await fromTable(client, 'systems').select('document').eq('id', systemId).limit(1))
      return rows[0]?.document ?? null
    },

    /** RPC, DM of the campaign: a homebrew holding a copy of the campaign's current system. Errors: dm_only, invalid_name, systems_limit_reached. */
    branchSystem(campaignId: string, name: string): Promise<SystemSummary> {
      return rpc('branch_system', { p_campaign_id: campaignId, p_name: name })
    },

    /** RPC, the owner of a homebrew / frozen copy (or the hub owner). Errors: system_not_found, system_owner_only, invalid_name. */
    renameSystem(systemId: string, name: string): Promise<SystemSummary> {
      return rpc('rename_system', { p_system_id: systemId, p_name: name })
    },

    /** RPC, hub owner only: a new origin from a campaign's current system. */
    createOriginFromCampaign(campaignId: string, name: string): Promise<SystemSummary> {
      return rpc('create_origin_from_campaign', { p_campaign_id: campaignId, p_name: name })
    },

    /** RPC, hub owner only: a NEW origin from a homebrew or frozen copy (lineage recorded; the source stays). Errors: invalid_system_kind. */
    promoteSystem(systemId: string, name?: string): Promise<SystemSummary> {
      const args: Record<string, unknown> = { p_system_id: systemId }
      if (name !== undefined) args.p_name = name
      return rpc('promote_system', args)
    },

    /** RPC, hub owner only: archive (DMs lose access) or unarchive. Systems are never deleted. */
    archiveSystem(systemId: string, archived: boolean): Promise<SystemSummary> {
      return rpc('archive_system', { p_system_id: systemId, p_archived: archived })
    },
  }
}

export type SystemRepository = ReturnType<typeof createSystemRepository>
