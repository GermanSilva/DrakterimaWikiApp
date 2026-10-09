import { useEffect, useRef, useState } from 'react'
import { DataError, type Member } from '../../../data'
import { useCampaign } from '../../CampaignContext'
import { useCampaignServices } from '../../entities/campaignServicesContext'
import { useToast } from '../../toastContext'
import { ConfirmDialog } from './ConfirmDialog'
import { memberErrorMessage, memberName } from './memberMessages'

export type MemberAction = 'promote' | 'demote' | 'remove'


function Body({ action, member, isSelf }: { action: MemberAction; member: Member; isSelf: boolean }) {
  const name = memberName(member)
  if (action === 'promote') {
    return (
      <>
        <p role="note" className="text-[13px] text-accent-bright border border-accent-dim px-3 py-2">
          Atención: {name} va a poder ver y editar todo el contenido de la campaña, incluidas las notas privadas y los secretos del DM, administrar a los
          integrantes (incluso quitarte el rol de DM o sacarte de la campaña) y borrar la campaña entera.
        </p>
        <p>Solo hacelo con alguien de máxima confianza.</p>
      </>
    )
  }
  if (action === 'demote') {
    return isSelf ? (
      <p role="note" className="text-[13px] text-accent-bright border border-accent-dim px-3 py-2">
        Vas a dejar de ser DM: perdés el acceso a Ajustes y a las notas privadas, y solo vas a ver lo que ven los jugadores. Solo otro DM puede
        devolverte el rol.
      </p>
    ) : (
      <p>
        {name} deja de ser DM: pierde el acceso a Ajustes y a las notas privadas, y pasa a ver solo lo que ven los jugadores. Sus personajes no cambian.
      </p>
    )
  }
  return (
    <>
      {member.role === 'dm' && (
        <p role="note" className="text-[13px] text-accent-bright border border-accent-dim px-3 py-2">
          Atención: {name} es DM de esta campaña. Si lo sacás, pierde el acceso a todo el contenido y a la administración.
        </p>
      )}
      <p>
        {name} sale de la campaña y sus personajes quedan sin dueño. Todo lo que creó se conserva. Puede volver a unirse con una invitación.
      </p>
    </>
  )
}

const TITLE: Record<MemberAction, string> = { promote: 'Nombrar DM', demote: 'Pasar a jugador', remove: 'Sacar de la campaña' }
const CONFIRM: Record<MemberAction, string> = { promote: 'Nombrar DM', demote: 'Pasar a jugador', remove: 'Sacar' }

/**
 * Confirms a role change or a removal and runs it. Failures (the last DM is protected by the database) stay in the
 * dialog; success closes it. When the DM demotes themselves the campaign context is reloaded, so the page drops
 * the DM-only sections at once.
 */
export function MemberActionDialog({ action, member, selfId, onDone, onClose }: { action: MemberAction; member: Member; selfId: string | null; onDone: () => void; onClose: () => void }) {
  const { layer, campaignId } = useCampaignServices()
  const { reload } = useCampaign()
  const { showToast } = useToast()
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
  const isSelf = member.user_id === selfId
  const name = memberName(member)

  async function confirm() {
    if (started.current) return
    started.current = true
    setBusy(true)
    setError(null)
    try {
      if (action === 'remove') await layer.campaigns.removeMember(campaignId, member.user_id)
      else await layer.campaigns.updateMemberRole(campaignId, member.user_id, action === 'promote' ? 'dm' : 'player')
      showToast(action === 'promote' ? `${name} ahora es DM.` : action === 'demote' ? `${name} ahora es jugador.` : `${name} salió de la campaña.`)
      if (action === 'demote' && isSelf) reload()
      onDone()
    } catch (err) {
      if (err instanceof DataError && err.kind === 'not_found' && action === 'remove') {
        showToast(`${name} ya no estaba en la campaña.`)
        onDone()
      } else if (mounted.current) {
        setError(memberErrorMessage(err, 'No se pudo completar el cambio. Intentá de nuevo.'))
      }
    } finally {
      started.current = false
      if (mounted.current) setBusy(false)
    }
  }

  return (
    <ConfirmDialog
      title={TITLE[action]}
      confirmLabel={CONFIRM[action]}
      busyLabel="Guardando…"
      busy={busy}
      error={error}
      onConfirm={confirm}
      onClose={onClose}
    >
      <Body action={action} member={member} isSelf={isSelf} />
    </ConfirmDialog>
  )
}
