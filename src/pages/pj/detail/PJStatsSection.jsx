import { ABILITY_SCORES } from '../pjConstants'
import { sectionTitleCls } from '../../../constants'
import { abilityMod, signedBonus, passivePerception, suggestedProfBonus } from '../../../helpers/pjCalc'

function AbilityBox({ label, base }) {
  const mod = abilityMod(base)
  return (
    <div className="flex flex-col gap-2 items-center bg-bg-mid border border-border-base px-3 py-2 min-w-[52px]">
      <span className="font-exo text-[14px] tracking-[0.1em] text-txt-muted uppercase leading-none">{label}</span>
      <span className="font-exo text-[16px] font-bold text-txt-primary leading-none mb-0.5">{mod}</span>
      <span className="font-exo text-[10px] text-txt-secondary leading-none mb-1">{base}</span>
    </div>
  )
}

function StatBadge({ label, value, accent }) {
  return (
    <div className="flex flex-col items-center bg-bg-mid border border-border-base px-4 py-2 min-w-[56px]">
      <span className="font-exo text-[14px] tracking-[0.1em] text-txt-muted uppercase leading-none">{label}</span>
      <span className={`font-exo text-[24px] font-bold leading-none mt-0.5 ${accent ? 'text-accent-dim' : 'text-txt-primary'}`}>{value}</span>
    </div>
  )
}

export default function PJStatsSection({ pj }) {
  const profBonus = pj.stat_proficiency_bonus ?? suggestedProfBonus(pj.nivel ?? 1)

  return (
    <div id="pj-section-stats" className="pt-4">
      <div className={sectionTitleCls}>Stats</div>
      <div className="flex flex-wrap gap-2 mb-4">
        {ABILITY_SCORES.map(({ label, key }) => (
          <AbilityBox key={key} label={label} base={pj[key] ?? 0} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {pj.stat_hp > 0 && <StatBadge label="HP Máx." value={pj.stat_hp} />}
        {pj.stat_hp > 0 && <StatBadge label="HP Actual" value={pj.stat_hp_current ?? pj.stat_hp} />}
        {pj.stat_hp_temp > 0 && <StatBadge label="HP Temporal" value={pj.stat_hp_temp} accent />}
        {pj.stat_ac > 0 && <StatBadge label="AC" value={pj.stat_ac} />}
        {pj.stat_ac_temp > 0 && <StatBadge label="AC Temporal" value={pj.stat_ac_temp} accent />}
        {pj.stat_speed > 0 && <StatBadge label="Velocidad" value={`${pj.stat_speed} ft`} />}
        {pj.stat_initiative !== undefined && <StatBadge label="Iniciativa" value={signedBonus(pj.stat_initiative)} />}

        {pj.stat_hit_dice && <StatBadge label="Dados Golpe" value={pj.stat_hit_dice} />}
        {pj.stat_inspiration && <StatBadge label="Inspiración" value="★" accent />}
        <StatBadge label="Perc. Pasiva" value={passivePerception(pj)} />
      </div>
    </div>
  )
}
