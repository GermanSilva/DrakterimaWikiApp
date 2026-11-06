import { useEffect, useMemo, useRef } from 'react'
import { ConflictError, DataError, type FlatEntity, type LinkedAction } from '../../../../data'
import type { ActionSource, ApplyOutcome, HistoryItem, HistoryStore, SessionActions, UndoPlan } from '../../../../pages/session/actions/sessionActions'
import { useCampaignServices } from '../../../entities/campaignServicesContext'
import { describeDataError } from '../../../entities/errorMessages'
import { useToast } from '../../../toastContext'
import type { Sheet } from '../../sheet/sheetModel'
import { describeFunctionError } from '../function/describeErrors'
import { runActionFunction } from '../function/run'
import { planUndo, undoEntry } from '../function/undo'
import { validateActionFunction } from '../function/validate'
import type { Patch } from '../function/working'
import { notifyLinksChanged } from '../linkEvents'
import { habilidadTables } from '../tables'

/**
 * The session actions of the DM screen (S22) on top of the data layer. Writes go through the same repository calls as every
 * DM edit: the character through `saveEntityWithDmNotes` with the version just read as `base` (a stale base is a
 * ConflictError) and ONLY the touched keys, the link state through `updateLinkState` with the link version. The patch never
 * carries `sections_updated`: session buttons (and their undo) do not stamp the unread dot. `onSaved` receives the stored character.
 * The returned api keeps its identity while the sheet and the services do not change: the dialogs reload the character when it
 * changes, and a new history item (written by the very action they run) must not re-arm them. The history is a separate store.
 */
