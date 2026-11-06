import { useMemo } from 'react'
import { ConflictError, DataError, type FlatEntity } from '../../../../data'
import type { ActionSource, SessionActions } from '../../../../pages/session/actions/sessionActions'
import { useCampaignServices } from '../../../entities/campaignServicesContext'
import { describeDataError } from '../../../entities/errorMessages'
import { useToast } from '../../../toastContext'
import type { Sheet } from '../../sheet/sheetModel'
import { describeFunctionError } from '../function/describeErrors'
import { runActionFunction } from '../function/run'
import { validateActionFunction } from '../function/validate'
import { notifyLinksChanged } from '../linkEvents'
import { habilidadTables } from '../tables'

/**
 * The session actions of the DM screen (S22) on top of the data layer. Writes go through the same repository calls as every
 * DM edit: the character through `saveEntityWithDmNotes` with the version just read as `base` (a stale base is a
 * ConflictError) and ONLY the touched keys, the link state through `updateLinkState` with the link version. The patch never
 * carries `sections_updated`: session buttons do not stamp the unread dot. `onSaved` receives the stored character.
 */
export function useSessionActionsHost(sheet: Sheet | null, onSaved: (entity: FlatEntity) => void): SessionActions | null {
  const { layer, campaignId } = useCampaignServices()
  const { showToast } = useToast()
  const enabled = sheet !== null && habilidadTables(sheet).length > 0

  return useMemo<SessionActions | null>(() => {
    if (!sheet || !enabled) return null
    return {
      repo: layer.actions,
      async read(pjId, actionId): Promise<ActionSource> {
        const [pj, linked] = await Promise.all([layer.entity('pjs').get(pjId), layer.actions.listLinkedActions(pjId)])
        const found = linked.find((l) => l.action.id === actionId)
        if (!pj) throw new DataError('not_found', `pjs/${pjId}: not found`)
        if (!found) throw new DataError('not_found', `pj_action_links/${pjId}/${actionId}: not found`)
        return { pj, linked: found }
      },
      parse(action) {
        const checked = validateActionFunction(action.function, sheet, action.table_key)
        return checked.ok ? { ok: true, fn: checked.fn } : { ok: false, errors: checked.errors.map(describeFunctionError) }
      },
      run: (fn, source, params) =>
        runActionFunction(fn, { sheet, pj: source.pj, link: { state: source.linked.link.state ?? {} }, params }),
      async apply(source, result) {
        const { pj, linked } = source
        const { patch } = result
        if (Object.keys(patch.pj).length === 0 && !patch.linkState) return { status: 'error', message: 'La acción no cambia nada.' }
        let wrotePj = false
        try {
          if (Object.keys(patch.pj).length > 0) {
            const saved = await layer.saveEntityWithDmNotes('pjs', { campaignId, id: pj.id, base: { updated_at: pj.updated_at } }, patch.pj)
            wrotePj = true
            onSaved(saved.entity)
          }
          if (patch.linkState) {
            await layer.actions.updateLinkState(pj.id, linked.action.id, patch.linkState, { base: { updated_at: linked.link.updated_at } })
            notifyLinksChanged(pj.id)
          }
          showToast('Acción aplicada')
          return { status: 'ok' }
        } catch (err) {
          // the character is already saved: offering to overwrite would apply the effects twice
          if (wrotePj) {
            console.error('Se aplicó al personaje pero falló el estado de la acción', err)
            return { status: 'error', message: 'Se aplicó al personaje, pero no se pudo guardar el estado de la acción. Revisá la ficha antes de repetirla.' }
          }
          if (err instanceof ConflictError) return { status: 'conflict' }
          console.error('No se pudo aplicar la acción', err)
          return { status: 'error', message: describeDataError(err, 'No se pudo aplicar la acción. Intentá de nuevo.') }
        }
      },
    }
  }, [sheet, enabled, layer, campaignId, onSaved, showToast])
}
