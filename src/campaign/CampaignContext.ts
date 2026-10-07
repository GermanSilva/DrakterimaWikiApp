import { createContext, useContext } from 'react'
import type { Campaign, CampaignRole } from '../data'

export interface CampaignContextValue {
  campaign: Campaign
  role: CampaignRole
  isDM: boolean
  /** Ids of the pjs the signed-in user owns in this campaign (empty for a DM without a character). */
  myCharacterIds: number[]
  /** Re-reads the campaign, my role and my characters (e.g. after editing branding). */
  reload: () => void
}

export const CampaignContext = createContext<CampaignContextValue | null>(null)

/** Only valid under /c/:slug (inside CampaignLayout once the campaign has loaded). */
export function useCampaign(): CampaignContextValue {
  const value = useContext(CampaignContext)
  if (!value) throw new Error('useCampaign must be used inside <CampaignLayout>')
  return value
}
