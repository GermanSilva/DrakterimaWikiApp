import { SKILLS_BY_ABILITY } from '../pjConstants'
import { sectionTitleCls, detailSectionCls } from '../../../constants'
import { abilityModNum, signedBonus, suggestedProfBonus } from '../../../helpers/pjCalc'

function SkillGroup({ pj, group, profBonus }) {
  const modNum = abilityModNum(pj[group.key])
  const saveBonusStr = signedBonus(modNum + (pj[group.saveKey] ? profBonus : 0))

  return (
    <div className="border border-border-base overflow-hidden">
      <div className="bg-bg-mid px-3 py-2 flex justify-between items-center">
        <span className="font-exo text-[12px] font-semibold text-txt-primary">{group.label}</span>
        <span className={`font-exo text-[16px] font-bold ${modNum >= 0 ? 'text-accent-dim' : 'text-txt-muted'}`}>
          {signedBonus(modNum)}
        </span>
      </div>
      <div className="px-3 py-2 space-y-0.5">
        <div className="flex items-center gap-2 text-[11px]">
          <span className={pj[group.saveKey] ? 'text-accent-dim' : 'text-txt-muted'}>
            {pj[group.saveKey] ? '●' : '◌'}
          </span>
          <span className="text-txt-secondary flex-1">Salvación</span>
          <span className={`font-semibold ${pj[group.saveKey] ? 'text-accent-dim' : 'text-txt-muted'}`}>{saveBonusStr}</span>
        </div>
        {group.skills.map(skill => {
          const level = pj[skill.key] ?? 0
          const bonus = signedBonus(modNum + (level > 0 ? profBonus : 0) + (level > 1 ? profBonus : 0))
          const dotCls = level === 2 ? 'text-accent-bright' : level === 1 ? 'text-accent-dim' : 'text-txt-muted'
          const valCls = level > 0 ? 'text-accent-dim' : 'text-txt-muted'
          return (
            <div key={skill.key} className="flex items-center gap-2 text-[11px]">
              <span className={dotCls}>{level === 2 ? '◆' : level === 1 ? '●' : '◌'}</span>
              <span className="text-txt-secondary flex-1">{skill.label}</span>
              <span className={`font-semibold ${valCls}`}>{bonus}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function PJSkillsSection({ pj }) {
  const profBonus = pj.stat_proficiency_bonus ?? suggestedProfBonus(pj.nivel ?? 1)

  return (
    <div id="pj-section-habilidades" className={detailSectionCls}>
      <div className='flex justify-between items-center mb-4'>
        <div className={sectionTitleCls}>Habilidades & Salvaciones</div>
        <div className={sectionTitleCls + ' border border-border-base px-2 py-1'}><span className='text-txt-muted'>Bonus Proficiencia: </span>+{profBonus}</div>
      </div>
      <div className="grid grid-cols-3 gap-3 max-md:grid-cols-2 max-sm:grid-cols-1">
        {SKILLS_BY_ABILITY.map(group => (
          <SkillGroup key={group.key} pj={pj} group={group} profBonus={profBonus} />
        ))}
      </div>
    </div>
  )
}
