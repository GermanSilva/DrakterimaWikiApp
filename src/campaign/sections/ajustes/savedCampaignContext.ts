import { createContext, useContext } from 'react'
import type { Campaign } from '../../../data'

/** The row the last successful Ajustes save returned, and the context campaign it was written over. */
export interface SavedCampaign {
  row: Campaign
  over: Campaign
}

export interface SavedCampaignValue {
  saved: SavedCampaign | null
  setSaved: (saved: SavedCampaign | null) => void
}

/** Shared by every Ajustes editor so a save in one section is the base version of the next save in another. */
export const SavedCampaignContext = createContext<SavedCampaignValue | null>(null)

/**
 * The freshest campaign the page knows: the context campaign, unless a save of ours is newer than it (the reload
 * after a save has not landed yet, or an older reload landed after a later save). Timestamps decide when both
 * parse; otherwise the saved row only counts while the context still holds the campaign it was written over.
 */
export function freshestCampaign(loaded: Campaign, saved: SavedCampaign | null): Campaign {
  if (!saved) return loaded
  const l = Date.parse(loaded.updated_at)
  const s = Date.parse(saved.row.updated_at)
  if (Number.isNaN(l) || Number.isNaN(s)) return saved.over === loaded ? saved.row : loaded
  return l >= s ? loaded : saved.row
}

export function useSavedCampaign(): SavedCampaignValue {
  const value = useContext(SavedCampaignContext)
  if (!value) throw new Error('useSavedCampaign must be used inside <SavedCampaignProvider>')
  return value
}
