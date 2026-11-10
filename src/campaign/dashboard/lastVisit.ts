import { useCallback, useState } from 'react'

/** Phase 1: the last visit lives in this browser, per campaign and user (no server state yet). */
export const lastVisitKey = (campaignId: string, userId: string): string => `drakterima:last-visit:${campaignId}:${userId}`

function read(key: string): number | null {
  try {
    const ms = Date.parse(localStorage.getItem(key) ?? '')
    return Number.isNaN(ms) ? null : ms
  } catch {
    return null
  }
}

function write(key: string, ms: number): void {
  try {
    localStorage.setItem(key, new Date(ms).toISOString())
  } catch {
    // storage unavailable (private mode, quota): the visit still counts for this session
  }
}

export interface LastVisit {
  /** Epoch ms of the previous visit; the first visit starts at "now". */
  since: number
  markRead: () => void
}

/** Keyed by campaign and user: remount (`key`) when either changes. */
export function useLastVisit(campaignId: string, userId: string): LastVisit {
  const key = lastVisitKey(campaignId, userId)
  const [since, setSince] = useState<number>(() => {
    const stored = read(key)
    if (stored !== null) return stored
    const now = Date.now()
    write(key, now)
    return now
  })
  const markRead = useCallback(() => {
    const now = Date.now()
    write(key, now)
    setSince(now)
  }, [key])
  return { since, markRead }
}
