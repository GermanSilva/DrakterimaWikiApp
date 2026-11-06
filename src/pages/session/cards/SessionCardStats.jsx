import { useState } from 'react'
import { ABILITY_SCORES } from '../../pj/pjConstants'
import { abilityMod, passivePerception, suggestedProfBonus } from '../../../helpers/pjCalc'
import { roleKeys, roleValues, sheetKeys } from '../../../campaign/system/sheet/roles'
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

export default function SessionCardStats({ db, sheet = null, onEdit, onRemove }) {
  const pjs = db?.pjs ?? []
  const bound = roleKeys(sheet)
  const stored = sheet ? sheetKeys(sheet) : null
  const abilities = ABILITY_SCORES.filter(({ key }) => !stored || stored.has(key))
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
            const roles = roleValues(sheet, pj)
            const profBonus = pj.stat_proficiency_bonus ?? suggestedProfBonus(pj.nivel ?? 1)
            return (
              <PJSubsection key={pj.id} pj={pj} onEdit={onEdit} fullViewToggle collapsed={collapsedIds.has(pj.id)} onToggleCollapsed={() => toggleOne(pj.id)}>
                {({ fullView }) => (
                  <div className='flex gap-2'>
                    <div className="flex flex-wrap gap-1.5">
                      {abilities.map(({ label, key, color }) => (
                        <div key={key} className="text-center bg-bg-mid border border-border-base px-2 py-1 min-w-[44px]" style={{ borderBottom: `3px solid ${color}` }} >
                          <div className="font-exo text-[12px] text-txt-muted uppercase">{label}</div>
                          <div className="font-exo text-[16px] font-bold text-txt-primary">{abilityMod(pj[key] ?? 10)}</div>
                        </div>
                      ))}
                    </div>
                    {fullView && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {roles.hp > 0 && <MiniStat label="HP" value={`${roles.hp_current ?? roles.hp} / ${roles.hp}${bound.hp !== undefined && pj.stat_hp_temp > 0 ? ` (+${pj.stat_hp_temp})` : ''}`} />}
                        {roles.ac > 0 && <MiniStat label="CA" value={`${roles.ac}${bound.ac !== undefined && pj.stat_ac_temp > 0 ? ` (+${pj.stat_ac_temp})` : ''}`} />}
                        {roles.speed > 0 && <MiniStat label="Vel." value={`${roles.speed} ft`} />}
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
