import { useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useAuth } from '../../../auth'
import { btnSecondary } from '../../../constants'
import type { Member } from '../../../data'
import { useCampaignServices } from '../../entities/campaignServicesContext'
import { useCampaignMembers } from '../../entities/useCampaignMembers'
import { useEntities } from '../../entities/useEntities'
import { useLoad } from '../../entities/useLoad'
import { Loading } from '../DetailNotice'
import { CharacterOwners } from './CharacterOwners'
import { MemberActionDialog, type MemberAction } from './MemberActionDialog'
import { memberName } from './memberMessages'
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
  const { user } = useAuth()
  const selfId = user?.id ?? null
  const [pending, setPending] = useState<{ action: MemberAction; member: Member } | null>(null)
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
              <th className="text-left py-2 pr-4 font-semibold">Última conexión</th>
              <th className="text-left py-2 font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ member, characters, lastSeen }) => (
              <tr key={member.user_id} className="border-b border-border-base/50">
                <td className="py-2 pr-4 font-semibold text-txt-primary">{member.profile?.display_name || 'Sin nombre'}</td>
                <td className="py-2 pr-4">{member.role === 'dm' ? 'DM' : 'Jugador'}</td>
                <td className="py-2 pr-4">{characters.length > 0 ? characters.join(', ') : <span className="text-txt-muted">—</span>}</td>
                <td className="py-2 pr-4">
                  {presence.status === 'ready' ? <LastSeen iso={lastSeen} now={now} /> : <span className="text-txt-muted">—</span>}
                </td>
                <td className="py-2">
                  <div className="flex flex-wrap gap-2">
                    {member.role === 'dm' ? (
                      <button
                        type="button"
                        className={btnSecondary}
                        aria-label={member.user_id === selfId ? 'Dejar de ser DM' : `Pasar a jugador a ${memberName(member)}`}
                        onClick={() => setPending({ action: 'demote', member })}
                      >
                        {member.user_id === selfId ? 'Dejar de ser DM' : 'Pasar a jugador'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={btnSecondary}
                        aria-label={`Nombrar DM a ${memberName(member)}`}
                        onClick={() => setPending({ action: 'promote', member })}
                      >
                        Nombrar DM
                      </button>
                    )}
                    {member.user_id !== selfId && (
                      <button
                        type="button"
                        className={btnSecondary}
                        aria-label={`Sacar a ${memberName(member)} de la campaña`}
                        onClick={() => setPending({ action: 'remove', member })}
                      >
                        Sacar
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="font-exo text-[10px] font-medium tracking-[0.2em] uppercase text-txt-muted mt-4">Dueños de los personajes</h3>
      <p className="text-[12px] text-txt-secondary">Elegí quién juega cada personaje. Solo pueden ser dueños los integrantes de la campaña.</p>
      <CharacterOwners members={members.data ?? []} />

      {pending && (
        <MemberActionDialog
          action={pending.action}
          member={pending.member}
          selfId={selfId}
          onDone={() => {
            setPending(null)
            members.refresh()
          }}
          onClose={() => setPending(null)}
        />
      )}
    </div>
  )
}
