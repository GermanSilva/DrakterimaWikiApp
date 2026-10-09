import { useRef, useState } from 'react'
import { AdminAction } from '../../../components/AdminSection'
import { useCampaign } from '../../CampaignContext'
import { useCampaignServices } from '../../entities/campaignServicesContext'
import { buildCampaignExport, downloadJson, exportFilename, ExportError } from './exportCampaign'

/** Downloads the campaign data the DM can read as one JSON file. Export only: there is no import. */
export function ExportSettings() {
  const { campaign } = useCampaign()
  const { layer } = useCampaignServices()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const running = useRef(false)

  async function run() {
    if (running.current) return
    running.current = true
    setBusy(true)
    setNotice(null)
    try {
      const now = new Date()
      const data = await buildCampaignExport(layer, campaign, now)
      const filename = exportFilename(campaign.slug, now)
      downloadJson(filename, data)
      setNotice({ kind: 'ok', text: `Se descargó ${filename}.` })
    } catch (e) {
      const where = e instanceof ExportError ? ` Falló la lectura de: ${e.part}.` : ''
      setNotice({ kind: 'error', text: `No se pudo exportar la campaña.${where} No se descargó ningún archivo; intentá de nuevo.` })
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  return (
    <>
      <AdminAction
        label="Exportar campaña (JSON)"
        description="Descarga los datos de la campaña que podés leer como DM: artículos con sus notas privadas, mapas, configuración, juegos y notas de jugadores. No incluye cuentas, miembros ni códigos de invitación."
        buttonLabel={busy ? 'Exportando…' : 'Exportar'}
        disabled={busy}
        onClick={run}
      />
      {notice && (
        <p role={notice.kind === 'error' ? 'alert' : 'status'} className={notice.kind === 'error' ? 'text-[13px] text-red-400' : 'text-[13px] text-accent-bright'}>
          {notice.text}
        </p>
      )}
    </>
  )
}
