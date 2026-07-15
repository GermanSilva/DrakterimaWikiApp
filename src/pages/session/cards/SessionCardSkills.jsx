import { SKILLS_BY_ABILITY } from '../../pj/pjConstants'
import { abilityModNum, signedBonus, suggestedProfBonus } from '../../../helpers/pjCalc'
import SessionCardShell from './SessionCardShell'
import PJSubsection from './PJSubsection'
import EmptyPjsState from './EmptyPjsState'

export default function SessionCardSkills({ db, onEdit, onRemove }) {
  const pjs = db?.pjs ?? []

  return (
    <SessionCardShell title="Habilidades" onRemove={onRemove}>
      {pjs.length === 0 ? (
        <EmptyPjsState />
      ) : (
        <div className="space-y-3">
          {pjs.map(pj => {
            const profBonus = pj.stat_proficiency_bonus ?? suggestedProfBonus(pj.nivel ?? 1)
            const allSkills = SKILLS_BY_ABILITY.flatMap(group =>
              group.skills.map(skill => ({ ...skill, group }))
            )
            return (
              <PJSubsection key={pj.id} pj={pj} onEdit={onEdit} fullViewToggle>
                {({ fullView }) => {
                  const visibleSkills = fullView
                    ? allSkills
                    : allSkills.filter(skill => (pj[skill.key] ?? 0) > 0)
                  return visibleSkills.length === 0 ? (
                    <div className="text-[11px] text-txt-muted">Sin competencias asignadas.</div>
                  ) : (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 max-md:grid-cols-1">
                      {visibleSkills.map(skill => {
                        const level = pj[skill.key] ?? 0
                        const modNum = abilityModNum(pj[skill.group.key])
                        const bonus = signedBonus(modNum + (level > 0 ? profBonus : 0) + (level > 1 ? profBonus : 0))
                        return (
                          <div key={skill.key} className="flex items-center gap-2 text-[11px]">
                            <span className={level === 2 ? 'text-accent-bright' : level === 1 ? 'text-accent-dim' : 'text-txt-muted'}>
                              {level === 2 ? '◆' : level === 1 ? '●' : '○'}
                            </span>
                            <span className="text-txt-muted text-[10px]">[{skill.group.label}]</span>
                            <span className="text-txt-secondary flex-1">{skill.label}</span>
                            <span className={level > 0 ? 'text-accent-dim font-semibold' : 'text-txt-muted font-semibold'}>{bonus}</span>
                          </div>
                        )
                      })}
                    </div>
                  )
                }}
              </PJSubsection>
            )
          })}
        </div>
      )}
    </SessionCardShell>
  )
}
