import { createContext, useContext } from 'react'
import type { DataLayer } from '../../data'
import type { TableStore } from './tableStore'

export interface CampaignServices {
  layer: DataLayer
  campaignId: string
  /** The shared realtime subscriptions of this campaign layout. */
  store: TableStore
}

export const CampaignServicesContext = createContext<CampaignServices | null>(null)

export function useCampaignServices(): CampaignServices {
  const value = useContext(CampaignServicesContext)
  if (!value) throw new Error('useCampaignServices must be used inside <CampaignServicesProvider> (CampaignLayout mounts it)')
  return value
}
