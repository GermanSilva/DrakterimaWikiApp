import { useCallback, useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useHubData } from '../../app/DataContext'
import { FormPortContext, WikiPortContext } from '../../ports'
import { useCampaign } from '../CampaignContext'
import { CampaignServicesProvider } from '../entities/CampaignServices'
import { useWikiIndex } from '../entities/useWikiIndex'
import { EntityFormProvider } from '../EntityFormHost'
import { entityPath } from '../navigation'
import { ToastProvider } from '../toast'
import { createHubFormPort } from './hubFormPort'
import { createHubWikiPort } from './hubWikiPort'
import { HubPlayerNotesProvider } from './HubPlayerNotesProvider'
import { HubUnreadProvider } from './HubUnreadProvider'

function HubWikiAndFormProviders({ children }: { children: ReactNode }) {
  const { campaign, isDM, myCharacterIds } = useCampaign()
  const index = useWikiIndex()
  const navigate = useNavigate()
  const slug = campaign.slug

  const go = useCallback(
    (table: string, id: number) => {
      if (typeof window.scrollTo === 'function') window.scrollTo(0, 0)
      navigate(entityPath(slug, table, id))
    },
    [navigate, slug],
  )
  const wiki = useMemo(() => createHubWikiPort({ index, navigate: go }), [index, go])
  const form = useMemo(
    () =>
      createHubFormPort({
        isDM,
        regions: campaign.regions,
        characterFields: campaign.character_custom_fields,
        myCharacterIds,
        pjs: index.byTable.pjs,
      }),
    [isDM, campaign.regions, campaign.character_custom_fields, myCharacterIds, index.byTable.pjs],
  )
  return (
    <WikiPortContext.Provider value={wiki}>
      <FormPortContext.Provider value={form}>{children}</FormPortContext.Provider>
    </WikiPortContext.Provider>
  )
}

/**
 * The hub adapter of every port the shared components read (wiki, unread, player notes, form data),
 * plus the toast, the shared realtime store and the entity form host. Mounted once by
 * CampaignLayout inside `CampaignContext`, so every section inherits it. All of them share one
 * table store: one realtime channel per table, however many components read it.
 */
export function HubPortsProvider({ children }: { children: ReactNode }) {
  const { campaign } = useCampaign()
  const { layer } = useHubData()
  return (
    <CampaignServicesProvider layer={layer} campaignId={campaign.id}>
      <ToastProvider>
        <HubWikiAndFormProviders>
          <HubUnreadProvider>
            <HubPlayerNotesProvider>
              <EntityFormProvider>{children}</EntityFormProvider>
            </HubPlayerNotesProvider>
          </HubUnreadProvider>
        </HubWikiAndFormProviders>
      </ToastProvider>
    </CampaignServicesProvider>
  )
}
