import { useCallback, useMemo } from 'react'
import { DataError, type DmNotesFields, type DmNotesRow, type EntityTable, type FlatEntity } from '../../data'
import { useUnreadPort } from '../../ports'
import { useCampaign } from '../CampaignContext'
import { useToast } from '../toastContext'
import { useCampaignServices } from './campaignServicesContext'
import { describeDataError } from './errorMessages'
import { isDmNotesType } from './useDmNotes'

export interface WriteOptions {
  /** DM only. Character ids that may see a `secreto` entity (written through the visibility RPC). */
  visibleTo?: number[]
  /** DM only. `notas` / `secreto` / `ganchos`: stored in `entity_dm_notes`, never in the entity row. */
  dmNotes?: DmNotesFields
}

export interface UpdateOptions extends WriteOptions {
  /** The entity the caller edited: its `updated_at` is the optimistic version (conflict detection). */
  base?: Pick<FlatEntity, 'updated_at'> & Record<string, unknown>
  /**
   * The visibility the caller loaded (useVisibility). When given, the RPC is called only if
   * `visibleTo` differs from it; without it any `visibleTo` is written.
   */
  currentVisibleTo?: number[]
}

export interface SaveOutcome {
  entity: FlatEntity
  dmNotes: DmNotesRow | null
  /** Follow-up steps that failed after the entity was saved (already shown in a toast). */
  warnings: string[]
}

export interface EntityActions {
  /** Resolves to the outcome, or `null` after a toast when nothing (or not the entity) was saved. Never throws. */
  create(flat: Record<string, unknown>, options?: WriteOptions): Promise<SaveOutcome | null>
  update(id: number, patch: Record<string, unknown>, options?: UpdateOptions): Promise<SaveOutcome | null>
  /** Resolves true when deleted (or false after a toast). */
  remove(id: number): Promise<boolean>
}

const hasKeys = (o: object | undefined): o is object => !!o && Object.keys(o).length > 0

/** Same members regardless of order. */
export function sameIds(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false
  const sorted = [...b].sort((x, y) => x - y)
  return [...a].sort((x, y) => x - y).every((v, i) => v === sorted[i])
}

/**
 * Successor of `save` / `remove` for one entity table of the current campaign.
 *
 * - DM-private fields go to `entity_dm_notes` (saveEntityWithDmNotes), never to the entity row.
 * - `visible_to` is written only by a DM, only when it changed, and only through the RPC.
 * - Every failure is logged and shown as a typed, user-facing toast; the methods never throw, so a
 *   form can simply stay open when the result is `null`.
 * - A step that fails AFTER the entity row was saved (notes, visibility) does not hide the saved
 *   entity: the outcome carries `warnings` and a toast says what still has to be redone. In
 *   particular a failed follow-up of a CREATE never invites a retry that would create a duplicate.
 */
