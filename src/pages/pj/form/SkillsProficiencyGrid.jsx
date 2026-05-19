import { SKILLS_BY_ABILITY } from '../pjConstants'

const allSkills = SKILLS_BY_ABILITY.flatMap(g => g.skills)

export default function SkillsProficiencyGrid({ f, setF }) {
  function cycle(key) {
    const cur = f[key] ?? 0
    setF(p => ({ ...p, [key]: cur >= 2 ? 0 : cur + 1 }))
  }

  return (
    <div className="grid grid-cols-3 gap-1.5 max-md:grid-cols-2">
      {allSkills.map(skill => {
        const level = f[skill.key] ?? 0
        const dot = level === 2 ? '◆' : level === 1 ? '●' : '◌'
        const dotCls = level === 2 ? 'text-accent-bright' : level === 1 ? 'text-accent-dim' : 'text-txt-muted'
        return (
          <button
            key={skill.key}
            type="button"
            title={`${skill.label}: click para ciclar 0→1→2`}
            className="flex items-center gap-2 px-2.5 py-1.5 border border-border-base hover:border-accent-dim hover:bg-bg-mid transition-all cursor-pointer bg-transparent text-left"
            onClick={() => cycle(skill.key)}
          >
            <span className={`${dotCls} text-[14px] leading-none`}>{dot}</span>
            <span className="font-exo text-[11px] text-txt-secondary">{skill.label}</span>
          </button>
        )
      })}
    </div>
  )
}
