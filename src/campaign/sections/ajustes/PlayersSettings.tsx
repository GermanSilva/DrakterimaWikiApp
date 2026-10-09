import { useMemo } from 'react'
import { RefreshCw } from 'lucide-react'
import { btnSecondary } from '../../../constants'
import type { Member } from '../../../data'
import { useCampaignServices } from '../../entities/campaignServicesContext'
import { useCampaignMembers } from '../../entities/useCampaignMembers'
import { useEntities } from '../../entities/useEntities'
import { useLoad } from '../../entities/useLoad'
import { Loading } from '../DetailNotice'
import { describeLastSeen } from './presenceFormat'

function LastSeen({ iso, now }: { iso: string | undefined; now: Date }) {
  const seen = iso ? describeLastSeen(iso, now) : null
  if (!seen) return <span className="text-txt-muted italic">Nunca</span>
  return (
    <time dateTime={iso} title={seen.absolute}>
      {seen.relative}
    </time>
  )
}

const roleOrder = (m: Member) => (m.role === 'dm' ? 0 : 1)

/** Members of the campaign with their character and LAST CONNECTION. DM only (presence rows are DM-only in RLS). */
export function PlayersSettings() {
  const { layer, campaignId } = useCampaignServices()
  const members = useCampaignMembers()
  const presence = useLoad(() => layer.presence.list(campaignId), `presence:${campaignId}`)
  const pjs = useEntities('pjs')

  const rows = useMemo(() => {
    const seenAt = new Map((presence.data ?? []).map((p) => [p.user_id, p.last_seen_at]))
    return [...(members.data ?? [])]
      .sort((a, b) => roleOrder(a) - roleOrder(b)) // stable: join order within each role
      .map((m) => ({
        member: m,
        characters: pjs.items.filter((p) => p.owner_id === m.user_id).map((p) => String(p.nombre ?? `Personaje #${p.id}`)),
        lastSeen: seenAt.get(m.user_id),
      }))
  }, [members.data, presence.data, pjs.items])

  const refresh = () => {
    members.refresh()
    presence.refresh()
  }

  if (members.status === 'loading' || members.status === 'idle') return <Loading />
  if (members.status === 'error') {
    return (
      <div className="bg-bg-card border border-border-base px-5 py-4">
        <p role="alert" className="text-[13px] text-red-400 mb-3">
          No pudimos cargar la lista de jugadores.
        </p>
        <button type="button" className={btnSecondary} onClick={members.refresh}>
          Reintentar
        </button>
      </div>
    )
  }

  const now = new Date()
  const presenceFailed = presence.status === 'error'

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-txt-secondary">
        Como DM podés ver cuándo se conectó cada integrante por última vez a la campaña. Los jugadores no ven esta información, pero tienen que saber que
        existe.
      </p>
      {presenceFailed && (
        <p role="alert" className="text-[13px] text-red-400">
          No pudimos cargar las últimas conexiones.
        </p>
      )}
      <div className="flex justify-end">
        <button type="button" className={btnSecondary} onClick={refresh}>
          <RefreshCw size={13} aria-hidden="true" />
          Actualizar
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] text-txt-secondary border-collapse">
          <thead>
            <tr className="border-b border-border-base font-exo text-[10px] tracking-[0.15em] uppercase text-txt-muted">
              <th className="text-left py-2 pr-4 font-semibold">Nombre</th>
              <th className="text-left py-2 pr-4 font-semibold">Rol</th>
              <th className="text-left py-2 pr-4 font-semibold">Personaje</th>
              <th className="text-left py-2 font-semibold">Última conexión</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ member, characters, lastSeen }) => (
              <tr key={member.user_id} className="border-b border-border-base/50">
                <td className="py-2 pr-4 font-semibold text-txt-primary">{member.profile?.display_name || 'Sin nombre'}</td>
                <td className="py-2 pr-4">{member.role === 'dm' ? 'DM' : 'Jugador'}</td>
                <td className="py-2 pr-4">{characters.length > 0 ? characters.join(', ') : <span className="text-txt-muted">—</span>}</td>
                <td className="py-2">
                  {presenceFailed || presence.status === 'loading' ? <span className="text-txt-muted">—</span> : <LastSeen iso={lastSeen} now={now} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
