import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { useAuth } from '../../../auth'
import { btnPrimary, btnSecondary } from '../../../constants'
import { useCampaignServices } from '../../entities/campaignServicesContext'
import { useLoad } from '../../entities/useLoad'
import { Loading } from '../DetailNotice'
import { lineageText, systemDate } from './systemLabels'
import { SystemNameDialog } from './SystemNameDialog'

type Dialog = { kind: 'branch' } | { kind: 'rename'; id: string; name: string } | null

/**
 * DM only: save the campaign's current system as a homebrew (S25) and see the homebrew branched from this campaign.
 * A homebrew can later be picked as the base of another campaign request; it holds a copy, never a link.
 */
export function HomebrewSettings() {
  const { layer, campaignId } = useCampaignServices()
  const { user } = useAuth()
  const systems = useLoad(() => layer.systems.listAvailableBases(), `systems:${campaignId}`)
  const [dialog, setDialog] = useState<Dialog>(null)

  const all = systems.data ?? []
  const mine = all.filter((s) => s.kind === 'homebrew' && s.campaign_id === campaignId)

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-txt-secondary">
        Guardá el sistema actual de la campaña como homebrew: queda disponible como base cuando pidas una campaña nueva. Es una copia; cambiarla después no altera ninguna campaña.
      </p>
      <div>
        <button type="button" className={btnPrimary} onClick={() => setDialog({ kind: 'branch' })}>
          Guardar como homebrew
        </button>
      </div>
      {systems.status === 'loading' && <Loading />}
      {systems.status === 'error' && (
        <div role="alert" className="text-[13px] text-red-400">
          <p className="mb-2">No pudimos cargar los homebrew.</p>
          <button type="button" className={btnSecondary} onClick={systems.refresh}>
            Reintentar
          </button>
        </div>
      )}
      {systems.status === 'ready' && mine.length === 0 && <p className="text-[13px] text-txt-muted">Todavía no guardaste ningún homebrew de esta campaña.</p>}
      {mine.length > 0 && (
        <ul className="flex flex-col gap-2">
          {mine.map((s) => {
            const lineage = lineageText(s, all)
            return (
              <li key={s.id} className="bg-bg-card border border-border-base px-4 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-exo text-[12px] font-semibold text-txt-primary tracking-[0.04em] break-words">{s.name}</p>
                  <p className="text-[12px] text-txt-muted">{`Creado el ${systemDate(s.created_at)}`}</p>
                  {lineage && <p className="text-[12px] text-txt-muted">{lineage}</p>}
                </div>
                {s.owner_id === user?.id && (
                  <button type="button" className={btnSecondary} aria-label={`Renombrar ${s.name}`} onClick={() => setDialog({ kind: 'rename', id: s.id, name: s.name })}>
                    <Pencil size={13} aria-hidden="true" />
                    Renombrar
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {dialog?.kind === 'branch' && (
        <SystemNameDialog
          title="Guardar como homebrew"
          fallback="No se pudo guardar el homebrew. Intentá de nuevo."
          onSubmit={async (name) => {
            await layer.systems.branchSystem(campaignId, name)
            systems.refresh()
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'rename' && (
        <SystemNameDialog
          title="Renombrar homebrew"
          initial={dialog.name}
          fallback="No se pudo renombrar el homebrew. Intentá de nuevo."
          onSubmit={async (name) => {
            await layer.systems.renameSystem(dialog.id, name)
            systems.refresh()
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}
