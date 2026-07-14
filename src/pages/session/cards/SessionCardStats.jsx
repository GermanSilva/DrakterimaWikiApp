import { ABILITY_SCORES } from '../../pj/pjConstants'
import { abilityMod, passivePerception, suggestedProfBonus } from '../../../helpers/pjCalc'
import SessionCardShell from './SessionCardShell'
import PJSubsection from './PJSubsection'
import EmptyPjsState from './EmptyPjsState'

function MiniStat({ label, value, accent }) {
  return (
    <div className="text-center bg-bg-mid border border-border-base px-2 py-1 min-w-[48px]">
      <div className="font-exo text-[9px] text-txt-muted uppercase">{label}</div>
      <div className={`font-exo text-[13px] font-bold ${accent ? 'text-accent-dim' : 'text-txt-primary'}`}>{value}</div>
    </div>
  )
}

export default function SessionCardStats({ db, onEdit, onRemove }) {
  const pjs = db?.pjs ?? []

  return (
    <SessionCardShell title="Stats" onRemove={onRemove}>
      {pjs.length === 0 ? (
        <EmptyPjsState />
      ) : (
        <div className="space-y-3">
          {pjs.map(pj => {
            const profBonus = pj.stat_proficiency_bonus ?? suggestedProfBonus(pj.nivel ?? 1)
            return (
              <PJSubsection key={pj.id} pj={pj} onEdit={onEdit} fullViewToggle>
                {({ fullView }) => (
                  <>
                    {fullView && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {pj.stat_hp > 0 && <MiniStat label="HP" value={pj.stat_hp} />}
                        {pj.stat_hp > 0 && <MiniStat label="HP Actual" value={pj.stat_hp_current ?? pj.stat_hp} />}
                        {pj.stat_ac > 0 && <MiniStat label="AC" value={pj.stat_ac} />}
                        {pj.stat_speed > 0 && <MiniStat label="Vel." value={`${pj.stat_speed} ft`} />}
                        <MiniStat label="Bono Prof." value={`+${profBonus}`} accent />
                        <MiniStat label="Perc. Pasiva" value={passivePerception(pj)} />
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {ABILITY_SCORES.map(({ label, key }) => (
                        <div key={key} className="text-center bg-bg-mid border border-border-base px-2 py-1 min-w-[44px]">
                          <div className="font-exo text-[9px] text-txt-muted uppercase">{label}</div>
                          <div className="font-exo text-[13px] font-bold text-txt-primary">{abilityMod(pj[key] ?? 10)}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </PJSubsection>
            )
          })}
        </div>
      )}
    </SessionCardShell>
  )
}
