import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ConflictError } from '../../data'
import type { SessionCardEntry } from '../../ports'
import { describeDataError } from '../entities/errorMessages'
import { useCampaignServices } from '../entities/campaignServicesContext'
import { useToast } from '../toastContext'

export const SESSION_SCREEN_KEY = 'session_screen'
/** A layout bigger than this (JSON, in BYTES) is refused before the write, unless the change makes it smaller. */
export const MAX_LAYOUT_BYTES = 512_000
/** Waits (ms) between automatic retries of a failed write; after the last one the edits stay queued for the next change. */
export const retryPolicy = { delays: [1000, 2000, 4000] }
/** A conflict is re-merged and re-sent this many times before giving up (the layout keeps changing under us). */
const MAX_CONFLICTS = 3

export type SessionLayoutStatus = 'loading' | 'ready' | 'error'

export interface SessionLayout {
  status: SessionLayoutStatus
  /** The raw ordered `cards[]` (obsolete types included: the screen filters them and self-heals on reorder). */
  cards: SessionCardEntry[]
  /**
   * Applies `updater` to the LATEST cards (optimistically) and persists the result. Returns false when the change was
   * refused (layout not loaded yet, or it would grow past the size limit): the caller must not treat it as saved.
   */
  update(updater: (cards: SessionCardEntry[]) => SessionCardEntry[]): boolean
  reload(): void
}

/** Entries that cannot be rendered or reordered (no numeric id / string type) are dropped at read time. */
export function parseCards(value: unknown): SessionCardEntry[] {
  const cards = (value as { cards?: unknown } | null | undefined)?.cards
  if (!Array.isArray(cards)) return []
  return cards.filter(
    (c): c is SessionCardEntry => !!c && typeof c === 'object' && Number.isFinite((c as { id?: unknown }).id) && typeof (c as { tipo?: unknown }).tipo === 'string',
  )
}

const encoder = new TextEncoder()
const sizeOf = (cards: SessionCardEntry[]) => encoder.encode(JSON.stringify({ cards })).length
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Three-way merge after a conflict. The server's list (order, membership) wins: structural edits (add / remove /
 * reorder) are cheap to repeat and the toast says so. What is NOT cheap to repeat is the state a card keeps in its own
 * entry (notes text, combatants): an entry the user changed since the last synced version keeps their version.
 */
export function mergeAfterConflict(server: SessionCardEntry[], local: SessionCardEntry[], synced: SessionCardEntry[]): SessionCardEntry[] {
  return server.map((s) => {
    const l = local.find((c) => c.id === s.id)
    const base = synced.find((c) => c.id === s.id)
    return l && base && !same(l, base) ? l : s
  })
}

/**
 * The DM session screen layout: `campaign_config` key `session_screen` (DM-only by RLS).
 *
 * - The cards live in a ref so quick successive changes (a note blur right before a drag) compose on the latest list.
 * - Writes are serialised and coalesced: ONE loop drains `dirty`, always sending the newest list, guarded by the
 *   `updated_at` the previous response returned (config.patch `base`). The loop keeps draining after the page unmounts
 *   (`alive` only gates toasts and state), so a late edit is never dropped.
 * - A failed write keeps the local edits queued and retries with a backoff; they are never replaced by a reload.
 * - A conflict (another tab changed the layout) reloads the stored layout and re-applies the local card state on
 *   top of it (`mergeAfterConflict`), then writes again with the fresh version.
 * - The page does not subscribe to realtime: another tab's change is detected by the base guard.
 */
