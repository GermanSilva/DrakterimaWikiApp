import { useState } from 'react'
import SessionCardShell from './SessionCardShell'
import PJSubsection from './PJSubsection'
import EmptyPjsState from './EmptyPjsState'
import SpellDetailModal from '../../pj/detail/SpellDetailModal'

export default function SessionCardSpells({ db, onEdit }) {
  const pjs = db?.pjs ?? []
  const [selectedSpell, setSelectedSpell] = useState(null)

  return (
    <SessionCardShell title="Hechizos">
      {pjs.length === 0 ? (
        <EmptyPjsState />
      ) : (
        <div className="space-y-3">
          {pjs.map(pj => {
            const hechizos = pj.hechizos ?? []
            return (
              <PJSubsection key={pj.id} pj={pj} onEdit={onEdit}>
                {hechizos.length === 0 ? (
                  <div className="text-[11px] text-txt-muted">Sin hechizos registrados.</div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {hechizos.map(h => {
                      const isPrepared = h.preparado || Number(h.nivel) === 0 || Number(h.nivel) === 10
                      return (
                        <button
                          key={h.id}
                          type="button"
                          onClick={() => setSelectedSpell(h)}
                          className={`px-2 py-0.5 text-[11px] border cursor-pointer transition-colors ${
                            isPrepared
                              ? 'bg-accent text-white border-accent hover:bg-accent-bright'
                              : 'bg-bg-mid border-border-base text-txt-secondary hover:border-accent-dim'
                          }`}
                        >
                          {h.nombre}
                        </button>
                      )
                    })}
                  </div>
                )}
              </PJSubsection>
            )
          })}
        </div>
      )}
      {selectedSpell && <SpellDetailModal spell={selectedSpell} onClose={() => setSelectedSpell(null)} />}
    </SessionCardShell>
  )
}
