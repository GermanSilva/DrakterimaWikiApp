import type { CampaignWithRole, SystemSummary } from '../data'

const RANK = { origin: 0, homebrew: 1, frozen: 2 } as const

/**
 * What a user may pick as the base of a campaign request (S25): the origins, the homebrew of the campaigns they DM (their own
 * or a co-DM's) and their own frozen copies. The database already narrows its answer; a hub owner's view is wider, so the
 * client narrows again. Origins first, then homebrew, then frozen copies, keeping the given order inside each kind.
 */
export function usableBases(all: readonly SystemSummary[], userId: string | null, campaigns: readonly CampaignWithRole[]): SystemSummary[] {
  const dmOf = new Set(campaigns.filter((c) => c.role === 'dm' && !c.viaHubOwner).map((c) => c.id))
  return all
    .filter((s) => {
      if (s.archived_at !== null) return false
      if (s.kind === 'origin') return true
      if (s.kind === 'homebrew') return s.campaign_id !== null && dmOf.has(s.campaign_id)
      return s.owner_id === userId
    })
    .map((s, i) => ({ s, i }))
    .sort((a, b) => RANK[a.s.kind] - RANK[b.s.kind] || a.i - b.i)
    .map(({ s }) => s)
}

/** «Mis plantillas»: the usable bases that are not origins. */
export const myTemplates = (all: readonly SystemSummary[], userId: string | null, campaigns: readonly CampaignWithRole[]) =>
  usableBases(all, userId, campaigns).filter((s) => s.kind !== 'origin')
