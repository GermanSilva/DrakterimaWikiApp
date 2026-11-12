import { useSearchParams } from 'react-router'
import { AdminSection } from '../../components/AdminSection'
import { PageHeader } from '../../components/Shared'
import { useCampaign } from '../CampaignContext'
import { SectionNotFound } from '../SectionRoute'
import { AjustesTabPanel, AjustesTabs, type AjustesTabDef } from './ajustes/AjustesTabs'
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

const TAB_IDS = ['campana', 'sistema', 'ficha', 'juegos', 'jugadores', 'datos'] as const
type TabId = (typeof TAB_IDS)[number]

const TABS: AjustesTabDef<TabId>[] = [
  { id: 'campana', label: 'Campaña' },
  { id: 'sistema', label: 'Sistema' },
  { id: 'ficha', label: 'Ficha' },
  { id: 'juegos', label: 'Juegos' },
  { id: 'jugadores', label: 'Jugadores' },
  { id: 'datos', label: 'Datos' },
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
 * unsaved draft survives a tab switch. Mounted only for a DM: nothing in here is requested for a player.
 */
function AjustesSections() {
  const [params, setParams] = useSearchParams()
  const selected = asTabId(params.get('tab'))
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
      <AjustesTabs tabs={TABS} selected={selected} onSelect={select} />
      {TAB_IDS.map((id) => (
        <AjustesTabPanel key={id} id={id} selected={id === selected}>
          {PANELS[id].map(({ title, Block }) => (
            <AdminSection key={title} title={title}>
              <Block />
            </AdminSection>
          ))}
        </AjustesTabPanel>
      ))}
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
        <AjustesSections />
      </SavedCampaignProvider>
    </div>
  )
}