export function useSessionActionsHost(sheet: Sheet | null, onSaved: (entity: FlatEntity) => void): SessionActions | null {
  const { layer, campaignId } = useCampaignServices()
  const { showToast } = useToast()
  const enabled = sheet !== null && habilidadTables(sheet).length > 0
  const seq = useRef(0)
  // callbacks through refs: their identity may change on every render, the api's must not
  const onSavedRef = useRef(onSaved)
  const toastRef = useRef(showToast)
  useEffect(() => {
    onSavedRef.current = onSaved
    toastRef.current = showToast
  })
  const store = useMemo(() => {
    let items: HistoryItem[] = []
    const listeners = new Set<() => void>()
    return {
      get: () => items,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => void listeners.delete(listener)
      },
      update(change: (list: HistoryItem[]) => HistoryItem[]) {
        items = change(items)
        listeners.forEach((l) => l())
      },
    }
  }, [])
  const history: HistoryStore = store

  return useMemo<SessionActions | null>(() => {
    if (!sheet || !enabled) return null

    const read = async (pjId: number, actionId: number): Promise<{ pj: FlatEntity; linked: LinkedAction | null }> => {
      const [pj, linked] = await Promise.all([layer.entity('pjs').get(pjId), layer.actions.listLinkedActions(pjId)])
      if (!pj) throw new DataError('not_found', `pjs/${pjId}: not found`)
      return { pj, linked: linked.find((l) => l.action.id === actionId) ?? null }
    }

    /** Character first (the likelier conflict), then the link. `wrotePj` tells a failure of the second step from a clean one. */
    async function commit(pj: FlatEntity, linked: LinkedAction | null, patch: Patch, partialMessage: string): Promise<{ outcome: ApplyOutcome; wrotePj: boolean }> {
      let wrotePj = false
      try {
        if (Object.keys(patch.pj).length > 0) {
          const saved = await layer.saveEntityWithDmNotes('pjs', { campaignId, id: pj.id, base: { updated_at: pj.updated_at } }, patch.pj)
          wrotePj = true
          onSavedRef.current(saved.entity)
        }
        if (patch.linkState && linked) {
          await layer.actions.updateLinkState(pj.id, linked.action.id, patch.linkState, { base: { updated_at: linked.link.updated_at } })
          notifyLinksChanged(pj.id)
        }
        return { outcome: { status: 'ok' }, wrotePj }
      } catch (err) {
        // the character is already saved: offering to overwrite would apply the effects twice
        if (wrotePj) {
          console.error('Se guardó el personaje pero falló el estado de la acción', err)
          return { outcome: { status: 'partial', message: partialMessage }, wrotePj }
        }
        if (err instanceof ConflictError) return { outcome: { status: 'conflict' }, wrotePj }
        console.error('No se pudo guardar la acción', err)
        return { outcome: { status: 'error', message: describeDataError(err, 'No se pudo guardar. Intentá de nuevo.') }, wrotePj }
      }
    }

    return {
      repo: layer.actions,
      async read(pjId, actionId): Promise<ActionSource> {
        const { pj, linked } = await read(pjId, actionId)
        if (!linked) throw new DataError('not_found', `pj_action_links/${pjId}/${actionId}: not found`)
        return { pj, linked }
      },
      parse(action) {
        const checked = validateActionFunction(action.function, sheet, action.table_key)
        return checked.ok ? { ok: true, fn: checked.fn } : { ok: false, errors: checked.errors.map(describeFunctionError) }
      },
      run: (fn, source, params) => runActionFunction(fn, { sheet, pj: source.pj, link: { state: source.linked.link.state ?? {} }, params }),
      async apply(source, result) {
        const { patch } = result
        if (Object.keys(patch.pj).length === 0 && !patch.linkState) return { status: 'error', message: 'La acción no cambia nada.' }
        const { outcome, wrotePj } = await commit(source.pj, source.linked, patch, 'Se guardó el personaje, pero no se pudo guardar el estado de la acción. Revisá la ficha antes de repetir.')
        // what reached the character can be undone even when the link state did not follow
        const effects = outcome.status === 'ok' ? result.applied : wrotePj ? result.applied.filter((a) => a.target.type !== 'state') : []
        if (effects.length > 0) {
          seq.current += 1
          const item: HistoryItem = {
            id: seq.current,
            pjId: source.pj.id,
            pjName: String(source.pj.nombre ?? ''),
            actionId: source.linked.action.id,
            actionName: source.linked.action.name,
            entry: undoEntry(effects),
          }
          store.update((list) => [item, ...list])
        }
        if (outcome.status === 'ok') toastRef.current('Acción aplicada')
        return outcome
      },
      history,
      async planUndo(item): Promise<UndoPlan> {
        const { pj, linked } = await read(item.pjId, item.actionId)
        // an unlinked action has no state any more: only what the character holds can be undone
        const entry = linked ? item.entry : { effects: item.entry.effects.filter((e) => e.target.type !== 'state') }
        const planned = planUndo(entry, pj, { state: linked?.link.state ?? {} })
        return { pj, linked, patch: planned.patch, warnings: planned.warnings }
      },
      async undo(item, plan) {
        if (Object.keys(plan.patch.pj).length === 0 && !plan.patch.linkState) return { status: 'error', message: 'No hay nada que deshacer.' }
        if (plan.warnings.some((w) => w.kind === 'invalid_value')) return { status: 'error', message: 'Hay un valor que no es un número: corregilo en la ficha antes de deshacer.' }
        const { outcome } = await commit(plan.pj, plan.linked, plan.patch, 'Se deshizo en el personaje, pero no se pudo deshacer el estado de la acción. La acción sigue en la lista con esa parte pendiente.')
        if (outcome.status === 'ok') {
          store.update((list) => list.filter((h) => h.id !== item.id))
          toastRef.current('Acción deshecha')
        } else if (outcome.status === 'partial') {
          // the character part is done and must never be undone again: the item keeps only what is still pending
          const pending = item.entry.effects.filter((e) => e.target.type === 'state')
          store.update((list) => list.flatMap((h) => (h.id !== item.id ? [h] : pending.length > 0 ? [{ ...h, entry: { effects: pending } }] : [])))
        }
        return outcome
      },
      discard(item) {
        store.update((list) => list.filter((h) => h.id !== item.id))
      },
    }
  }, [sheet, enabled, layer, campaignId, store, history])
}
