import { useState } from 'react'
import SessionCardShell from './SessionCardShell'
import PJSubsection from './PJSubsection'
import EmptyPjsState from './EmptyPjsState'
import SpellDetailModal from '../../pj/detail/SpellDetailModal'

const isPrepared = (h) => h.preparado || Number(h.nivel) === 0 || Number(h.nivel) === 10

export default function SessionCardSpells({ db, onEdit, onRemove }) {
  const pjs = db?.pjs ?? []
  const [selectedSpell, setSelectedSpell] = useState(null)
  const [collapsedIds, setCollapsedIds] = useState(() => new Set(pjs.map(pj => pj.id)))
  const allExpanded = pjs.length > 0 && pjs.every(pj => !collapsedIds.has(pj.id))
  const toggleAll = () => setCollapsedIds(allExpanded ? new Set(pjs.map(pj => pj.id)) : new Set())
  const toggleOne = (pjId) => setCollapsedIds(prev => {
    const next = new Set(prev)
    next.has(pjId) ? next.delete(pjId) : next.add(pjId)
    return next
  })

  return (
    <SessionCardShell title="Hechizos" onRemove={onRemove} onToggleAll={pjs.length > 0 ? toggleAll : undefined} allExpanded={allExpanded}>
      {pjs.length === 0 ? (
        <EmptyPjsState />
      ) : (
        <div className="space-y-3">
          {pjs.map(pj => {
            const hechizos = [...(pj.hechizos ?? [])].sort((a, b) => a.nivel - b.nivel)
            const slots = pj.spell_slots ?? {}
            const slotEntries = Object.entries(slots).filter(([, max]) => max > 0)
            return (
              <PJSubsection key={pj.id} pj={pj} onEdit={onEdit} fullViewToggle collapsed={collapsedIds.has(pj.id)} onToggleCollapsed={() => toggleOne(pj.id)}>
                {({ fullView }) => {
                  const visibleSpells = fullView ? hechizos : hechizos.filter(isPrepared)
                  return (
                    <>
                      {slotEntries.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {slotEntries.map(([lvl, max]) => (
                            <div key={lvl} className="border border-border-base px-3 py-1.5 text-center min-w-[52px]">
                              <div className="font-exo text-[9px] text-txt-muted">Niv {lvl}</div>
                              <div className="font-exo text-[13px] font-semibold text-txt-primary">{pj.spell_slots_current?.[lvl] ?? max}/{max}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      {visibleSpells.length === 0 ? (
                        <div className="text-[11px] text-txt-muted">
                          {hechizos.length === 0 ? 'Sin hechizos registrados.' : 'Sin hechizos preparados.'}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {visibleSpells.map(h => (
                            <button
                              key={h.id}
                              type="button"
                              onClick={() => setSelectedSpell(h)}
                              className={`px-2 py-0.5 text-[11px] border cursor-pointer transition-colors ${isPrepared(h)
                                ? (h.nivel === 10 ? 'bg-purple-900 text-white border-purple-900 hover:bg-purple-800'
                                  : (h.nivel === 0 ? 'bg-blue-900 text-white border-blue-900 hover:bg-blue-800'
                                    : ('bg-accent text-white border-accent hover:bg-accent-bright')))
                                : 'bg-bg-mid border-border-base text-txt-secondary hover:border-accent-dim'
                                }`}
                            >
                              {h.nombre} {h.nivel === 0 || h.nivel === 10 ? '' : `[${h.nivel}]`}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )
                }}
              </PJSubsection>
            )
          })}
        </div>
      )}
      {selectedSpell && <SpellDetailModal spell={selectedSpell} onClose={() => setSelectedSpell(null)} />}
    </SessionCardShell>
  )
}
