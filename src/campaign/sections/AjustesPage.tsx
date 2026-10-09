import { useNavigate } from 'react-router'
import { AdminAction, AdminSection } from '../../components/AdminSection'
import { PageHeader } from '../../components/Shared'
import { useCampaign } from '../CampaignContext'
import { SectionNotFound } from '../SectionRoute'
import { ExportSettings } from './ajustes/ExportSettings'
import { GameLogsSettings } from './ajustes/GameLogsSettings'
import { LoteriaSettings } from './ajustes/LoteriaSettings'
import { PlayersSettings } from './ajustes/PlayersSettings'
import { PotSettings } from './ajustes/PotSettings'

/**
 * The stacked sections of the settings page. Each is one self-contained block that owns its data
 * hooks, so adding a section (campaign management arrives in H10) is one more entry here.
 * Mounted only for a DM: nothing in here is requested for a player.
 */
function AjustesSections() {
  const { campaign } = useCampaign()
  const navigate = useNavigate()
  return (
    <>
      <AdminSection title="Pantalla de sesión">
        <AdminAction
          label="Sesión en vivo"
          description="Vista en vivo con tarjetas de personajes y reglas homebrew para usar durante la sesión."
          buttonLabel="Abrir"
          onClick={() => navigate(`/c/${campaign.slug}/sesion-en-vivo`)}
        />
      </AdminSection>

      <AdminSection title="Juegos: configuración de la lotería">
        <LoteriaSettings />
      </AdminSection>

      <AdminSection title="Juegos: pozo acumulado">
        <PotSettings />
      </AdminSection>

      <AdminSection title="Juegos: registro de tiradas">
        <GameLogsSettings />
      </AdminSection>

      <AdminSection title="Jugadores">
        <PlayersSettings />
      </AdminSection>

      <AdminSection title="Exportar">
        <ExportSettings />
      </AdminSection>
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
      <AjustesSections key={campaign.id} />
    </div>
  )
}
