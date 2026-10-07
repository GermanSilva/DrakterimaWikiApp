import { useMemo, type ReactNode } from 'react'
import type { DataLayer } from '../../data'
import { CampaignServicesContext, type CampaignServices } from './campaignServicesContext'
import { TableStore } from './tableStore'
import { TableStoreHost } from './TableStoreHost'

/**
 * Owns the data layer and the table store of one campaign. Mounted once per campaign by
 * CampaignLayout (see HubPortsProvider); a different campaign gets a fresh store, so nothing leaks
 * across campaigns.
 */
export function CampaignServicesProvider({
  layer,
  campaignId,
  children,
}: {
  layer: DataLayer
  campaignId: string
  children: ReactNode
}) {
  const value = useMemo<CampaignServices>(
    () => ({ layer, campaignId, store: new TableStore(layer, campaignId) }),
    [layer, campaignId],
  )
  return (
    <CampaignServicesContext.Provider value={value}>
      <TableStoreHost store={value.store}>{children}</TableStoreHost>
    </CampaignServicesContext.Provider>
  )
}
