import { useState } from 'react'
import SessionCardShell from './SessionCardShell'
import PJSubsection from './PJSubsection'
import EmptyPjsState from './EmptyPjsState'
import SpellDetailModal from '../../pj/detail/SpellDetailModal'

const isPrepared = (h) => h.preparado || Number(h.nivel) === 0 || Number(h.nivel) === 10

export default function SessionCardSpells({ db, onEdit, onRemove }) {
  const pjs = db?.pjs ?? []
  const [selectedSpell, setSelectedSpell] = useState(null)

  return (
    <SessionCardShell title="Hechizos" onRemove={onRemove}>
      {pjs.length === 0 ? (
        <EmptyPjsState />
      ) : (
        <div className="space-y-3">
          {pjs.map(pj => {
            const hechizos = pj.hechizos ?? []
            return (
              <PJSubsection key={pj.id} pj={pj} onEdit={onEdit} fullViewToggle>
                {({ fullView }) => {
                  const visibleSpells = fullView ? hechizos : hechizos.filter(isPrepared)
                  return visibleSpells.length === 0 ? (
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
                          className={`px-2 py-0.5 text-[11px] border cursor-pointer transition-colors ${
                            isPrepared(h)
                              ? 'bg-accent text-white border-accent hover:bg-accent-bright'
                              : 'bg-bg-mid border-border-base text-txt-secondary hover:border-accent-dim'
                          }`}
                        >
                          {h.nombre}
                        </button>
                      ))}
                    </div>
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
