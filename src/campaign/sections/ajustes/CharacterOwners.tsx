import { useEffect, useRef, useState } from 'react'
import { inputCls } from '../../../constants'
import type { Member } from '../../../data'
import { useCampaignServices } from '../../entities/campaignServicesContext'
import { useEntities } from '../../entities/useEntities'
import { useToast } from '../../toastContext'
import { memberErrorMessage, memberName } from './memberMessages'

const NO_OWNER = ''

/**
 * Who plays each character: one select per character with the members of the campaign and "Sin dueño". The change
 * is saved on selection (members only: the database refuses anyone else) and answered with a toast. The select
 * shows the value just saved until the realtime list catches up.
 */
export function CharacterOwners({ members }: { members: Member[] }) {
  const { layer } = useCampaignServices()
  const pjs = useEntities('pjs')
  const { showToast } = useToast()
  // The value just saved per character, with the owner the list had then: it is shown until the list's own owner
  // changes (the realtime update arrived), after which the list is the truth again.
  const [saved, setSaved] = useState<Record<number, { value: string; from: string }>>({})
  const [busy, setBusy] = useState<ReadonlySet<number>>(new Set())
  const inFlight = useRef(new Set<number>())
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const characters = [...pjs.items].sort((a, b) => String(a.nombre ?? '').localeCompare(String(b.nombre ?? '')))
  if (characters.length === 0) {
    return <p className="text-[12px] text-txt-muted">Todavía no hay personajes en la campaña.</p>
  }

  async function assign(id: number, name: string, from: string, value: string) {
    if (inFlight.current.has(id)) return
    inFlight.current.add(id)
    setBusy(new Set(inFlight.current))
    try {
      await layer.campaigns.setPjOwner(id, value === NO_OWNER ? null : value)
      if (mounted.current) setSaved((s) => ({ ...s, [id]: { value, from } }))
      const owner = members.find((m) => m.user_id === value)
      showToast(owner ? `${name} ahora es de ${memberName(owner)}.` : `${name} quedó sin dueño.`)
    } catch (err) {
      showToast(memberErrorMessage(err, 'No se pudo cambiar el dueño del personaje. Intentá de nuevo.'), 'error')
    } finally {
      inFlight.current.delete(id)
      if (mounted.current) setBusy(new Set(inFlight.current))
    }
  }

  return (
    <ul className="flex flex-col gap-2 list-none p-0 m-0" aria-label="Dueños de los personajes">
      {characters.map((pj) => {
        const name = String(pj.nombre ?? `Personaje #${pj.id}`)
        const stored = typeof pj.owner_id === 'string' ? pj.owner_id : NO_OWNER
        const value = saved[pj.id]?.from === stored ? saved[pj.id].value : stored
        const known = value === NO_OWNER || members.some((m) => m.user_id === value)
        return (
          <li key={pj.id} className="grid grid-cols-[1fr_minmax(0,16rem)] items-center gap-3 text-[13px] text-txt-secondary">
            <span className="font-semibold text-txt-primary">{name}</span>
            <select
              aria-label={`Dueño de ${name}`}
              className={inputCls}
              value={value}
              disabled={busy.has(pj.id)}
              onChange={(e) => assign(pj.id, name, stored, e.target.value)}
            >
              <option value={NO_OWNER}>Sin dueño</option>
              {!known && <option value={value}>Ex integrante</option>}
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {memberName(m)}
                </option>
              ))}
            </select>
          </li>
        )
      })}
    </ul>
  )
}
