import { useAuth } from '../auth'
import { useHubData } from '../app/DataContext'
import { useLoaded } from './useLoaded'

/**
 * Whether the signed-in user is a hub owner. A UI hint only (which form to show): the database enforces the
 * privilege on every write. `isOwner` is false while loading and when the check fails; `ready` tells the two apart.
 */
export function useIsHubOwner(): { isOwner: boolean; ready: boolean } {
  const { user } = useAuth()
  const data = useHubData()
  const { status, value } = useLoaded(user?.id ?? null, () => data.isHubOwner(), false)
  return { isOwner: status === 'ready' && value, ready: status !== 'loading' }
}
