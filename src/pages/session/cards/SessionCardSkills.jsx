import { SKILLS_BY_ABILITY } from '../../pj/pjConstants'
import { abilityModNum, signedBonus, suggestedProfBonus } from '../../../helpers/pjCalc'
import SessionCardShell from './SessionCardShell'
import PJSubsection from './PJSubsection'
import EmptyPjsState from './EmptyPjsState'

export default function SessionCardSkills({ db, onEdit }) {
  const pjs = db?.pjs ?? []

  return (
    <SessionCardShell title="Habilidades">
      {pjs.length === 0 ? (
        <EmptyPjsState />
      ) : (
        <div className="space-y-3">
          {pjs.map(pj => {
            const profBonus = pj.stat_proficiency_bonus ?? suggestedProfBonus(pj.nivel ?? 1)
            const proficientSkills = SKILLS_BY_ABILITY.flatMap(group =>
              group.skills
                .filter(skill => (pj[skill.key] ?? 0) > 0)
                .map(skill => ({ ...skill, group }))
            )
            return (
              <PJSubsection key={pj.id} pj={pj} onEdit={onEdit}>
                {proficientSkills.length === 0 ? (
                  <div className="text-[11px] text-txt-muted">Sin competencias asignadas.</div>
                ) : (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 max-md:grid-cols-1">
                    {proficientSkills.map(skill => {
                      const level = pj[skill.key] ?? 0
                      const modNum = abilityModNum(pj[skill.group.key])
                      const bonus = signedBonus(modNum + (level > 0 ? profBonus : 0) + (level > 1 ? profBonus : 0))
                      return (
                        <div key={skill.key} className="flex items-center gap-2 text-[11px]">
                          <span className={level === 2 ? 'text-accent-bright' : 'text-accent-dim'}>{level === 2 ? '◆' : '●'}</span>
                          <span className="text-txt-secondary flex-1">{skill.label}</span>
                          <span className="text-accent-dim font-semibold">{bonus}</span>
                        </div>
                      )
                    })}
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
