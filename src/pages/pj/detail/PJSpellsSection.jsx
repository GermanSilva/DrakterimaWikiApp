import { useState } from 'react'
import { sectionTitleCls, detailSectionCls } from '../../../constants'
import SpellDetailModal from './SpellDetailModal'

const SPELL_LEVELS = ['Trucos', 'Nivel 1', 'Nivel 2', 'Nivel 3', 'Nivel 4', 'Nivel 5', 'Nivel 6', 'Nivel 7', 'Nivel 8', 'Nivel 9', 'Habilidades']

export default function PJSpellsSection({ pj }) {
  const [selectedSpell, setSelectedSpell] = useState(null)
  const hechizos = pj.hechizos ?? []
  const slots = pj.spell_slots ?? {}
  const byLevel = {}
  hechizos.forEach(h => {
    const lvl = h.nivel ?? 0
    if (!byLevel[lvl]) byLevel[lvl] = []
    byLevel[lvl].push(h)
  })

  return (
    <div id="pj-section-hechizos" className={detailSectionCls}>
      <div className={sectionTitleCls}>Hechizos</div>

      {(pj.spell_dc > 0 || pj.spell_attack_bonus) && (
        <div className="flex gap-6 mb-4">
          {pj.spell_dc > 0 && (
            <div className="text-center">
              <div className="font-exo text-[10px] text-txt-muted mb-1">DC Conjuración</div>
              <div className="font-exo text-[20px] font-bold text-accent-dim">{pj.spell_dc}</div>
            </div>
          )}
          {pj.spell_attack_bonus !== undefined && pj.spell_attack_bonus !== 0 && (
            <div className="text-center">
              <div className="font-exo text-[10px] text-txt-muted mb-1">Bono Ataque</div>
              <div className="font-exo text-[20px] font-bold text-accent-dim">{pj.spell_attack_bonus >= 0 ? `+${pj.spell_attack_bonus}` : pj.spell_attack_bonus}</div>
            </div>
          )}
          {pj.spell_ability && (
            <div className="text-center">
              <div className="font-exo text-[10px] text-txt-muted mb-1">Atributo</div>
              <div className="font-exo text-[20px] font-bold text-accent-dim">{pj.spell_ability}</div>
            </div>
          )}
        </div>
      )}

      {Object.keys(slots).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(slots).map(([lvl, max]) => max > 0 && (
            <div key={lvl} className="border border-border-base px-3 py-1.5 text-center min-w-[52px]">
              <div className="font-exo text-[9px] text-txt-muted">Niv {lvl}</div>
              <div className="font-exo text-[13px] font-semibold text-txt-primary">{max}</div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {Object.keys(byLevel).sort((a, b) => a - b).map(lvl => (
          <div key={lvl}>
            <div className="font-exo text-[10px] text-txt-muted uppercase tracking-[0.15em] mb-1.5">
              {SPELL_LEVELS[lvl] ?? `Nivel ${lvl}`}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {byLevel[lvl].map(h => {
                const isPrepared = h.preparado || Number(h.nivel) === 0 || Number(h.nivel) === 10
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => setSelectedSpell(h)}
                    className={`px-2.5 py-1 text-[12px] border cursor-pointer transition-colors flex items-center gap-1 ${
                      isPrepared
                        ? 'bg-accent text-white border-accent hover:bg-accent-bright'
                        : 'bg-bg-mid border-border-base text-txt-secondary hover:border-accent-dim'
                    }`}
                  >
                    {h.nombre}
                    {h.concentracion && <span className="text-[10px] opacity-70 ml-0.5">C</span>}
                    {h.ritual && <span className="text-[10px] opacity-70 ml-0.5">R</span>}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {selectedSpell && (
        <SpellDetailModal spell={selectedSpell} onClose={() => setSelectedSpell(null)} />
      )}
    </div>
  )
}
