import { useMemo } from 'react'
import { useCampaign } from '../CampaignContext'
import { parseSystemProfile, type SystemProfile } from './systemProfile'

/** The system document of the current campaign, parsed (never throws: an unusable document is the D&D 5e one). */
export function useSystem(): SystemProfile {
  const { campaign } = useCampaign()
  return useMemo(() => parseSystemProfile(campaign.system_profile), [campaign.system_profile])
}
