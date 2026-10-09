import { useEffect } from 'react'
import { useCampaignServices } from '../entities/campaignServicesContext'

/** The client sends at most one touch per window; the server throttles with the same window. */
export const PRESENCE_CLIENT_THROTTLE_MS = 5 * 60 * 1000

/**
 * Tells the server that the signed-in member is looking at this campaign: once when the campaign
 * opens and again whenever the tab regains focus / becomes visible, at most once per
 * `PRESENCE_CLIENT_THROTTLE_MS`. Purely best-effort: a failure (offline, not a member any more,
 * an old backend without the RPC) is swallowed and never reaches the UI; the next focus retries.
 */
export function usePresenceBeacon(): void {
  const { layer, campaignId } = useCampaignServices()

  useEffect(() => {
    let lastAttempt = Number.NEGATIVE_INFINITY
    let inFlight = false
    let disposed = false

    function touch() {
      if (disposed || inFlight) return
      const now = Date.now()
      if (now - lastAttempt < PRESENCE_CLIENT_THROTTLE_MS) return
      lastAttempt = now
      inFlight = true
      // `Promise.resolve().then` also turns a synchronous throw (e.g. a layer without presence) into a rejection.
      Promise.resolve()
        .then(() => layer.presence.touch(campaignId))
        .catch(() => {
          lastAttempt = Number.NEGATIVE_INFINITY // a failed touch does not count: the next focus tries again
        })
        .finally(() => {
          inFlight = false
        })
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') touch()
    }

    touch()
    window.addEventListener('focus', touch)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      disposed = true
      window.removeEventListener('focus', touch)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [layer, campaignId])
}
