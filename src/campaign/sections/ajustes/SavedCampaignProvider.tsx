import { useMemo, useState, type ReactNode } from 'react'
import { SavedCampaignContext, type SavedCampaign } from './savedCampaignContext'

/** Holds the latest saved campaign row for all the Ajustes editors under it. */
export function SavedCampaignProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<SavedCampaign | null>(null)
  const value = useMemo(() => ({ saved, setSaved }), [saved])
  return <SavedCampaignContext.Provider value={value}>{children}</SavedCampaignContext.Provider>
}