export function useSessionLayout(enabled: boolean): SessionLayout {
  const { layer, campaignId } = useCampaignServices()
  const { showToast } = useToast()
  const [status, setStatus] = useState<SessionLayoutStatus>('loading')
  const [cards, setCards] = useState<SessionCardEntry[]>([])
  const statusRef = useRef<SessionLayoutStatus>('loading')
  const cardsRef = useRef<SessionCardEntry[]>([])
  const syncedRef = useRef<SessionCardEntry[]>([]) // the cards as last confirmed by the server
  const baseRef = useRef<string | null>(null)
  const dirty = useRef(false)
  const flushing = useRef(false)
  const loadGen = useRef(0) // only invalidates answers of an older explicit (re)load
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const setLive = useCallback((next: SessionLayoutStatus) => {
    statusRef.current = next
    if (alive.current) setStatus(next)
  }, [])

  const publish = useCallback((next: SessionCardEntry[]) => {
    cardsRef.current = next
    if (alive.current) setCards(next)
  }, [])

  const load = useCallback(async () => {
    const mine = ++loadGen.current
    setLive('loading')
    try {
      const row = await layer.config.get(campaignId, SESSION_SCREEN_KEY)
      if (mine !== loadGen.current) return
      baseRef.current = row?.updated_at ?? null
      syncedRef.current = parseCards(row?.value)
      dirty.current = false
      publish(syncedRef.current)
      setLive('ready')
    } catch (err) {
      if (mine !== loadGen.current) return
      console.error('No se pudo cargar la pantalla de sesión', err)
      setLive('error')
    }
  }, [layer, campaignId, setLive, publish])

  useEffect(() => {
    if (!enabled) return undefined
    // Initial load of the layout row (external system -> state), also after a campaign switch.
    void load()
    return () => {
      loadGen.current += 1
    }
  }, [enabled, load])

  const notify = useCallback(
    (message: string) => {
      if (alive.current) showToast(message, 'error')
    },
    [showToast],
  )

  /** The conflict path: reload the stored layout and put the local card state back on top of it. */
  const resolveConflict = useCallback(async () => {
    const row = await layer.config.get(campaignId, SESSION_SCREEN_KEY)
    const server = parseCards(row?.value)
    const merged = mergeAfterConflict(server, cardsRef.current, syncedRef.current)
    baseRef.current = row?.updated_at ?? null
    syncedRef.current = server
    publish(merged)
    dirty.current = !same(merged, server) // only a kept local card state is worth writing again
  }, [layer, campaignId, publish])

  const flush = useCallback(async () => {
    if (flushing.current) return
    flushing.current = true
    let conflicts = 0
    let failures = 0
    try {
      while (dirty.current) {
        const snapshot = cardsRef.current
        dirty.current = false
        try {
          const row = await layer.config.patch(campaignId, SESSION_SCREEN_KEY, { cards: snapshot }, 'dm', baseRef.current)
          baseRef.current = row.updated_at
          syncedRef.current = snapshot
          failures = 0
          conflicts = 0
        } catch (err) {
          dirty.current = true // nothing is lost: the newest list is sent again
          if (err instanceof ConflictError) {
            conflicts += 1
            if (conflicts > MAX_CONFLICTS) {
              dirty.current = false
              notify('La pantalla de sesión sigue cambiando desde otro lugar. Recargá la página y repetí tu cambio.')
              return
            }
            notify('La pantalla de sesión cambió en otra pestaña o dispositivo. La recargamos y conservamos tus notas y combate; repetí los demás cambios.')
            try {
              await resolveConflict()
            } catch (reloadErr) {
              console.error('No se pudo recargar la pantalla de sesión', reloadErr)
              dirty.current = true
              await sleep(retryPolicy.delays[0] ?? 0)
            }
            continue
          }
          console.error('No se pudo guardar la pantalla de sesión', err)
          const delay = retryPolicy.delays[failures]
          failures += 1
          if (delay === undefined) {
            notify(`${describeDataError(err, 'No se pudo guardar la pantalla de sesión.')} Tus cambios siguen en pantalla: se reintentan con el próximo cambio.`)
            return // `dirty` stays true: the next update() starts the loop again
          }
          await sleep(delay)
        }
      }
    } finally {
      flushing.current = false
    }
  }, [layer, campaignId, notify, resolveConflict])

  const update = useCallback<SessionLayout['update']>(
    (updater) => {
      if (statusRef.current !== 'ready') {
        notify('La pantalla de sesión todavía se está cargando. Probá de nuevo en un momento.')
        return false
      }
      const current = cardsRef.current
      const next = updater(current)
      if (next === current) return true
      const size = sizeOf(next)
      if (size > MAX_LAYOUT_BYTES && size > sizeOf(current)) {
        notify('La pantalla de sesión es demasiado grande. Quitá notas o combatientes antes de agregar más.')
        return false
      }
      publish(next)
      dirty.current = true
      void flush()
      return true
    },
    [flush, notify, publish],
  )

  const reload = useCallback(() => void load(), [load])
  return useMemo(() => ({ status, cards, update, reload }), [status, cards, update, reload])
}
