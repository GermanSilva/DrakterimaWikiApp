import { useEffect, useMemo, useRef } from 'react'
import { exactEqual } from '../../helpers/pjSections'
import { btnSecondary } from '../../constants'
import type { FlatEntity } from '../../data'
import SessionScreenView from '../../pages/session/SessionScreenView'
import { useUnreadPort, type SessionScreenPort } from '../../ports'
import { useCampaign } from '../CampaignContext'
import { useCampaignServices } from '../entities/campaignServicesContext'
import { useEntities } from '../entities/useEntities'
import { useEntityActions } from '../entities/useEntityActions'
import { markSectionsSeen, pjSectionStamps } from '../pjStamps'
import { SectionNotFound } from '../SectionRoute'
import { Loading } from './DetailNotice'
import { useSessionLayout } from './useSessionLayout'

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="px-10 max-md:px-5">
      <h1 className="font-exo text-xl font-semibold tracking-[0.15em] uppercase text-txt-primary mb-3">No pudimos cargar la pantalla de sesión</h1>
      <p role="alert" className="text-sm text-txt-secondary mb-5">
        Hubo un problema de conexión. Volvé a intentar en unos segundos.
      </p>
      <button type="button" className={btnSecondary} onClick={onRetry}>
        Reintentar
      </button>
    </div>
  )
}

/**
 * Hub host of the DM session screen (`/c/:slug/sesion-en-vivo`). Mounted only for a DM: the data hooks live in the
 * inner component, so a player never even asks for `session_screen` (RLS is the backstop, not the gate).
 */
function SessionScreenHost() {
  const layout = useSessionLayout(true)
  const pjs = useEntities('pjs')
  const rules = useEntities('homebrew_rules')
  const pjActions = useEntityActions('pjs')
  const ruleActions = useEntityActions('homebrew_rules')
  const unread = useUnreadPort()

  // The port reads the latest lists through refs: its identity (and so every card) does not churn with realtime.
  // Rows this screen wrote: the row the server returned is the latest known version until the realtime echo
  // catches up, so a second action on the same character does not conflict with our own first write.
  const pjsRef = useRef<FlatEntity[]>(pjs.items)
  const ownWrites = useRef(new Map<number, FlatEntity>())
  useEffect(() => {
    pjsRef.current = pjs.items.map((p) => {
      const own = ownWrites.current.get(p.id)
      return own && Date.parse(own.updated_at ?? '') > Date.parse(p.updated_at ?? '') ? own : p
    })
  })
  const { update } = layout

  const port = useMemo<SessionScreenPort>(
    () => ({
      setCards: (updater) => update(updater),
      patchCard: (entryId, patch) =>
        update((cards) => (cards.some((c) => c.id === entryId) ? cards.map((c) => (c.id === entryId ? { ...c, ...patch } : c)) : cards)),
      async savePj(pj, patch) {
        const opened = pj as FlatEntity
        // Stamped against the character the DM was editing; the optimistic version is the latest row, so an edit of
        // another field made meanwhile merges (only the changed fields are sent) and only a true clash conflicts.
        const latest = pjsRef.current.find((p) => p.id === opened.id) ?? opened
        // If someone ELSE changed a field this patch touches since the DM opened the character, the guard must see
        // the version the DM actually worked from (a conflict), not silently overwrite the newer value. Our own
        // writes are not "someone else": when the latest row is the one we last wrote, the latest version is the base.
        const ours = ownWrites.current.get(opened.id)
        const ownLatest = !!ours && ours.updated_at === latest.updated_at
        const touchedByOthers = !ownLatest && Object.keys(patch).some((k) => !exactEqual(opened[k], latest[k]))
        const base = touchedByOthers ? opened : latest
        const stamped = pjSectionStamps(opened, patch)
        const payload = stamped.sections.length > 0 ? { ...patch, sections_updated: stamped.stamps } : patch
        const outcome = await pjActions.update(opened.id, payload, { base })
        if (!outcome) return false
        ownWrites.current.set(opened.id, outcome.entity)
        pjsRef.current = pjsRef.current.map((p) => (p.id === opened.id ? outcome.entity : p))
        markSectionsSeen(unread, outcome.entity.id, stamped)
        return true
      },
      async createRule(rule) {
        return (await ruleActions.create({ nombre: rule.nombre, texto: rule.texto })) !== null
      },
      async deleteRule(id) {
        if (!window.confirm('¿Eliminar este registro?')) return false
        return ruleActions.remove(id)
      },
    }),
    [update, pjActions, ruleActions, unread],
  )

  const db = useMemo(() => ({ pjs: pjs.items, homebrew_rules: rules.items }), [pjs.items, rules.items])

  if (layout.status === 'error') return <LoadFailed onRetry={layout.reload} />
  if (layout.status === 'loading' || pjs.loading || rules.loading) return <div className="px-10 max-md:px-5"><Loading /></div>
  if (pjs.error || rules.error) return <LoadFailed onRetry={() => { pjs.reload(); rules.reload() }} />
  return <SessionScreenView db={db} cards={layout.cards} port={port} />
}

/** `/c/:slug/sesion-en-vivo`: DM only (also a 404 for a player here, besides the registry's `dmOnly`). */
export function SesionEnVivoPage() {
  const { isDM } = useCampaign()
  const { campaignId } = useCampaignServices()
  if (!isDM) return <SectionNotFound />
  return <SessionScreenHost key={campaignId} />
}