export function useEntityActions(table: EntityTable): EntityActions {
  const { isDM } = useCampaign()
  const { layer, campaignId, store } = useCampaignServices()
  const { showToast } = useToast()
  const unread = useUnreadPort()

  const fail = useCallback(
    (err: unknown, fallback: string) => {
      console.error(fallback, err)
      showToast(describeDataError(err, fallback), 'error')
    },
    [showToast],
  )

  const markSeen = useCallback(
    (entity: FlatEntity) => {
      // The saver has seen their own change. Bookkeeping: must never fail the save.
      try {
        unread.markRead(table, entity.id, entity.updated_at)
      } catch (err) {
        console.error('No se pudo marcar como leído', err)
      }
    },
    [unread, table],
  )

  /**
   * DM-only follow-ups of a SAVED entity, each isolated (a failure becomes a warning, the entity stays
   * saved): DM notes upsert and the visibility RPC (only when it changed). The RPC bumps the row's
   * updated_at, so after it the entity is re-read: the returned copy (and the optimistic base / unread
   * mark built from it) carries the fresh version. DM notes and visibility are not realtime, so the
   * entity's on-demand readers are invalidated.
   */
  const followUps = useCallback(
    async (entity: FlatEntity, options: UpdateOptions) => {
      const warnings: string[] = []
      let dmNotes: DmNotesRow | null = null
      let current = entity
      let wroteDetail = false
      if (isDM && hasKeys(options.dmNotes) && isDmNotesType(table)) {
        try {
          dmNotes = await layer.dmNotes.upsert(campaignId, table, entity.id, options.dmNotes)
          wroteDetail = true
        } catch (err) {
          console.error('No se pudieron guardar las notas del DM', err)
          warnings.push('No se pudieron guardar las notas del DM.')
        }
      }
      const visibleTo = options.visibleTo
      const visibilityChanged =
        isDM && visibleTo !== undefined && !(options.currentVisibleTo !== undefined && sameIds(visibleTo, options.currentVisibleTo))
      if (visibilityChanged && visibleTo) {
        try {
          await layer.visibility.setVisibility(table, entity.id, visibleTo)
          wroteDetail = true
          try {
            current = (await layer.entity(table).get(entity.id)) ?? entity
          } catch (err) {
            console.error('No se pudo releer la entidad', err) // keep the saved copy
          }
        } catch (err) {
          console.error('No se pudo guardar la visibilidad', err)
          warnings.push('No se pudo guardar quién puede verlo.')
        }
      }
      if (wroteDetail) store.invalidateDetail(table, entity.id)
      return { entity: current, dmNotes, warnings }
    },
    [isDM, layer, table, campaignId, store],
  )

  /** DM notes for a table that has none would be silently dropped: refuse before writing anything. */
  const rejectsDmNotes = useCallback(
    (options: WriteOptions) => {
      if (hasKeys(options.dmNotes) && !isDmNotesType(table)) {
        showToast('Este tipo de registro no tiene notas del DM.', 'error')
        return true
      }
      return false
    },
    [table, showToast],
  )

  const create = useCallback<EntityActions['create']>(
    async (flat, options = {}) => {
      if (rejectsDmNotes(options)) return null
      if (!isDM && (hasKeys(options.dmNotes) || options.visibleTo !== undefined)) {
        showToast('Solo el DM puede editar las notas y la visibilidad.', 'error')
        return null
      }
      let entity: FlatEntity
      try {
        // entity part only: a notes failure must not look like a failed create (retry = duplicate)
        entity = (await layer.saveEntityWithDmNotes(table, { campaignId }, flat)).entity
      } catch (err) {
        fail(err, 'No se pudo guardar. Intentá de nuevo.')
        return null
      }
      // nothing to grant on a brand-new entity that nobody may see yet
      const visibleTo = options.visibleTo && options.visibleTo.length > 0 ? options.visibleTo : undefined
      const done = await followUps(entity, { dmNotes: options.dmNotes, visibleTo })
      markSeen(done.entity)
      if (done.warnings.length > 0) {
        showToast(`Se creó, pero: ${done.warnings.join(' ')} Abrilo y volvé a guardar.`, 'error')
      } else {
        showToast('Guardado')
      }
      return done
    },
    [isDM, layer, table, campaignId, showToast, fail, followUps, markSeen, rejectsDmNotes],
  )

  const update = useCallback<EntityActions['update']>(
    async (id, patch, options = {}) => {
      if (rejectsDmNotes(options)) return null
      if (!isDM && (hasKeys(options.dmNotes) || options.visibleTo !== undefined)) {
        showToast('Solo el DM puede editar las notas y la visibilidad.', 'error')
        return null
      }
      let entity: FlatEntity
      try {
        // Entity row first, on its own: when this succeeds the row IS saved, whatever the follow-ups do.
        entity = (await layer.saveEntityWithDmNotes(table, { campaignId, id, base: options.base }, patch)).entity
      } catch (err) {
        fail(err, 'No se pudo guardar. Intentá de nuevo.')
        return null
      }
      const done = await followUps(entity, options)
      markSeen(done.entity)
      if (done.warnings.length > 0) {
        showToast(`Se guardó, pero: ${done.warnings.join(' ')} Volvé a guardar para reintentar.`, 'error')
      } else {
        showToast('Guardado')
      }
      return done
    },
    [isDM, layer, table, campaignId, showToast, fail, followUps, markSeen, rejectsDmNotes],
  )

  const remove = useCallback<EntityActions['remove']>(
    async (id) => {
      try {
        await layer.entity(table).remove(id)
      } catch (err) {
        // already gone counts as removed
        if (err instanceof DataError && err.kind === 'not_found') {
          showToast('Eliminado')
          return true
        }
        fail(err, 'No se pudo eliminar. Intentá de nuevo.')
        return false
      }
      showToast('Eliminado')
      return true
    },
    [layer, table, showToast, fail],
  )

  return useMemo(() => ({ create, update, remove }), [create, update, remove])
}
