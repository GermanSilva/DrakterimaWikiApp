import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { useHubData } from '../app/DataContext'
import type { Campaign, CampaignRole, CampaignWithRole } from '../data'

export type CampaignLoad =
  | { status: 'loading' }
  /** No campaign with that slug among MY campaigns (RLS makes "does not exist" and "not a member" identical). */
  | { status: 'unavailable' }
  | { status: 'error' }
  | {
      status: 'ready'
      campaign: Campaign
      role: CampaignRole
      myCharacterIds: number[]
      /** Every campaign I belong to (campaign switcher). */
      campaigns: CampaignWithRole[]
    }

interface Keyed {
  key: string
  load: CampaignLoad
}

/**
 * Resolves `/c/:slug` against the user's own memberships. The slug is only compared in JS against
 * the list RLS already scoped to me; it never reaches a query string or filter.
 */
export function useCampaignLoader(slug: string | undefined) {
  const { user } = useAuth()
  const data = useHubData()
  const userId = user?.id ?? null
  const key = `${userId}:${slug}`
  const [state, setState] = useState<Keyed | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!userId || !slug) return
    let cancelled = false
    const settle = (load: CampaignLoad) => {
      if (!cancelled) setState({ key, load })
    }
    data
      .listMyCampaigns(userId)
      .then(async (campaigns) => {
        const mine = campaigns.find((c) => c.slug === slug)
        if (!mine) return settle({ status: 'unavailable' })
        const myCharacterIds = await data.listMyCharacterIds(mine.id, userId)
        const { role, ...campaign } = mine
        settle({ status: 'ready', campaign, role, myCharacterIds, campaigns })
      })
      .catch(() => settle({ status: 'error' }))
    return () => {
      cancelled = true
    }
  }, [data, userId, slug, key, nonce])

  // A result for another slug/user is stale: show loading until the matching load settles. A reload
  // keeps the previous result on screen (same key) instead of flashing a spinner.
  const load: CampaignLoad = state && state.key === key ? state.load : { status: 'loading' }
  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { load, reload }
}
