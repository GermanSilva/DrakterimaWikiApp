import { useState } from 'react'
import { useSessionScreenPort } from '../../../ports'
import { exactEqual } from '../../../helpers/pjSections'
import { btnSecondary } from '../../../constants'
import SessionCardShell from './SessionCardShell'
import PJSubsection from './PJSubsection'
import EmptyPjsState from './EmptyPjsState'

export default function SessionCardResources({ db, onEdit, onRemove }) {
  const port = useSessionScreenPort()
  const pjs = db?.pjs ?? []
  const [collapsedIds, setCollapsedIds] = useState(() => new Set(pjs.map(pj => pj.id)))
  const allExpanded = pjs.length > 0 && pjs.every(pj => !collapsedIds.has(pj.id))
  const toggleAll = () => setCollapsedIds(allExpanded ? new Set(pjs.map(pj => pj.id)) : new Set())
  const toggleOne = (pjId) => setCollapsedIds(prev => {
    const next = new Set(prev)
    next.has(pjId) ? next.delete(pjId) : next.add(pjId)
    return next
  })

  function rest(pj, kind) {
    const recursos = (pj.recursos ?? []).map(r =>
      (kind === 'largo' || r.recuperacion === 'corto') ? { ...r, actual: r.maximo } : r
    )
    // Only the fields a rest changes are written (never the whole character).
    const patch = { recursos }
    if (kind === 'largo') {
      patch.spell_slots_current = { ...(pj.spell_slots ?? {}) }
      patch.stat_hp_current = pj.stat_hp
    }
    // Skip what the rest does not change (a no-op rest writes nothing and does not stamp the sheet as updated).
    const effective = { ...pj, stat_hp_current: pj.stat_hp_current ?? pj.stat_hp }
    const changed = Object.fromEntries(Object.entries(patch).filter(([k, v]) => !exactEqual(effective[k], v)))
    if (Object.keys(changed).length === 0) return
    port.savePj(pj, changed)
  }

  return (
    <SessionCardShell title="Recursos" onRemove={onRemove} onToggleAll={pjs.length > 0 ? toggleAll : undefined} allExpanded={allExpanded}>
      {pjs.length === 0 ? (
        <EmptyPjsState />
      ) : (
        <div className="space-y-3">
          {pjs.map(pj => {
            const recursos = pj.recursos ?? []
            return (
              <PJSubsection key={pj.id} pj={pj} onEdit={onEdit} collapsed={collapsedIds.has(pj.id)} onToggleCollapsed={() => toggleOne(pj.id)}>
                {recursos.length === 0 ? (
                  <div className="text-[11px] text-txt-muted mb-2">Sin recursos registrados.</div>
                ) : (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {recursos.map(r => (
                      <div key={r.id} className="border border-border-base px-3 py-1.5 text-center min-w-[70px]">
                        <div className="font-exo text-[9px] text-txt-muted uppercase truncate max-w-[110px]">{r.nombre}</div>
                        <div className="font-exo text-[13px] font-semibold text-txt-primary">{r.actual}/{r.maximo}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="absolute right-[90px] top-1 flex gap-2">
                  <button type="button" className={btnSecondary} onClick={() => rest(pj, 'corto')}>Descanso Corto</button>
                  <button type="button" className={btnSecondary} onClick={() => rest(pj, 'largo')}>Descanso Largo</button>
                </div>
              </PJSubsection>
            )
          })}
        </div>
      )}
    </SessionCardShell>
  )
}
