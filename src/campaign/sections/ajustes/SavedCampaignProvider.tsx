import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { SavedCampaignContext, type SavedCampaign } from './savedCampaignContext'

/** Holds the latest saved campaign row for all the Ajustes editors under it. */
export function SavedCampaignProvider({ children }: { children: ReactNode }) {
  const [saved, setSavedState] = useState<SavedCampaign | null>(null)
  // The ref moves with the write itself, so a second block saving in the same click already sees the first one's row.
  const latest = useRef<SavedCampaign | null>(null)
  const setSaved = useCallback((next: SavedCampaign | null) => {
    latest.current = next
    setSavedState(next)
  }, [])
  const getSaved = useCallback(() => latest.current, [])
  const value = useMemo(() => ({ saved, setSaved, getSaved }), [saved, setSaved, getSaved])
  return <SavedCampaignContext.Provider value={value}>{children}</SavedCampaignContext.Provider>
}
