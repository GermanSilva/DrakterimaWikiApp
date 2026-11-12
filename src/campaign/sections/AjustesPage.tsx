import { useEffect } from 'react'
import { useBlocker, useSearchParams } from 'react-router'
import { AdminSection } from '../../components/AdminSection'
import { PageHeader } from '../../components/Shared'
import { useCampaign } from '../CampaignContext'
import { SectionNotFound } from '../SectionRoute'
import { AjustesTabPanel, AjustesTabs, type AjustesTabBadge, type AjustesTabDef } from './ajustes/AjustesTabs'
import { CampaignSettings } from './ajustes/CampaignSettings'
import { DangerZone } from './ajustes/DangerZone'
import { CustomFieldsSettings } from './ajustes/CustomFieldsSettings'
import { ExportSettings } from './ajustes/ExportSettings'
import { GameLogsSettings } from './ajustes/GameLogsSettings'
import { InvitesSettings } from './ajustes/InvitesSettings'
import { LoteriaSettings } from './ajustes/LoteriaSettings'
import { PlayersSettings } from './ajustes/PlayersSettings'
import { PotSettings } from './ajustes/PotSettings'
import { RegionsSettings } from './ajustes/RegionsSettings'
import { SavedCampaignProvider } from './ajustes/SavedCampaignProvider'
import { SheetBuilderSettings } from './ajustes/SheetBuilderSettings'
import { SystemSettings } from './ajustes/SystemSettings'
import { TabSaveBar, type BarTab } from './ajustes/tabSave/TabSaveBar'
import { TabSaveProvider } from './ajustes/tabSave/TabSaveProvider'
import { summarizeTab, TabScopeContext, useTabSaveApi } from './ajustes/tabSave/tabSaveContext'

const TAB_IDS = ['campana', 'sistema', 'ficha', 'juegos', 'jugadores', 'datos'] as const
type TabId = (typeof TAB_IDS)[number]

/** The tabs, with the label of the save of those whose blocks keep a draft (the others act immediately and have no bar). */
const TABS: (AjustesTabDef<TabId> & Omit<BarTab, 'id' | 'label'>)[] = [
  { id: 'campana', label: 'Campaña', saveLabel: 'Guardar campaña' },
  { id: 'sistema', label: 'Sistema', saveLabel: 'Guardar sistema' },
  { id: 'ficha', label: 'Ficha', saveLabel: 'Guardar plantilla', alwaysVisible: true },
  { id: 'juegos', label: 'Juegos', saveLabel: 'Guardar juegos' },
  { id: 'jugadores', label: 'Jugadores', saveLabel: null },
  { id: 'datos', label: 'Datos', saveLabel: null },
]

/** Unknown or missing `?tab=` falls back to the first tab. */
const asTabId = (value: string | null): TabId => ((TAB_IDS as readonly string[]).includes(value ?? '') ? (value as TabId) : 'campana')

/**
 * The blocks of the settings page grouped by tab. Each block is self-contained and owns its data hooks, so adding one is
 * one more entry here.
 */
const PANELS: Record<TabId, { title: string; Block: () => JSX.Element }[]> = {
  campana: [
    { title: 'Campaña', Block: CampaignSettings },
    { title: 'Regiones', Block: RegionsSettings },
  ],
  sistema: [{ title: 'Sistema', Block: SystemSettings }],
  ficha: [
    { title: 'Plantilla de ficha', Block: SheetBuilderSettings },
    { title: 'Campos de personaje', Block: CustomFieldsSettings },
  ],
  juegos: [
    { title: 'Juegos: configuración de la lotería', Block: LoteriaSettings },
    { title: 'Juegos: pozo acumulado', Block: PotSettings },
    { title: 'Juegos: registro de tiradas', Block: GameLogsSettings },
  ],
  jugadores: [
    { title: 'Jugadores', Block: PlayersSettings },
    { title: 'Invitaciones', Block: InvitesSettings },
  ],
  datos: [
    { title: 'Exportar', Block: ExportSettings },
    { title: 'Zona de peligro', Block: DangerZone },
  ],
}

/**
 * The tabbed settings: the selected tab lives in `?tab=`. Every panel stays mounted (the inactive ones are hidden) so an
 * unsaved draft survives a tab switch. Blocks with a draft register with the save bar of their tab; the tabs show a dot when
 * theirs has unsaved changes and "Error" when it has errors that block saving. Mounted only for a DM: nothing in here is
 * requested for a player.
 */
function AjustesSections() {
  const [params, setParams] = useSearchParams()
  const selected = asTabId(params.get('tab'))
  const api = useTabSaveApi()
  const tabs = TABS.map((tab) => {
    const { dirty, errors } = summarizeTab(api.summaries, tab.id)
    const badge: AjustesTabBadge[] = [...(dirty > 0 ? ['dirty' as const] : []), ...(errors > 0 ? ['error' as const] : [])]
    return badge.length > 0 ? { ...tab, badge } : tab
  })

  // Leaving Ajustes (another section, another campaign) with unsaved changes asks first; switching tabs is not leaving.
  const unsaved = api.summaries.some((b) => b.dirtyCount > 0)
  const blocker = useBlocker(({ currentLocation, nextLocation }) => unsaved && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm('Hay cambios de Ajustes sin guardar. Si salís ahora se pierden. ¿Salir igual?')) blocker.proceed()
    else blocker.reset()
  }, [blocker])

  const select = (id: TabId) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('tab', id)
        return next
      },
      { replace: true },
    )
  return (
    <>
      <AjustesTabs tabs={tabs} selected={selected} onSelect={select} />
      <div className="pb-[120px]">
        {TAB_IDS.map((id) => (
          <AjustesTabPanel key={id} id={id} selected={id === selected}>
            <TabScopeContext.Provider value={id}>
              {PANELS[id].map(({ title, Block }) => (
                <AdminSection key={title} title={title}>
                  <Block />
                </AdminSection>
              ))}
            </TabScopeContext.Provider>
          </AjustesTabPanel>
        ))}
      </div>
      <TabSaveBar tabs={TABS} active={selected} onSelect={(id) => select(id as TabId)} />
    </>
  )
}

/** `/c/:slug/ajustes`: campaign settings for the DM (also a 404 for a player here, besides the registry's `dmOnly`). */
export function AjustesPage() {
  const { isDM, campaign } = useCampaign()
  if (!isDM) return <SectionNotFound />
  return (
    <div>
      <PageHeader eyebrow="Dungeon Master" title="Ajustes" titleAs="h1">
        {null}
      </PageHeader>
      <SavedCampaignProvider key={campaign.id}>
        <TabSaveProvider>
          <AjustesSections />
        </TabSaveProvider>
      </SavedCampaignProvider>
    </div>
  )
}
