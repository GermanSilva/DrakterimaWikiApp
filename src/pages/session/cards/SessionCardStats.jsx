import { useState } from 'react'
import { ABILITY_SCORES } from '../../pj/pjConstants'
import { abilityMod, passivePerception, suggestedProfBonus } from '../../../helpers/pjCalc'
import SessionCardShell from './SessionCardShell'
import PJSubsection from './PJSubsection'
import EmptyPjsState from './EmptyPjsState'

function MiniStat({ label, value, accent }) {
  return (
    <div className="text-center bg-bg-mid border border-border-base px-2 py-1 min-w-[48px]">
      <div className="font-exo text-[12px] text-txt-muted uppercase">{label}</div>
      <div className={`font-exo text-[16px] font-bold ${accent ? 'text-accent-dim' : 'text-txt-primary'}`}>{value}</div>
    </div>
  )
}

export default function SessionCardStats({ db, onEdit, onRemove }) {
  const pjs = db?.pjs ?? []
  const [collapsedIds, setCollapsedIds] = useState(() => new Set(pjs.map(pj => pj.id)))
  const allExpanded = pjs.length > 0 && pjs.every(pj => !collapsedIds.has(pj.id))
  const toggleAll = () => setCollapsedIds(allExpanded ? new Set(pjs.map(pj => pj.id)) : new Set())
  const toggleOne = (pjId) => setCollapsedIds(prev => {
    const next = new Set(prev)
    next.has(pjId) ? next.delete(pjId) : next.add(pjId)
    return next
  })

  return (
    <SessionCardShell title="Stats" onRemove={onRemove} onToggleAll={pjs.length > 0 ? toggleAll : undefined} allExpanded={allExpanded}>
      {pjs.length === 0 ? (
        <EmptyPjsState />
      ) : (
        <div className="space-y-3">
          {pjs.map(pj => {
            const profBonus = pj.stat_proficiency_bonus ?? suggestedProfBonus(pj.nivel ?? 1)
            return (
              <PJSubsection key={pj.id} pj={pj} onEdit={onEdit} fullViewToggle collapsed={collapsedIds.has(pj.id)} onToggleCollapsed={() => toggleOne(pj.id)}>
                {({ fullView }) => (
                  <div className='flex gap-2'>
                    <div className="flex flex-wrap gap-1.5">
                      {ABILITY_SCORES.map(({ label, key, color }) => (
                        <div key={key} className="text-center bg-bg-mid border border-border-base px-2 py-1 min-w-[44px]" style={{ borderBottom: `3px solid ${color}` }} >
                          <div className="font-exo text-[12px] text-txt-muted uppercase">{label}</div>
                          <div className="font-exo text-[16px] font-bold text-txt-primary">{abilityMod(pj[key] ?? 10)}</div>
                        </div>
                      ))}
                    </div>
                    {fullView && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {pj.stat_hp > 0 && <MiniStat label="HP" value={`${pj.stat_hp_current ?? pj.stat_hp} / ${pj.stat_hp}`} />}
                        {pj.stat_ac > 0 && <MiniStat label="CA" value={`${pj.stat_ac}`} />}
                        {pj.stat_speed > 0 && <MiniStat label="Vel." value={`${pj.stat_speed} ft`} />}
                        <MiniStat label="Bono Prof." value={`+${profBonus}`} accent />
                        <MiniStat label="Perc. Pasiva" value={passivePerception(pj)} />
                      </div>
                    )}
                  </div>
                )}
              </PJSubsection>
            )
          })}
        </div>
      )}
    </SessionCardShell>
  )
}
