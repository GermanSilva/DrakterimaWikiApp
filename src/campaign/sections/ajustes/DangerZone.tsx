import { useEffect, useId, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router'
import { btnDanger, inputCls, labelCls } from '../../../constants'
import { useCampaign } from '../../CampaignContext'
import { useCampaignServices } from '../../entities/campaignServicesContext'
import { ConfirmDialog } from './ConfirmDialog'
import { memberErrorMessage } from './memberMessages'

/** Where the hub shows "deleted" after the redirect (router state, not the URL). */
export interface CampaignDeletedState {
  campaignDeleted: string
}

function DeleteDialog({ onClose }: { onClose: () => void }) {
  const { campaign } = useCampaign()
  const { layer, campaignId } = useCampaignServices()
  const navigate = useNavigate()
  const inputId = useId()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  async function confirm() {
    if (started.current || typed.trim() !== campaign.slug) return
    started.current = true
    setBusy(true)
    setError(null)
    try {
      await layer.campaigns.deleteCampaign(campaignId, typed.trim())
      const state: CampaignDeletedState = { campaignDeleted: campaign.name }
      navigate('/', { replace: true, state })
    } catch (err) {
      if (mounted.current) setError(memberErrorMessage(err, 'No se pudo borrar la campaña. Intentá de nuevo.'))
    } finally {
      started.current = false
      if (mounted.current) setBusy(false)
    }
  }

  return (
    <ConfirmDialog
      title="Borrar campaña"
      confirmLabel="Borrar para siempre"
      busyLabel="Borrando…"
      busy={busy}
      error={error}
      confirmDisabled={typed.trim() !== campaign.slug}
      onConfirm={confirm}
      onClose={onClose}
    >
      <p role="note" className="text-[13px] text-accent-bright border border-accent-dim px-3 py-2">
        Esto borra «{campaign.name}» para todos: personajes, PNJs, lugares, sesiones, mapas, notas, invitaciones y registros de juegos. No se puede
        deshacer. Las cuentas de los integrantes no se borran.
      </p>
      <div>
        <label htmlFor={inputId} className={labelCls}>
          Para confirmar, escribí <strong className="text-txt-primary font-mono normal-case tracking-normal">{campaign.slug}</strong>
        </label>
        <input
          id={inputId}
          className={inputCls}
          value={typed}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          onChange={(e) => setTyped(e.target.value)}
        />
      </div>
    </ConfirmDialog>
  )
}

/** DM only: the irreversible actions of the campaign. */
export function DangerZone() {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-bg-card border border-accent-dim px-5 py-4 flex items-center justify-between gap-6">
      <div>
        <div className="font-exo text-[12px] font-semibold text-txt-primary tracking-[0.04em] uppercase mb-0.5">Borrar la campaña</div>
        <div className="text-[12px] text-txt-secondary">
          Elimina la campaña y todo su contenido de forma permanente. Si solo querés dejar de ser DM, nombrá a otro DM y pasate a jugador desde «Jugadores».
        </div>
      </div>
      <button type="button" className={btnDanger} onClick={() => setOpen(true)}>
        <Trash2 size={13} aria-hidden="true" />
        Borrar campaña…
      </button>
      {open && <DeleteDialog onClose={() => setOpen(false)} />}
    </div>
  )
}
