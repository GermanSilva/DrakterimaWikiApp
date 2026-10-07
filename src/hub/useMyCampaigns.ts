import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { useHubData } from '../app/DataContext'
import type { CampaignWithRole } from '../data'

export interface MyCampaignsState {
  status: 'loading' | 'ready' | 'error'
  campaigns: CampaignWithRole[]
}

interface Owned extends MyCampaignsState {
  userId: string
}

const LOADING: MyCampaignsState = { status: 'loading', campaigns: [] }

/**
 * The signed-in user's campaigns (with role). State is tagged with the user it belongs to, so a
 * different user (sign-out then sign-in without unmounting) never sees the previous user's list.
 * Only the latest effect run may write state.
 */
export function useMyCampaigns() {
  const { user } = useAuth()
  const data = useHubData()
  const userId = user?.id ?? null
  const [state, setState] = useState<Owned | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    data.listMyCampaigns(userId).then(
      (campaigns) => {
        if (!cancelled) setState({ userId, status: 'ready', campaigns })
      },
      () => {
        if (!cancelled) {
          setState((prev) => ({ userId, status: 'error', campaigns: prev?.userId === userId ? prev.campaigns : [] }))
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [data, userId, nonce])

  const reload = useCallback(() => {
    setState((prev) => (prev ? { ...prev, status: 'loading' } : prev))
    setNonce((n) => n + 1)
  }, [])

  const mine: MyCampaignsState = state && state.userId === userId ? state : LOADING
  return { status: mine.status, campaigns: mine.campaigns, reload }
}
