# Character Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the PJ screen into a complete virtual D&D 5e character sheet with mechanics (ability scores, saves, skills, attacks, spells, equipment) and narrative (appearance, personality), organized as a long detail page with sticky anchor nav and a 3-tab edit form.

**Architecture:** Extract `PJs.jsx` into focused sub-components under `src/pages/pj/`. Detail view uses `PJDetail.jsx` as container with per-section components. Form uses `PJForm.jsx` with three tab components and CRUD widgets for list fields. Shared calc logic lives in `src/helpers/pjCalc.js`. All new schema fields are additive — undefined in existing Firestore docs, treated as null/empty throughout.

**Tech Stack:** React 18, Vite 5, Tailwind CSS (custom colors: `txt-primary/secondary/muted`, `accent/accent-dim/accent-bright`, `bg-card/bg-mid`, `border-base/border-light`), Firebase Firestore, lucide-react icons.

---

## File Map

**New files:**
```
src/helpers/pjCalc.js
src/pages/pj/pjConstants.js
src/pages/pj/PJCard.jsx
src/pages/pj/PJDetail.jsx
src/pages/pj/PJForm.jsx
src/pages/pj/detail/PJStatsSection.jsx
src/pages/pj/detail/PJSkillsSection.jsx
src/pages/pj/detail/PJAttacksSection.jsx
src/pages/pj/detail/PJSpellsSection.jsx
src/pages/pj/detail/PJEquipmentSection.jsx
src/pages/pj/detail/PJTraitsSection.jsx
src/pages/pj/detail/PJNarrativeSection.jsx
src/pages/pj/detail/PJAppearanceSection.jsx
src/pages/pj/form/SkillsProficiencyGrid.jsx
src/pages/pj/form/AttacksCRUD.jsx
src/pages/pj/form/SpellsCRUD.jsx
src/pages/pj/form/EquipmentCRUD.jsx
src/pages/pj/form/PJIdentityTab.jsx
src/pages/pj/form/PJMechanicsTab.jsx
src/pages/pj/form/PJInventoryTab.jsx
```

**Modified files:**
```
src/seed.js               — add ~50 new fields with null/0/[]/{}  defaults to seedPJs entries
src/pages/PJs.jsx         — becomes thin shell: grid + routing, imports PJCard + PJDetail
src/components/FormModal.jsx — export shared form primitives; import PJForm from new location; remove inline PJForm body
```

---

### Task 1: src/helpers/pjCalc.js

**Files:**
- Create: `src/helpers/pjCalc.js`

- [ ] **Create the file with these pure functions:**

```js
export function abilityMod(base) {
  const n = Math.floor(((base ?? 10) - 10) / 2)
  return n >= 0 ? `+${n}` : `${n}`
}

export function abilityModNum(base) {
  return Math.floor(((base ?? 10) - 10) / 2)
}

export function signedBonus(n) {
  const num = n ?? 0
  return num >= 0 ? `+${num}` : `${num}`
}

export function suggestedProfBonus(nivel) {
  if (nivel <= 4) return 2
  if (nivel <= 8) return 3
  if (nivel <= 12) return 4
  if (nivel <= 16) return 5
  return 6
}

export function passivePerception(pj) {
  const wisModNum = abilityModNum(pj.stat_wis)
  const profBonus = pj.stat_proficiency_bonus ?? suggestedProfBonus(pj.nivel ?? 1)
  const skillPerc = pj.skill_perception ?? 0
  return 10 + wisModNum + (skillPerc > 0 ? profBonus : 0) + (skillPerc > 1 ? profBonus : 0)
}
```

- [ ] **Commit:**
```bash
git add src/helpers/pjCalc.js
git commit -m "feat: add pjCalc helper functions for D&D 5e calculations"
```

---

### Task 2: src/pages/pj/pjConstants.js

**Files:**
- Create: `src/pages/pj/pjConstants.js`

- [ ] **Create the file:**

```js
export const REGION_COLOR = {
  magral:  '#7aad82',
  nezor:   '#c4834a',
  heladas: '#7aaad0',
  islas:   '#9090c0',
}

export const ABILITY_SCORES = [
  { label: 'FUE', key: 'stat_str', saveKey: 'save_str' },
  { label: 'DES', key: 'stat_dex', saveKey: 'save_dex' },
  { label: 'CON', key: 'stat_con', saveKey: 'save_con' },
  { label: 'INT', key: 'stat_int', saveKey: 'save_int' },
  { label: 'SAB', key: 'stat_wis', saveKey: 'save_wis' },
  { label: 'CAR', key: 'stat_cha', saveKey: 'save_cha' },
]

export const SKILLS_BY_ABILITY = [
  {
    label: 'FUE', key: 'stat_str', saveKey: 'save_str',
    skills: [{ label: 'Atletismo', key: 'skill_athletics' }],
  },
  {
    label: 'DES', key: 'stat_dex', saveKey: 'save_dex',
    skills: [
      { label: 'Acrobacias', key: 'skill_acrobatics' },
      { label: 'Juego de Manos', key: 'skill_sleight_of_hand' },
      { label: 'Sigilo', key: 'skill_stealth' },
    ],
  },
  {
    label: 'CON', key: 'stat_con', saveKey: 'save_con',
    skills: [],
  },
  {
    label: 'INT', key: 'stat_int', saveKey: 'save_int',
    skills: [
      { label: 'Arcanismo', key: 'skill_arcana' },
      { label: 'Historia', key: 'skill_history' },
      { label: 'Investigación', key: 'skill_investigation' },
      { label: 'Naturaleza', key: 'skill_nature' },
      { label: 'Religión', key: 'skill_religion' },
    ],
  },
  {
    label: 'SAB', key: 'stat_wis', saveKey: 'save_wis',
    skills: [
      { label: 'Trato Animal', key: 'skill_animal_handling' },
      { label: 'Perspicacia', key: 'skill_insight' },
      { label: 'Medicina', key: 'skill_medicine' },
      { label: 'Percepción', key: 'skill_perception' },
      { label: 'Supervivencia', key: 'skill_survival' },
    ],
  },
  {
    label: 'CAR', key: 'stat_cha', saveKey: 'save_cha',
    skills: [
      { label: 'Engaño', key: 'skill_deception' },
      { label: 'Intimidación', key: 'skill_intimidation' },
      { label: 'Actuación', key: 'skill_performance' },
      { label: 'Persuasión', key: 'skill_persuasion' },
    ],
  },
]

// Shared CSS class constants for detail sections
export const sectionTitleCls = 'font-exo text-[9px] font-semibold tracking-[0.25em] text-accent-dim uppercase mb-2'
export const detailTextCls = 'text-sm leading-7 text-txt-secondary'
export const detailSectionCls = 'mt-5 pt-4 border-t border-border-base'
```

- [ ] **Commit:**
```bash
git add src/pages/pj/pjConstants.js
git commit -m "feat: add pjConstants with ABILITY_SCORES, SKILLS_BY_ABILITY, shared CSS constants"
```

---

### Task 3: src/seed.js — Add new PJ fields

**Files:**
- Modify: `src/seed.js`

- [ ] **Add the following field block to EACH of the 6 entries in `seedPJs` (add after each entry's existing fields, before the closing `}`).** All 6 entries get the same defaults:

```js
// Extended identity
trasfondo_dnd: '', alineamiento: '', experiencia: 0,
// Physical description
edad: '', altura: '', peso: '', ojos: '', piel: '', pelo: '', apariencia: '',
// Personality
personalidad: '', ideales: '', vinculos: '', defectos: '',
// Extended combat mechanics
stat_proficiency_bonus: 2, stat_inspiration: false, stat_hit_dice: '', stat_death_saves_success: 0, stat_death_saves_failure: 0,
// Saving throw proficiencies
save_str: false, save_dex: false, save_con: false, save_int: false, save_wis: false, save_cha: false,
// Skills (0=none, 1=proficient, 2=expertise)
skill_acrobatics: 0, skill_animal_handling: 0, skill_arcana: 0, skill_athletics: 0,
skill_deception: 0, skill_history: 0, skill_insight: 0, skill_intimidation: 0,
skill_investigation: 0, skill_medicine: 0, skill_nature: 0, skill_perception: 0,
skill_performance: 0, skill_persuasion: 0, skill_religion: 0, skill_sleight_of_hand: 0,
skill_stealth: 0, skill_survival: 0,
// Proficiencies & languages
idiomas: '', prof_armas: '', prof_armaduras: '', prof_herramientas: '', rasgos_clase: '', otros_rasgos: '',
// Spellcasting
spell_dc: 0, spell_attack_bonus: 0, spell_ability: 'INT', spell_slots: {}, hechizos: [],
// Attacks and equipment
ataques: [], equipo: [], monedas: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
```

- [ ] **Commit:**
```bash
git add src/seed.js
git commit -m "feat: add new character sheet fields to seedPJs with safe defaults"
```

---

### Task 4: FormModal.jsx — Export shared form primitives

**Files:**
- Modify: `src/components/FormModal.jsx`

The new `PJForm.jsx` (in `src/pages/pj/`) needs `FormGroup`, `FormRow`, `EstadoField`, and the style constants. Add named exports without changing any existing behavior.

- [ ] **Change the const declarations at the top of `FormModal.jsx` from `const` to `export const`** for these 5 lines:

```js
export const labelCls = 'block font-exo text-[10px] font-medium tracking-[0.2em] uppercase text-txt-muted mb-1.5'
export const inputCls = 'w-full bg-bg-mid border border-border-base text-txt-primary font-barlow text-sm px-3 py-2 outline-none transition-colors focus:border-accent-dim'
export const btnPrimary = 'inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-accent text-white hover:bg-accent-bright border-none'
export const btnSecondary = 'inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-transparent text-txt-secondary border border-border-light hover:border-accent-dim hover:text-txt-primary'
export const btnDanger = 'inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-transparent text-accent border border-accent-dim hover:bg-accent/[.15]'
```

- [ ] **Export `FormGroup`, `FormRow`, and `EstadoField`** by adding `export` before each `function` keyword:

```js
export function FormGroup({ children, className = '' }) { ... }
export function FormRow({ children }) { ... }
export function EstadoField({ estado, visibilidad, setF }) { ... }
```

- [ ] **Verify the app still loads** — run `npm run dev` and open the PJs form. No visible change expected.

- [ ] **Commit:**
```bash
git add src/components/FormModal.jsx
git commit -m "feat: export shared form primitives from FormModal for PJForm tabs"
```

---

### Task 5: src/pages/pj/PJCard.jsx

**Files:**
- Create: `src/pages/pj/PJCard.jsx`

- [ ] **Create the file.** This extracts the card JSX currently inline in `PJs.jsx`:

```jsx
import { useApp } from '../../AppContext'
import { Tag, RegionTag } from '../../components/Shared'
import { Lock, Shield } from 'lucide-react'
import { REGION_COLOR, ABILITY_SCORES } from './pjConstants'
import { abilityMod, signedBonus } from '../../helpers/pjCalc'

function ModStatBox({ label, base }) {
  const mod = abilityMod(base)
  return (
    <div className="group flex flex-col items-center gap-0.5">
      <span className="font-exo text-[14px] tracking-[0.08em] text-txt-muted uppercase leading-none">{label}</span>
      <div className="relative h-[16px] flex items-center justify-center min-w-[24px]">
        <span className="font-exo text-[16px] font-bold text-txt-primary group-hover:opacity-0 transition-opacity duration-150 leading-none">{mod}</span>
        <span className="absolute inset-0 flex items-center justify-center font-exo text-[16px] font-bold text-accent-dim opacity-0 group-hover:opacity-100 transition-opacity duration-150 leading-none">{base}</span>
      </div>
    </div>
  )
}

export default function PJCard({ pj, onClick }) {
  const { isDM } = useApp()
  const hasStats = pj.stat_hp || pj.stat_ac || pj.stat_str || pj.stat_dex || pj.stat_con || pj.stat_int || pj.stat_wis || pj.stat_cha

  return (
    <div
      className="bg-bg-card border border-border-base p-[18px] cursor-pointer transition-all relative overflow-hidden animate-card-in before:absolute before:top-0 before:left-0 before:right-0 before:h-0.5 before:content-[''] before:bg-border-light before:transition-colors hover:bg-bg-card-hover hover:border-accent-dim hover:before:bg-accent"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-exo text-[16px] font-semibold text-txt-primary tracking-[0.03em]">{pj.nombre}</div>
        <div className="flex items-center gap-1.5">
          {isDM && pj.notas && <Lock size={10} className="opacity-45" title="Tiene notas DM" />}
          <Shield size={16} className="opacity-55" />
        </div>
      </div>
      <div className="font-exo text-[14px] text-txt-muted font-medium mb-2.5">
        {pj.jugador || <span className="text-txt-muted">Sin asignar</span>}
      </div>
      <div className="flex flex-wrap gap-[5px] mb-2.5">
        <Tag cls="pj" text={`${pj.clase} - Nv. ${pj.nivel || 1}`} />
        {pj.raza && <Tag cls="neutral" text={pj.raza} />}
        {pj.region && <RegionTag region={pj.region} />}
        {pj.estado === 'borrador' && <Tag cls="borrador" text="Borrador" />}
        {pj.estado === 'secreto' && <Tag cls="secreto" text="Secreto" />}
      </div>
      <div className="text-[13px] text-txt-secondary leading-relaxed italic line-clamp-3">
        {pj.trasfondo || 'Sin trasfondo registrado.'}
      </div>
      {hasStats && (
        <div className="mt-2.5 pt-2.5 border-t border-border-base">
          <div className="flex justify-evenly gap-3 mb-2 flex-wrap">
            {pj.stat_hp > 0 && (
              <div className="flex flex-col justify-center items-center">
                <span className="font-exo text-[13px] text-txt-muted uppercase">HP</span>
                <span className="font-exo text-[14px] font-bold text-txt-primary">{pj.stat_hp}</span>
              </div>
            )}
            {pj.stat_ac > 0 && (
              <div className="flex flex-col justify-center items-center">
                <span className="font-exo text-[13px] text-txt-muted uppercase">AC</span>
                <span className="font-exo text-[14px] font-bold text-txt-primary">{pj.stat_ac}</span>
              </div>
            )}
            {pj.stat_speed > 0 && (
              <div className="flex flex-col justify-center items-center">
                <span className="font-exo text-[13px] text-txt-muted uppercase">Vel.</span>
                <span className="font-exo text-[14px] font-bold text-txt-primary">{pj.stat_speed}ft</span>
              </div>
            )}
            {pj.stat_initiative !== undefined && pj.stat_initiative !== 0 && (
              <div className="flex flex-col justify-center items-center">
                <span className="font-exo text-[13px] text-txt-muted uppercase">Init.</span>
                <span className="font-exo text-[14px] font-bold text-txt-primary">{signedBonus(pj.stat_initiative)}</span>
              </div>
            )}
          </div>
          <div className="flex gap-2 justify-between">
            {ABILITY_SCORES.map(({ label, key }) => (
              <ModStatBox key={key} label={label} base={pj[key] ?? 0} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Commit:**
```bash
git add src/pages/pj/PJCard.jsx
git commit -m "feat: extract PJCard component from PJs.jsx"
```

---

### Task 6: src/pages/pj/detail/PJNarrativeSection.jsx

**Files:**
- Create: `src/pages/pj/detail/PJNarrativeSection.jsx`

- [ ] **Create the file** (extracts existing narrative from `PJDetailInline`):

```jsx
import WikiText from '../../../components/WikiText'
import { sectionTitleCls, detailTextCls, detailSectionCls } from '../pjConstants'

export default function PJNarrativeSection({ pj }) {
  return (
    <div id="pj-section-narrativa" className="grid grid-cols-2 gap-0 gap-x-8 max-md:grid-cols-1">
      <div>
        {pj.trasfondo && (
          <div className={detailSectionCls}>
            <div className={sectionTitleCls}>Trasfondo</div>
            <div className={detailTextCls}><WikiText text={pj.trasfondo} /></div>
          </div>
        )}
        {pj.motivo && (
          <div className={detailSectionCls}>
            <div className={sectionTitleCls}>Motivación · Gremio</div>
            <div className={detailTextCls}><WikiText text={pj.motivo} /></div>
          </div>
        )}
      </div>
      <div>
        {pj.magralita && (
          <div className={detailSectionCls}>
            <div className={sectionTitleCls}>Relación con la Magralita</div>
            <div className={detailTextCls}><WikiText text={pj.magralita} /></div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Commit:**
```bash
git add src/pages/pj/detail/PJNarrativeSection.jsx
git commit -m "feat: extract PJNarrativeSection component"
```

---

### Task 7: src/pages/pj/detail/PJStatsSection.jsx

**Files:**
- Create: `src/pages/pj/detail/PJStatsSection.jsx`

- [ ] **Create the file** (preserves existing stats layout, adds prof bonus / hit dice / inspiration / passive perception badges):

```jsx
import { ABILITY_SCORES, sectionTitleCls } from '../pjConstants'
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
        {pj.stat_hp > 0 && <StatBadge label="HP Máx." value={pj.stat_hp} />}
        {pj.stat_ac > 0 && <StatBadge label="AC" value={pj.stat_ac} />}
        {pj.stat_speed > 0 && <StatBadge label="Velocidad" value={`${pj.stat_speed} ft`} />}
        {pj.stat_initiative !== undefined && <StatBadge label="Iniciativa" value={signedBonus(pj.stat_initiative)} />}
        <StatBadge label="Bono Prof." value={`+${profBonus}`} accent />
        {pj.stat_hit_dice && <StatBadge label="Dados Golpe" value={pj.stat_hit_dice} />}
        {pj.stat_inspiration && <StatBadge label="Inspiración" value="★" accent />}
        <StatBadge label="Perc. Pasiva" value={passivePerception(pj)} />
      </div>
      <div className="flex flex-wrap gap-2">
        {ABILITY_SCORES.map(({ label, key }) => (
          <AbilityBox key={key} label={label} base={pj[key] ?? 0} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Commit:**
```bash
git add src/pages/pj/detail/PJStatsSection.jsx
git commit -m "feat: PJStatsSection with prof bonus, hit dice, inspiration, passive perception"
```

---

### Task 8: src/pages/pj/detail/PJSkillsSection.jsx

**Files:**
- Create: `src/pages/pj/detail/PJSkillsSection.jsx`

- [ ] **Create the file:**

```jsx
import { SKILLS_BY_ABILITY, sectionTitleCls, detailSectionCls } from '../pjConstants'
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
      <div className={sectionTitleCls}>Habilidades & Salvaciones</div>
      <div className="grid grid-cols-3 gap-3 max-md:grid-cols-2 max-sm:grid-cols-1">
        {SKILLS_BY_ABILITY.map(group => (
          <SkillGroup key={group.key} pj={pj} group={group} profBonus={profBonus} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Commit:**
```bash
git add src/pages/pj/detail/PJSkillsSection.jsx
git commit -m "feat: PJSkillsSection grouped by attribute with calculated bonuses"
```

---

### Task 9: src/pages/pj/detail/PJAttacksSection.jsx

**Files:**
- Create: `src/pages/pj/detail/PJAttacksSection.jsx`

- [ ] **Create the file:**

```jsx
import { sectionTitleCls, detailSectionCls } from '../pjConstants'

export default function PJAttacksSection({ pj }) {
  return (
    <div id="pj-section-ataques" className={detailSectionCls}>
      <div className={sectionTitleCls}>Ataques</div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr className="border-b border-border-base text-txt-muted font-exo text-[10px] tracking-[0.1em] uppercase">
              <th className="text-left py-2 pr-4 font-medium">Arma</th>
              <th className="text-center py-2 px-2 font-medium">Bono</th>
              <th className="text-center py-2 px-2 font-medium">Daño</th>
              <th className="text-left py-2 px-2 font-medium">Tipo</th>
              <th className="text-left py-2 px-2 font-medium">Alcance</th>
              <th className="text-left py-2 pl-2 font-medium">Notas</th>
            </tr>
          </thead>
          <tbody>
            {(pj.ataques ?? []).map(a => (
              <tr key={a.id} className="border-b border-border-base/50 text-txt-secondary">
                <td className="py-2 pr-4 text-txt-primary font-medium">{a.nombre}</td>
                <td className="text-center py-2 px-2 text-accent-dim font-semibold">{a.bono_ataque}</td>
                <td className="text-center py-2 px-2">{a.dano}</td>
                <td className="py-2 px-2 text-txt-muted">{a.tipo_dano}</td>
                <td className="py-2 px-2 text-txt-muted">{a.alcance}</td>
                <td className="py-2 pl-2 text-txt-muted">{a.notas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Commit:**
```bash
git add src/pages/pj/detail/PJAttacksSection.jsx
git commit -m "feat: PJAttacksSection read-only attacks table"
```

---

### Task 10: src/pages/pj/detail/PJSpellsSection.jsx

**Files:**
- Create: `src/pages/pj/detail/PJSpellsSection.jsx`

- [ ] **Create the file:**

```jsx
import { sectionTitleCls, detailSectionCls } from '../pjConstants'

const SPELL_LEVELS = ['Trucos', 'Nivel 1', 'Nivel 2', 'Nivel 3', 'Nivel 4', 'Nivel 5', 'Nivel 6', 'Nivel 7', 'Nivel 8', 'Nivel 9']

export default function PJSpellsSection({ pj }) {
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
              {byLevel[lvl].map(h => (
                <span key={h.id} className="bg-bg-mid border border-border-base px-2.5 py-1 text-[12px] text-txt-secondary">
                  {h.nombre}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Commit:**
```bash
git add src/pages/pj/detail/PJSpellsSection.jsx
git commit -m "feat: PJSpellsSection with slots display and spell list by level"
```

---

### Task 11: src/pages/pj/detail/PJEquipmentSection.jsx

**Files:**
- Create: `src/pages/pj/detail/PJEquipmentSection.jsx`

- [ ] **Create the file:**

```jsx
import { sectionTitleCls, detailSectionCls } from '../pjConstants'

const CURRENCY = [
  { key: 'pp', label: 'PP' },
  { key: 'gp', label: 'GP' },
  { key: 'ep', label: 'EP' },
  { key: 'sp', label: 'SP' },
  { key: 'cp', label: 'CP' },
]

export default function PJEquipmentSection({ pj }) {
  const equipo = pj.equipo ?? []
  const monedas = pj.monedas ?? {}
  const hasMonedas = CURRENCY.some(c => (monedas[c.key] ?? 0) > 0)

  return (
    <div id="pj-section-equipo" className={detailSectionCls}>
      <div className={sectionTitleCls}>Equipo</div>
      {equipo.length > 0 && (
        <ul className="space-y-1 mb-4">
          {equipo.map(item => (
            <li key={item.id} className="flex gap-3 text-[13px] text-txt-secondary">
              <span className="text-txt-primary font-medium">{item.nombre}</span>
              {item.cantidad > 1 && <span className="text-txt-muted">×{item.cantidad}</span>}
              {item.descripcion && <span className="text-txt-muted">— {item.descripcion}</span>}
            </li>
          ))}
        </ul>
      )}
      {hasMonedas && (
        <div className="flex gap-4 flex-wrap pt-2 border-t border-border-base">
          {CURRENCY.map(c => (monedas[c.key] ?? 0) > 0 && (
            <div key={c.key} className="text-center">
              <div className="font-exo text-[10px] text-txt-muted mb-0.5">{c.label}</div>
              <div className="font-exo text-[16px] font-bold text-txt-primary">{monedas[c.key]}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Commit:**
```bash
git add src/pages/pj/detail/PJEquipmentSection.jsx
git commit -m "feat: PJEquipmentSection with item list and currency display"
```

---

### Task 12: src/pages/pj/detail/PJTraitsSection.jsx

**Files:**
- Create: `src/pages/pj/detail/PJTraitsSection.jsx`

- [ ] **Create the file:**

```jsx
import WikiText from '../../../components/WikiText'
import { sectionTitleCls, detailTextCls, detailSectionCls } from '../pjConstants'

export default function PJTraitsSection({ pj }) {
  return (
    <div id="pj-section-rasgos" className={detailSectionCls}>
      <div className={sectionTitleCls}>Rasgos & Proficiencias</div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-3 max-md:grid-cols-1">
        {pj.rasgos_clase && (
          <div className="col-span-2 max-md:col-span-1">
            <div className="font-exo text-[10px] text-txt-muted uppercase tracking-[0.15em] mb-1">Rasgos de Clase</div>
            <div className={detailTextCls}><WikiText text={pj.rasgos_clase} /></div>
          </div>
        )}
        {pj.otros_rasgos && (
          <div className="col-span-2 max-md:col-span-1">
            <div className="font-exo text-[10px] text-txt-muted uppercase tracking-[0.15em] mb-1">Otros Rasgos</div>
            <div className={detailTextCls}><WikiText text={pj.otros_rasgos} /></div>
          </div>
        )}
        {pj.idiomas && (
          <div>
            <div className="font-exo text-[10px] text-txt-muted uppercase tracking-[0.15em] mb-1">Idiomas</div>
            <div className="text-[13px] text-txt-secondary">{pj.idiomas}</div>
          </div>
        )}
        {pj.prof_armas && (
          <div>
            <div className="font-exo text-[10px] text-txt-muted uppercase tracking-[0.15em] mb-1">Prof. Armas</div>
            <div className="text-[13px] text-txt-secondary">{pj.prof_armas}</div>
          </div>
        )}
        {pj.prof_armaduras && (
          <div>
            <div className="font-exo text-[10px] text-txt-muted uppercase tracking-[0.15em] mb-1">Prof. Armaduras</div>
            <div className="text-[13px] text-txt-secondary">{pj.prof_armaduras}</div>
          </div>
        )}
        {pj.prof_herramientas && (
          <div>
            <div className="font-exo text-[10px] text-txt-muted uppercase tracking-[0.15em] mb-1">Prof. Herramientas</div>
            <div className="text-[13px] text-txt-secondary">{pj.prof_herramientas}</div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Commit:**
```bash
git add src/pages/pj/detail/PJTraitsSection.jsx
git commit -m "feat: PJTraitsSection with class features, proficiencies, languages"
```

---

### Task 13: src/pages/pj/detail/PJAppearanceSection.jsx

**Files:**
- Create: `src/pages/pj/detail/PJAppearanceSection.jsx`

- [ ] **Create the file:**

```jsx
import WikiText from '../../../components/WikiText'
import { sectionTitleCls, detailTextCls, detailSectionCls } from '../pjConstants'

const PHYSICAL_FIELDS = [
  { key: 'edad', label: 'Edad' },
  { key: 'altura', label: 'Altura' },
  { key: 'peso', label: 'Peso' },
  { key: 'ojos', label: 'Ojos' },
  { key: 'piel', label: 'Piel' },
  { key: 'pelo', label: 'Pelo' },
]

const PERSONALITY_FIELDS = [
  { key: 'personalidad', label: 'Rasgos de Personalidad' },
  { key: 'ideales', label: 'Ideales' },
  { key: 'vinculos', label: 'Vínculos' },
  { key: 'defectos', label: 'Defectos' },
]

export default function PJAppearanceSection({ pj }) {
  const physicalBadges = PHYSICAL_FIELDS.filter(f => pj[f.key])
  const personalityItems = PERSONALITY_FIELDS.filter(f => pj[f.key])

  return (
    <div id="pj-section-apariencia" className={detailSectionCls}>
      <div className={sectionTitleCls}>Apariencia & Personalidad</div>

      {physicalBadges.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-4">
          {physicalBadges.map(f => (
            <div key={f.key} className="bg-bg-mid border border-border-base px-3 py-1.5">
              <span className="font-exo text-[10px] text-txt-muted uppercase tracking-[0.1em] mr-2">{f.label}</span>
              <span className="text-[13px] text-txt-primary">{pj[f.key]}</span>
            </div>
          ))}
        </div>
      )}

      {pj.apariencia && (
        <div className="mb-4">
          <div className={detailTextCls}><WikiText text={pj.apariencia} /></div>
        </div>
      )}

      {personalityItems.length > 0 && (
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          {personalityItems.map(f => (
            <div key={f.key}>
              <div className="font-exo text-[10px] text-txt-muted uppercase tracking-[0.15em] mb-1">{f.label}</div>
              <div className={detailTextCls}><WikiText text={pj[f.key]} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Commit:**
```bash
git add src/pages/pj/detail/PJAppearanceSection.jsx
git commit -m "feat: PJAppearanceSection with physical badges and personality grid"
```

---

### Task 14: src/pages/pj/PJDetail.jsx

**Files:**
- Create: `src/pages/pj/PJDetail.jsx`

- [ ] **Create the file** (container with sticky anchor nav + all sections):

```jsx
import { useApp } from '../../AppContext'
import { COLLECTION_LETTER } from '../../components/WikiText'
import { Tag, RegionTag } from '../../components/Shared'
import PlayerNotes from '../../components/PlayerNotes'
import WikiText from '../../components/WikiText'
import { Lock } from 'lucide-react'
import { REGION_COLOR, sectionTitleCls, detailTextCls } from './pjConstants'
import { SKILLS_BY_ABILITY } from './pjConstants'
import PJStatsSection from './detail/PJStatsSection'
import PJSkillsSection from './detail/PJSkillsSection'
import PJAttacksSection from './detail/PJAttacksSection'
import PJSpellsSection from './detail/PJSpellsSection'
import PJEquipmentSection from './detail/PJEquipmentSection'
import PJTraitsSection from './detail/PJTraitsSection'
import PJNarrativeSection from './detail/PJNarrativeSection'
import PJAppearanceSection from './detail/PJAppearanceSection'

const btnSecondary = 'inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-transparent text-txt-secondary border border-border-light hover:border-accent-dim hover:text-txt-primary'

function hasStats(pj) {
  return !!(pj.stat_hp || pj.stat_ac || pj.stat_str || pj.stat_dex || pj.stat_con || pj.stat_int || pj.stat_wis || pj.stat_cha)
}

function hasSkills(pj) {
  const saveKeys = ['save_str', 'save_dex', 'save_con', 'save_int', 'save_wis', 'save_cha']
  const skillKeys = SKILLS_BY_ABILITY.flatMap(g => g.skills.map(s => s.key))
  return !!(pj.stat_proficiency_bonus || saveKeys.some(k => pj[k]) || skillKeys.some(k => pj[k] > 0))
}

function hasSpells(pj) {
  return !!((pj.hechizos?.length > 0) || pj.spell_dc > 0 || pj.spell_attack_bonus)
}

function hasEquipment(pj) {
  const monedas = pj.monedas ?? {}
  return !!(pj.equipo?.length > 0 || Object.values(monedas).some(v => v > 0))
}

function hasTraits(pj) {
  return !!(pj.rasgos_clase || pj.idiomas || pj.prof_armas || pj.prof_armaduras || pj.prof_herramientas || pj.otros_rasgos)
}

function hasNarrative(pj) {
  return !!(pj.trasfondo || pj.motivo || pj.magralita)
}

function hasAppearance(pj) {
  return !!(pj.edad || pj.altura || pj.personalidad || pj.ideales || pj.vinculos || pj.defectos || pj.apariencia)
}

const ANCHORS = [
  { id: 'stats',       label: 'Stats',       show: hasStats },
  { id: 'habilidades', label: 'Habilidades', show: hasSkills },
  { id: 'ataques',     label: 'Ataques',     show: p => p.ataques?.length > 0 },
  { id: 'hechizos',    label: 'Hechizos',    show: hasSpells },
  { id: 'equipo',      label: 'Equipo',      show: hasEquipment },
  { id: 'rasgos',      label: 'Rasgos',      show: hasTraits },
  { id: 'narrativa',   label: 'Narrativa',   show: hasNarrative },
  { id: 'apariencia',  label: 'Apariencia',  show: hasAppearance },
]

export default function PJDetail({ pj, onBack }) {
  const { openForm, isDM } = useApp()
  const visibleAnchors = ANCHORS.filter(a => a.show(pj))
  const hasDMNotes = isDM && !!pj.notas

  function scrollTo(id) {
    document.getElementById(`pj-section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div>
      <div className="flex justify-between mb-7">
        <button className={btnSecondary} onClick={onBack}>← Volver</button>
        {isDM && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-txt-muted select-all cursor-text opacity-50" title="ID para wiki-link">
              {`{${pj.id}${COLLECTION_LETTER['pjs']}}`}
            </span>
            <button className={btnSecondary} onClick={() => openForm('pjs', pj.id)}>Editar</button>
          </div>
        )}
      </div>

      <div className="pb-5 border-b border-border-base">
        <div className="font-exo text-[10px] tracking-[0.3em] uppercase mb-1 font-medium" style={{ color: REGION_COLOR[pj.region] || '#6e6e6e' }}>
          Personaje Jugador
        </div>
        <div className="font-exo text-[26px] font-bold text-txt-primary uppercase">{pj.nombre}</div>
        <div className="font-exo text-[16px] font-semibold uppercase text-txt-muted -mt-1">{pj.jugador}</div>
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          <Tag cls="pj" text={`${pj.clase || '?'} - Nv. ${pj.nivel || 1}`} />
          {pj.raza && <Tag cls="neutral" text={pj.raza} />}
          {pj.region && <RegionTag region={pj.region} />}
          {pj.alineamiento && <Tag cls="neutral" text={pj.alineamiento} />}
          {pj.estado === 'borrador' && <Tag cls="borrador" text="Borrador" />}
          {pj.estado === 'secreto' && <Tag cls="secreto" text="Secreto" />}
        </div>
      </div>

      {pj.imagen_url && (
        <div className="my-4 text-center">
          <img src={pj.imagen_url} alt={pj.nombre} className="max-w-full max-h-[280px] rounded-lg object-cover border border-border-base" onError={e => e.target.style.display = 'none'} />
        </div>
      )}

      {(visibleAnchors.length > 0 || hasDMNotes) && (
        <div className="sticky top-0 z-10 bg-bg-card border-b border-border-base mb-2 overflow-x-auto">
          <div className="flex min-w-max">
            {visibleAnchors.map(a => (
              <button key={a.id} className="font-exo text-[10px] font-semibold tracking-[0.15em] uppercase px-4 py-2.5 text-txt-muted hover:text-txt-primary hover:bg-bg-mid border-none bg-transparent cursor-pointer whitespace-nowrap transition-colors" onClick={() => scrollTo(a.id)}>
                {a.label}
              </button>
            ))}
            {hasDMNotes && (
              <button className="font-exo text-[10px] font-semibold tracking-[0.15em] uppercase px-4 py-2.5 text-accent-dim hover:text-accent-bright hover:bg-bg-mid border-none bg-transparent cursor-pointer whitespace-nowrap transition-colors" onClick={() => scrollTo('dm')}>
                🔒 DM
              </button>
            )}
          </div>
        </div>
      )}

      {hasStats(pj) && <PJStatsSection pj={pj} />}
      {hasSkills(pj) && <PJSkillsSection pj={pj} />}
      {pj.ataques?.length > 0 && <PJAttacksSection pj={pj} />}
      {hasSpells(pj) && <PJSpellsSection pj={pj} />}
      {hasEquipment(pj) && <PJEquipmentSection pj={pj} />}
      {hasTraits(pj) && <PJTraitsSection pj={pj} />}
      {hasNarrative(pj) && <PJNarrativeSection pj={pj} />}
      {hasAppearance(pj) && <PJAppearanceSection pj={pj} />}

      {hasDMNotes && (
        <div id="pj-section-dm" className="mt-5 pt-4 border-t-2 border-t-accent">
          <div className="font-exo text-[9px] font-semibold tracking-[0.25em] text-accent-bright uppercase mb-2">
            <Lock size={10} className="inline mr-1" />Notas DM
          </div>
          <div className={detailTextCls}><WikiText text={pj.notas} /></div>
        </div>
      )}

      <PlayerNotes entityType="pjs" entityId={pj.id} />
    </div>
  )
}
```

- [ ] **Commit:**
```bash
git add src/pages/pj/PJDetail.jsx
git commit -m "feat: PJDetail container with sticky anchor nav and all detail sections"
```

---

### Task 15: src/pages/pj/form/SkillsProficiencyGrid.jsx

**Files:**
- Create: `src/pages/pj/form/SkillsProficiencyGrid.jsx`

- [ ] **Create the file:**

```jsx
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
```

- [ ] **Commit:**
```bash
git add src/pages/pj/form/SkillsProficiencyGrid.jsx
git commit -m "feat: SkillsProficiencyGrid cycling widget (0→1→2→0)"
```

---

### Task 16: src/pages/pj/form/AttacksCRUD.jsx

**Files:**
- Create: `src/pages/pj/form/AttacksCRUD.jsx`

- [ ] **Create the file:**

```jsx
import { useState } from 'react'
import { labelCls, inputCls, btnSecondary, btnDanger } from '../../../components/FormModal'

const EMPTY = { nombre: '', bono_ataque: '', dano: '', tipo_dano: '', alcance: '', notas: '' }

export default function AttacksCRUD({ ataques = [], onChange }) {
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(EMPTY)
  const set = k => e => setDraft(p => ({ ...p, [k]: e.target.value }))

  function startAdd() { setDraft(EMPTY); setEditingId('new') }
  function startEdit(a) { setDraft({ ...a }); setEditingId(a.id) }
  function cancel() { setEditingId(null) }

  function confirm() {
    if (editingId === 'new') {
      onChange([...ataques, { ...draft, id: Date.now() }])
    } else {
      onChange(ataques.map(a => a.id === editingId ? { ...draft, id: editingId } : a))
    }
    setEditingId(null)
  }

  function remove(id) { onChange(ataques.filter(a => a.id !== id)) }

  const inlineFormCls = 'bg-bg-mid border border-border-base p-3 mt-2 space-y-2'

  return (
    <div>
      {ataques.length > 0 && (
        <div className="overflow-x-auto mb-2">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="border-b border-border-base text-txt-muted font-exo text-[10px] uppercase tracking-[0.1em]">
                <th className="text-left py-1.5 pr-3 font-medium">Arma</th>
                <th className="text-center py-1.5 px-2 font-medium">Bono</th>
                <th className="text-center py-1.5 px-2 font-medium">Daño</th>
                <th className="text-left py-1.5 px-2 font-medium">Tipo</th>
                <th className="text-left py-1.5 px-2 font-medium">Alcance</th>
                <th className="py-1.5 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {ataques.map(a => (
                <tr key={a.id} className="border-b border-border-base/40">
                  {editingId === a.id ? (
                    <td colSpan={6} className={inlineFormCls}>
                      <div className="grid grid-cols-2 gap-2">
                        <div><label className={labelCls}>Arma</label><input className={inputCls} value={draft.nombre} onChange={set('nombre')} /></div>
                        <div><label className={labelCls}>Bono Ataque</label><input className={inputCls} value={draft.bono_ataque} onChange={set('bono_ataque')} placeholder="+5" /></div>
                        <div><label className={labelCls}>Daño</label><input className={inputCls} value={draft.dano} onChange={set('dano')} placeholder="1d8+3" /></div>
                        <div><label className={labelCls}>Tipo</label><input className={inputCls} value={draft.tipo_dano} onChange={set('tipo_dano')} placeholder="Cortante" /></div>
                        <div><label className={labelCls}>Alcance</label><input className={inputCls} value={draft.alcance} onChange={set('alcance')} placeholder="5 ft" /></div>
                        <div><label className={labelCls}>Notas</label><input className={inputCls} value={draft.notas} onChange={set('notas')} /></div>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button type="button" className={btnSecondary} onClick={cancel}>Cancelar</button>
                        <button type="button" className="inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-accent text-white hover:bg-accent-bright border-none" onClick={confirm}>Guardar</button>
                      </div>
                    </td>
                  ) : (
                    <>
                      <td className="py-2 pr-3 text-txt-primary font-medium">{a.nombre}</td>
                      <td className="text-center py-2 px-2 text-accent-dim">{a.bono_ataque}</td>
                      <td className="text-center py-2 px-2 text-txt-secondary">{a.dano}</td>
                      <td className="py-2 px-2 text-txt-muted">{a.tipo_dano}</td>
                      <td className="py-2 px-2 text-txt-muted">{a.alcance}</td>
                      <td className="py-2 text-right">
                        <button type="button" className="text-txt-muted hover:text-txt-primary text-[11px] mr-2" onClick={() => startEdit(a)}>✎</button>
                        <button type="button" className="text-accent hover:text-accent-bright text-[11px]" onClick={() => remove(a.id)}>✕</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingId === 'new' && (
        <div className={inlineFormCls}>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelCls}>Arma</label><input className={inputCls} value={draft.nombre} onChange={set('nombre')} /></div>
            <div><label className={labelCls}>Bono Ataque</label><input className={inputCls} value={draft.bono_ataque} onChange={set('bono_ataque')} placeholder="+5" /></div>
            <div><label className={labelCls}>Daño</label><input className={inputCls} value={draft.dano} onChange={set('dano')} placeholder="1d8+3" /></div>
            <div><label className={labelCls}>Tipo</label><input className={inputCls} value={draft.tipo_dano} onChange={set('tipo_dano')} placeholder="Cortante" /></div>
            <div><label className={labelCls}>Alcance</label><input className={inputCls} value={draft.alcance} onChange={set('alcance')} placeholder="5 ft" /></div>
            <div><label className={labelCls}>Notas</label><input className={inputCls} value={draft.notas} onChange={set('notas')} /></div>
          </div>
          <div className="flex gap-2 mt-2">
            <button type="button" className={btnSecondary} onClick={cancel}>Cancelar</button>
            <button type="button" className="inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-accent text-white hover:bg-accent-bright border-none" onClick={confirm}>Guardar</button>
          </div>
        </div>
      )}

      {editingId === null && (
        <button type="button" className="font-exo text-[11px] text-accent hover:text-accent-bright transition-colors mt-1" onClick={startAdd}>
          + Agregar ataque
        </button>
      )}
    </div>
  )
}
```

- [ ] **Commit:**
```bash
git add src/pages/pj/form/AttacksCRUD.jsx
git commit -m "feat: AttacksCRUD inline CRUD widget for attacks array"
```

---

### Task 17: src/pages/pj/form/SpellsCRUD.jsx

**Files:**
- Create: `src/pages/pj/form/SpellsCRUD.jsx`

Manages the `hechizos` array only (name + level per spell). Spell slots and DC live in Tab 2.

- [ ] **Create the file:**

```jsx
import { useState } from 'react'
import { labelCls, inputCls, btnSecondary } from '../../../components/FormModal'

const EMPTY = { nombre: '', nivel: 0 }
const LEVELS = ['Truco (0)', '1', '2', '3', '4', '5', '6', '7', '8', '9']

export default function SpellsCRUD({ hechizos = [], onChange }) {
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(EMPTY)
  const set = k => e => setDraft(p => ({ ...p, [k]: e.target.value }))

  function startAdd() { setDraft(EMPTY); setEditingId('new') }
  function startEdit(h) { setDraft({ ...h }); setEditingId(h.id) }
  function cancel() { setEditingId(null) }

  function confirm() {
    const item = { ...draft, nivel: parseInt(draft.nivel) || 0 }
    if (editingId === 'new') {
      onChange([...hechizos, { ...item, id: Date.now() }])
    } else {
      onChange(hechizos.map(h => h.id === editingId ? { ...item, id: editingId } : h))
    }
    setEditingId(null)
  }

  function remove(id) { onChange(hechizos.filter(h => h.id !== id)) }

  const inlineForm = (
    <div className="bg-bg-mid border border-border-base p-3 mt-2">
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div><label className={labelCls}>Nombre del hechizo</label><input className={inputCls} value={draft.nombre} onChange={set('nombre')} /></div>
        <div>
          <label className={labelCls}>Nivel</label>
          <select className={inputCls} value={draft.nivel} onChange={set('nivel')}>
            {LEVELS.map((l, i) => <option key={i} value={i}>{l}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" className={btnSecondary} onClick={cancel}>Cancelar</button>
        <button type="button" className="inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-accent text-white hover:bg-accent-bright border-none" onClick={confirm}>Guardar</button>
      </div>
    </div>
  )

  const byLevel = {}
  hechizos.forEach(h => {
    const lvl = h.nivel ?? 0
    if (!byLevel[lvl]) byLevel[lvl] = []
    byLevel[lvl].push(h)
  })
  const LEVEL_LABELS = ['Trucos', 'Niv 1', 'Niv 2', 'Niv 3', 'Niv 4', 'Niv 5', 'Niv 6', 'Niv 7', 'Niv 8', 'Niv 9']

  return (
    <div>
      {Object.keys(byLevel).sort((a, b) => a - b).map(lvl => (
        <div key={lvl} className="mb-3">
          <div className="font-exo text-[10px] text-txt-muted uppercase tracking-[0.15em] mb-1.5">{LEVEL_LABELS[lvl] ?? `Niv ${lvl}`}</div>
          <div className="space-y-1">
            {byLevel[lvl].map(h => (
              <div key={h.id}>
                {editingId === h.id ? inlineForm : (
                  <div className="flex items-center gap-2 text-[13px]">
                    <span className="text-txt-primary flex-1">{h.nombre}</span>
                    <button type="button" className="text-txt-muted hover:text-txt-primary text-[11px]" onClick={() => startEdit(h)}>✎</button>
                    <button type="button" className="text-accent hover:text-accent-bright text-[11px]" onClick={() => remove(h.id)}>✕</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      {editingId === 'new' && inlineForm}
      {editingId === null && (
        <button type="button" className="font-exo text-[11px] text-accent hover:text-accent-bright transition-colors mt-1" onClick={startAdd}>
          + Agregar hechizo
        </button>
      )}
    </div>
  )
}
```

- [ ] **Commit:**
```bash
git add src/pages/pj/form/SpellsCRUD.jsx
git commit -m "feat: SpellsCRUD inline CRUD widget for hechizos array"
```

---

### Task 18: src/pages/pj/form/EquipmentCRUD.jsx

**Files:**
- Create: `src/pages/pj/form/EquipmentCRUD.jsx`

Manages the `equipo` array and `monedas` object.

- [ ] **Create the file:**

```jsx
import { useState } from 'react'
import { labelCls, inputCls, btnSecondary } from '../../../components/FormModal'

const EMPTY = { nombre: '', cantidad: 1, descripcion: '' }
const CURRENCY_FIELDS = ['pp', 'gp', 'ep', 'sp', 'cp']

export default function EquipmentCRUD({ equipo = [], monedas = {}, onEquipoChange, onMonedasChange }) {
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(EMPTY)
  const set = k => e => setDraft(p => ({ ...p, [k]: e.target.value }))
  const setMoneda = k => e => onMonedasChange({ ...monedas, [k]: parseInt(e.target.value) || 0 })

  function startAdd() { setDraft(EMPTY); setEditingId('new') }
  function startEdit(item) { setDraft({ ...item }); setEditingId(item.id) }
  function cancel() { setEditingId(null) }

  function confirm() {
    const item = { ...draft, cantidad: parseInt(draft.cantidad) || 1 }
    if (editingId === 'new') {
      onEquipoChange([...equipo, { ...item, id: Date.now() }])
    } else {
      onEquipoChange(equipo.map(e => e.id === editingId ? { ...item, id: editingId } : e))
    }
    setEditingId(null)
  }

  function remove(id) { onEquipoChange(equipo.filter(e => e.id !== id)) }

  const inlineForm = (
    <div className="bg-bg-mid border border-border-base p-3 mt-1 mb-2">
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div><label className={labelCls}>Nombre</label><input className={inputCls} value={draft.nombre} onChange={set('nombre')} /></div>
        <div><label className={labelCls}>Cantidad</label><input className={inputCls} type="number" min="1" value={draft.cantidad} onChange={set('cantidad')} /></div>
        <div className="col-span-2"><label className={labelCls}>Descripción</label><input className={inputCls} value={draft.descripcion} onChange={set('descripcion')} /></div>
      </div>
      <div className="flex gap-2">
        <button type="button" className={btnSecondary} onClick={cancel}>Cancelar</button>
        <button type="button" className="inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-accent text-white hover:bg-accent-bright border-none" onClick={confirm}>Guardar</button>
      </div>
    </div>
  )

  return (
    <div>
      {equipo.map(item => (
        <div key={item.id}>
          {editingId === item.id ? inlineForm : (
            <div className="flex items-center gap-2 py-1 border-b border-border-base/40 text-[13px]">
              <span className="text-txt-primary font-medium flex-1">{item.nombre}</span>
              {item.cantidad > 1 && <span className="text-txt-muted">×{item.cantidad}</span>}
              {item.descripcion && <span className="text-txt-muted text-[12px] truncate max-w-[200px]">{item.descripcion}</span>}
              <button type="button" className="text-txt-muted hover:text-txt-primary text-[11px]" onClick={() => startEdit(item)}>✎</button>
              <button type="button" className="text-accent hover:text-accent-bright text-[11px]" onClick={() => remove(item.id)}>✕</button>
            </div>
          )}
        </div>
      ))}
      {editingId === 'new' && inlineForm}
      {editingId === null && (
        <button type="button" className="font-exo text-[11px] text-accent hover:text-accent-bright transition-colors mt-1 mb-4" onClick={startAdd}>
          + Agregar ítem
        </button>
      )}

      <div className="border-t border-border-base pt-3 mt-2">
        <div className={`${labelCls} mb-2`}>Monedas</div>
        <div className="grid grid-cols-5 gap-2">
          {CURRENCY_FIELDS.map(key => (
            <div key={key} className="text-center">
              <label className={`${labelCls} text-center block`}>{key.toUpperCase()}</label>
              <input className={`${inputCls} text-center`} type="number" min="0" value={monedas[key] ?? 0} onChange={setMoneda(key)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Commit:**
```bash
git add src/pages/pj/form/EquipmentCRUD.jsx
git commit -m "feat: EquipmentCRUD inline CRUD for equipo array and monedas"
```

---

### Task 19: src/pages/pj/form/PJIdentityTab.jsx

**Files:**
- Create: `src/pages/pj/form/PJIdentityTab.jsx`

- [ ] **Create the file.** Receives `f` (form state), `setF` (setter), `isDM`, and `item` (existing PJ or null for new). Also receives `newPlayerPwd`, `setNewPlayerPwd`, `showPlayerPwd`, `setShowPlayerPwd`, `accessStatus`, `handleResetAccess` for the access section.

```jsx
import { FormGroup, FormRow, EstadoField, labelCls, inputCls } from '../../../components/FormModal'
import { regionOptions } from '../../../helpers'
import { regionLabel } from '../../../helpers'
import { Eye, EyeOff } from 'lucide-react'

const btnSecondary = 'inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-transparent text-txt-secondary border border-border-light hover:border-accent-dim hover:text-txt-primary'

function Separator({ label }) {
  return (
    <div className="px-8 mt-5 mb-3">
      <div className="font-exo text-[9px] font-semibold tracking-[0.25em] uppercase text-txt-muted border-t border-border-base pt-3">{label}</div>
    </div>
  )
}

export default function PJIdentityTab({ f, setF, isDM, item, newPlayerPwd, setNewPlayerPwd, showPlayerPwd, setShowPlayerPwd, accessStatus, handleResetAccess }) {
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
      <FormRow>
        <div><label className={labelCls}>Nombre</label><input className={inputCls} value={f.nombre} onChange={set('nombre')} /></div>
        <div><label className={labelCls}>Jugador</label><input className={inputCls} value={f.jugador} onChange={set('jugador')} /></div>
      </FormRow>
      <FormRow>
        <div><label className={labelCls}>Clase</label><input className={inputCls} value={f.clase} onChange={set('clase')} placeholder="Ej: Paladín, Pícaro..." /></div>
        <div><label className={labelCls}>Raza / Especie</label><input className={inputCls} value={f.raza} onChange={set('raza')} placeholder="Ej: Humano, Dracónido..." /></div>
      </FormRow>
      <FormRow>
        <div><label className={labelCls}>Trasfondo D&D</label><input className={inputCls} value={f.trasfondo_dnd} onChange={set('trasfondo_dnd')} placeholder="Ej: Soldado, Sabio, Criminal..." /></div>
        <div><label className={labelCls}>Alineamiento</label><input className={inputCls} value={f.alineamiento} onChange={set('alineamiento')} placeholder="Ej: Leal Bueno" /></div>
      </FormRow>
      <FormRow>
        <div>
          <label className={labelCls}>Nivel</label>
          <input className={inputCls} type="number" value={f.nivel} onChange={set('nivel')} min="1" max="20" />
        </div>
        <div>
          <label className={labelCls}>Región de Origen</label>
          <select className={inputCls} value={f.region} onChange={set('region')}>
            {regionOptions.map(r => <option key={r} value={r}>{regionLabel[r]}</option>)}
          </select>
        </div>
      </FormRow>
      <FormRow>
        <div><label className={labelCls}>Experiencia (XP)</label><input className={inputCls} type="number" value={f.experiencia} onChange={set('experiencia')} min="0" /></div>
        <div className="flex items-end">
          <div className="w-full">
            <label className={labelCls}>Imagen (URL externa)</label>
            <input className={inputCls} type="url" placeholder="https://i.imgur.com/..." value={f.imagen_url} onChange={set('imagen_url')} />
          </div>
        </div>
      </FormRow>
      {f.imagen_url && (
        <FormGroup>
          <img src={f.imagen_url} alt="preview" className="max-w-full max-h-[140px] rounded-md object-cover" onError={e => e.target.style.display = 'none'} />
        </FormGroup>
      )}

      <Separator label="Apariencia Física" />
      <FormRow>
        <div><label className={labelCls}>Edad</label><input className={inputCls} value={f.edad} onChange={set('edad')} /></div>
        <div><label className={labelCls}>Altura</label><input className={inputCls} value={f.altura} onChange={set('altura')} placeholder="Ej: 1.75m" /></div>
      </FormRow>
      <FormRow>
        <div><label className={labelCls}>Peso</label><input className={inputCls} value={f.peso} onChange={set('peso')} /></div>
        <div><label className={labelCls}>Ojos</label><input className={inputCls} value={f.ojos} onChange={set('ojos')} /></div>
      </FormRow>
      <FormRow>
        <div><label className={labelCls}>Piel</label><input className={inputCls} value={f.piel} onChange={set('piel')} /></div>
        <div><label className={labelCls}>Pelo</label><input className={inputCls} value={f.pelo} onChange={set('pelo')} /></div>
      </FormRow>
      <FormGroup>
        <label className={labelCls}>Notas de Apariencia</label>
        <textarea className={`${inputCls} resize-y min-h-[70px]`} rows={3} value={f.apariencia} onChange={set('apariencia')} />
      </FormGroup>

      <Separator label="Personalidad" />
      <FormRow>
        <div><label className={labelCls}>Rasgos de Personalidad</label><textarea className={`${inputCls} resize-y min-h-[70px]`} rows={3} value={f.personalidad} onChange={set('personalidad')} /></div>
        <div><label className={labelCls}>Ideales</label><textarea className={`${inputCls} resize-y min-h-[70px]`} rows={3} value={f.ideales} onChange={set('ideales')} /></div>
      </FormRow>
      <FormRow>
        <div><label className={labelCls}>Vínculos</label><textarea className={`${inputCls} resize-y min-h-[70px]`} rows={3} value={f.vinculos} onChange={set('vinculos')} /></div>
        <div><label className={labelCls}>Defectos</label><textarea className={`${inputCls} resize-y min-h-[70px]`} rows={3} value={f.defectos} onChange={set('defectos')} /></div>
      </FormRow>

      <Separator label="Trasfondo & Campaña" />
      <FormGroup><label className={labelCls}>Trasfondo / Historia</label><textarea className={`${inputCls} resize-y min-h-[90px]`} rows={4} value={f.trasfondo} onChange={set('trasfondo')} /></FormGroup>
      <FormGroup><label className={labelCls}>Motivación para unirse al Gremio</label><textarea className={`${inputCls} resize-y min-h-[70px]`} rows={2} value={f.motivo} onChange={set('motivo')} /></FormGroup>
      <FormGroup><label className={labelCls}>Relación con la Magralita</label><textarea className={`${inputCls} resize-y min-h-[70px]`} rows={2} value={f.magralita} onChange={set('magralita')} /></FormGroup>
      {isDM && <FormGroup><label className={labelCls}>Notas del DM (privadas 🔒)</label><textarea className={`${inputCls} resize-y min-h-[70px]`} rows={3} value={f.notas} onChange={set('notas')} /></FormGroup>}

      {isDM && item && (
        <FormGroup className="border-t border-border-base pt-[18px] !mb-0">
          <label className={labelCls}>Acceso del jugador</label>
          <div className="flex items-center gap-2 mb-2.5 text-[12px]">
            <span className="text-txt-muted">Estado:</span>
            {accessStatus}
          </div>
          <div className="relative">
            <input
              className={`${inputCls} pr-10`}
              type={showPlayerPwd ? 'text' : 'password'}
              placeholder="Nueva contraseña inicial…"
              value={newPlayerPwd}
              onChange={e => setNewPlayerPwd(e.target.value)}
            />
            <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-txt-muted hover:text-txt-primary" onClick={() => setShowPlayerPwd(v => !v)} tabIndex={-1}>
              {showPlayerPwd ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {item.player_password && (
            <div className="flex gap-2 mt-2">
              <button className={btnSecondary} onClick={handleResetAccess} type="button">Quitar acceso</button>
            </div>
          )}
          <p className="text-[11px] text-txt-muted mt-1.5 mb-0">Al setear una contraseña nueva el jugador deberá cambiarla en su primer acceso.</p>
        </FormGroup>
      )}

      <EstadoField estado={f.estado} visibilidad={f.visibilidad} setF={setF} />
    </div>
  )
}
```

- [ ] **Commit:**
```bash
git add src/pages/pj/form/PJIdentityTab.jsx
git commit -m "feat: PJIdentityTab — identity, appearance, personality, access fields"
```

---

### Task 20: src/pages/pj/form/PJMechanicsTab.jsx

**Files:**
- Create: `src/pages/pj/form/PJMechanicsTab.jsx`

- [ ] **Create the file:**

```jsx
import { FormGroup, FormRow, labelCls, inputCls } from '../../../components/FormModal'
import { ABILITY_SCORES, SKILLS_BY_ABILITY } from '../pjConstants'
import { passivePerception, suggestedProfBonus } from '../../../helpers/pjCalc'
import SkillsProficiencyGrid from './SkillsProficiencyGrid'

function Separator({ label }) {
  return (
    <div className="px-8 mt-5 mb-3">
      <div className="font-exo text-[9px] font-semibold tracking-[0.25em] uppercase text-txt-muted border-t border-border-base pt-3">{label}</div>
    </div>
  )
}

export default function PJMechanicsTab({ f, setF }) {
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))
  const suggestedProf = suggestedProfBonus(parseInt(f.nivel) || 1)
  const passivePerc = passivePerception(f)

  return (
    <div>
      <FormRow>
        <div>
          <label className={labelCls}>Bono Proficiencia</label>
          <input className={inputCls} type="number" value={f.stat_proficiency_bonus} onChange={set('stat_proficiency_bonus')} min="2" max="6" />
          <div className="text-[11px] text-txt-muted mt-1">Sugerido para nv. {f.nivel || 1}: +{suggestedProf}</div>
        </div>
        <div><label className={labelCls}>Dados de Golpe</label><input className={inputCls} value={f.stat_hit_dice} onChange={set('stat_hit_dice')} placeholder="Ej: 5d8" /></div>
      </FormRow>
      <FormGroup>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input type="checkbox" checked={!!f.stat_inspiration} onChange={e => setF(p => ({ ...p, stat_inspiration: e.target.checked }))} />
          <span className={labelCls} style={{ marginBottom: 0 }}>Inspiración</span>
        </label>
      </FormGroup>

      <Separator label="Atributos" />
      <div className="px-8 mb-[18px]">
        <div className="grid grid-cols-6 gap-2 max-md:grid-cols-3">
          {ABILITY_SCORES.map(({ label, key }) => (
            <div key={key} className="text-center">
              <label className={`${labelCls} text-center block`}>{label}</label>
              <input className={`${inputCls} text-center`} type="number" value={f[key]} onChange={set(key)} min="1" max="30" />
            </div>
          ))}
        </div>
      </div>

      <Separator label="Combate" />
      <div className="px-8 mb-[18px]">
        <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2">
          <div><label className={labelCls}>HP Máx.</label><input className={inputCls} type="number" value={f.stat_hp} onChange={set('stat_hp')} min="0" /></div>
          <div><label className={labelCls}>AC</label><input className={inputCls} type="number" value={f.stat_ac} onChange={set('stat_ac')} min="0" /></div>
          <div><label className={labelCls}>Velocidad (ft)</label><input className={inputCls} type="number" value={f.stat_speed} onChange={set('stat_speed')} min="0" /></div>
          <div><label className={labelCls}>Iniciativa</label><input className={inputCls} type="number" value={f.stat_initiative} onChange={set('stat_initiative')} /></div>
        </div>
      </div>

      <Separator label="Tiradas de Salvación" />
      <div className="px-8 mb-[18px]">
        <div className="grid grid-cols-6 gap-2 max-md:grid-cols-3">
          {ABILITY_SCORES.map(({ label, saveKey }) => (
            <label key={saveKey} className="flex flex-col items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={!!f[saveKey]} onChange={e => setF(p => ({ ...p, [saveKey]: e.target.checked }))} />
              <span className="font-exo text-[11px] text-txt-muted">{label}</span>
            </label>
          ))}
        </div>
      </div>

      <Separator label="Habilidades" />
      <div className="px-8 mb-[18px]">
        <div className="flex items-center gap-4 mb-3">
          <span className="font-exo text-[10px] text-txt-muted uppercase tracking-[0.15em]">Percepción Pasiva:</span>
          <span className="font-exo text-[16px] font-bold text-accent-dim">{passivePerc}</span>
        </div>
        <SkillsProficiencyGrid f={f} setF={setF} />
      </div>

      <Separator label="Hechicería (opcional)" />
      <FormRow>
        <div><label className={labelCls}>DC Conjuración</label><input className={inputCls} type="number" value={f.spell_dc} onChange={set('spell_dc')} min="0" /></div>
        <div><label className={labelCls}>Bono Ataque Hechizo</label><input className={inputCls} type="number" value={f.spell_attack_bonus} onChange={set('spell_attack_bonus')} /></div>
      </FormRow>
      <FormGroup>
        <label className={labelCls}>Atributo de Conjuración</label>
        <select className={inputCls} value={f.spell_ability} onChange={set('spell_ability')}>
          <option value="INT">INT</option>
          <option value="SAB">SAB</option>
          <option value="CAR">CAR</option>
        </select>
      </FormGroup>
      <div className="px-8 mb-[18px]">
        <label className={labelCls}>Slots por Nivel</label>
        <div className="grid grid-cols-9 gap-1.5 mt-1.5">
          {[1,2,3,4,5,6,7,8,9].map(lvl => (
            <div key={lvl} className="text-center">
              <div className="font-exo text-[10px] text-txt-muted mb-1">Niv {lvl}</div>
              <input
                className={`${inputCls} text-center px-1`}
                type="number" min="0" max="9"
                value={f.spell_slots[String(lvl)] ?? 0}
                onChange={e => setF(p => ({ ...p, spell_slots: { ...p.spell_slots, [String(lvl)]: parseInt(e.target.value) || 0 } }))}
              />
            </div>
          ))}
        </div>
      </div>

      <Separator label="Tiradas de Muerte" />
      <FormRow>
        <div><label className={labelCls}>Éxitos (0–3)</label><input className={inputCls} type="number" value={f.stat_death_saves_success} onChange={set('stat_death_saves_success')} min="0" max="3" /></div>
        <div><label className={labelCls}>Fallos (0–3)</label><input className={inputCls} type="number" value={f.stat_death_saves_failure} onChange={set('stat_death_saves_failure')} min="0" max="3" /></div>
      </FormRow>
    </div>
  )
}
```

- [ ] **Commit:**
```bash
git add src/pages/pj/form/PJMechanicsTab.jsx
git commit -m "feat: PJMechanicsTab — attributes, saves, skills proficiency, spellcasting"
```

---

### Task 21: src/pages/pj/form/PJInventoryTab.jsx

**Files:**
- Create: `src/pages/pj/form/PJInventoryTab.jsx`

- [ ] **Create the file:**

```jsx
import { FormGroup, labelCls, inputCls } from '../../../components/FormModal'
import AttacksCRUD from './AttacksCRUD'
import SpellsCRUD from './SpellsCRUD'
import EquipmentCRUD from './EquipmentCRUD'

function Separator({ label }) {
  return (
    <div className="px-8 mt-5 mb-3">
      <div className="font-exo text-[9px] font-semibold tracking-[0.25em] uppercase text-txt-muted border-t border-border-base pt-3">{label}</div>
    </div>
  )
}

export default function PJInventoryTab({ f, setF }) {
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
      <Separator label="Ataques" />
      <div className="px-8 mb-[18px]">
        <AttacksCRUD
          ataques={f.ataques}
          onChange={items => setF(p => ({ ...p, ataques: items }))}
        />
      </div>

      <Separator label="Hechizos" />
      <div className="px-8 mb-[18px]">
        <SpellsCRUD
          hechizos={f.hechizos}
          onChange={items => setF(p => ({ ...p, hechizos: items }))}
        />
      </div>

      <Separator label="Equipo" />
      <div className="px-8 mb-[18px]">
        <EquipmentCRUD
          equipo={f.equipo}
          monedas={f.monedas}
          onEquipoChange={items => setF(p => ({ ...p, equipo: items }))}
          onMonedasChange={m => setF(p => ({ ...p, monedas: m }))}
        />
      </div>

      <Separator label="Proficiencias & Rasgos" />
      <FormGroup>
        <label className={labelCls}>Idiomas</label>
        <textarea className={`${inputCls} resize-y min-h-[60px]`} rows={2} value={f.idiomas} onChange={set('idiomas')} placeholder="Ej: Común, Élfico, Enano" />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>Prof. Armas</label>
        <textarea className={`${inputCls} resize-y min-h-[60px]`} rows={2} value={f.prof_armas} onChange={set('prof_armas')} />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>Prof. Armaduras</label>
        <textarea className={`${inputCls} resize-y min-h-[60px]`} rows={2} value={f.prof_armaduras} onChange={set('prof_armaduras')} />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>Prof. Herramientas</label>
        <textarea className={`${inputCls} resize-y min-h-[60px]`} rows={2} value={f.prof_herramientas} onChange={set('prof_herramientas')} />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>Rasgos de Clase</label>
        <textarea className={`${inputCls} resize-y min-h-[120px]`} rows={5} value={f.rasgos_clase} onChange={set('rasgos_clase')} placeholder="Rasgos y habilidades de clase, subclase..." />
      </FormGroup>
      <FormGroup>
        <label className={labelCls}>Otros Rasgos</label>
        <textarea className={`${inputCls} resize-y min-h-[90px]`} rows={3} value={f.otros_rasgos} onChange={set('otros_rasgos')} />
      </FormGroup>
    </div>
  )
}
```

- [ ] **Commit:**
```bash
git add src/pages/pj/form/PJInventoryTab.jsx
git commit -m "feat: PJInventoryTab — attacks, spells, equipment, proficiencies"
```

---

### Task 22: src/pages/pj/PJForm.jsx

**Files:**
- Create: `src/pages/pj/PJForm.jsx`

- [ ] **Create the file** (3-tab container, manages full `f` state, handles save):

```jsx
import { useState } from 'react'
import { useApp } from '../../AppContext'
import { btnPrimary, btnSecondary, btnDanger } from '../../components/FormModal'
import PJIdentityTab from './form/PJIdentityTab'
import PJMechanicsTab from './form/PJMechanicsTab'
import PJInventoryTab from './form/PJInventoryTab'

const TABS = [
  { id: 'identidad', label: 'Identidad' },
  { id: 'mecanicas', label: 'Mecánicas' },
  { id: 'inventario', label: 'Equipo & Rasgos' },
]

export default function PJForm({ item }) {
  const { save, remove, closeForm, isDM } = useApp()
  const [tab, setTab] = useState('identidad')
  const [newPlayerPwd, setNewPlayerPwd] = useState('')
  const [showPlayerPwd, setShowPlayerPwd] = useState(false)

  const [f, setF] = useState({
    // Core identity
    nombre: item?.nombre ?? '',
    jugador: item?.jugador ?? '',
    clase: item?.clase ?? '',
    raza: item?.raza ?? '',
    nivel: item?.nivel ?? 1,
    region: item?.region ?? 'magral',
    imagen_url: item?.imagen_url ?? '',
    estado: item?.estado ?? 'publicado',
    visibilidad: item?.visibilidad ?? [],
    // Extended identity
    trasfondo_dnd: item?.trasfondo_dnd ?? '',
    alineamiento: item?.alineamiento ?? '',
    experiencia: item?.experiencia ?? 0,
    // Physical
    edad: item?.edad ?? '',
    altura: item?.altura ?? '',
    peso: item?.peso ?? '',
    ojos: item?.ojos ?? '',
    piel: item?.piel ?? '',
    pelo: item?.pelo ?? '',
    apariencia: item?.apariencia ?? '',
    // Personality
    personalidad: item?.personalidad ?? '',
    ideales: item?.ideales ?? '',
    vinculos: item?.vinculos ?? '',
    defectos: item?.defectos ?? '',
    // Narrative
    trasfondo: item?.trasfondo ?? '',
    motivo: item?.motivo ?? '',
    magralita: item?.magralita ?? '',
    notas: item?.notas ?? '',
    // Combat mechanics
    stat_str: item?.stat_str ?? 0,
    stat_dex: item?.stat_dex ?? 0,
    stat_con: item?.stat_con ?? 0,
    stat_int: item?.stat_int ?? 0,
    stat_wis: item?.stat_wis ?? 0,
    stat_cha: item?.stat_cha ?? 0,
    stat_hp: item?.stat_hp ?? 0,
    stat_ac: item?.stat_ac ?? 0,
    stat_speed: item?.stat_speed ?? 0,
    stat_initiative: item?.stat_initiative ?? 0,
    stat_proficiency_bonus: item?.stat_proficiency_bonus ?? 2,
    stat_inspiration: item?.stat_inspiration ?? false,
    stat_hit_dice: item?.stat_hit_dice ?? '',
    stat_death_saves_success: item?.stat_death_saves_success ?? 0,
    stat_death_saves_failure: item?.stat_death_saves_failure ?? 0,
    // Saving throws
    save_str: item?.save_str ?? false,
    save_dex: item?.save_dex ?? false,
    save_con: item?.save_con ?? false,
    save_int: item?.save_int ?? false,
    save_wis: item?.save_wis ?? false,
    save_cha: item?.save_cha ?? false,
    // Skills
    skill_acrobatics: item?.skill_acrobatics ?? 0,
    skill_animal_handling: item?.skill_animal_handling ?? 0,
    skill_arcana: item?.skill_arcana ?? 0,
    skill_athletics: item?.skill_athletics ?? 0,
    skill_deception: item?.skill_deception ?? 0,
    skill_history: item?.skill_history ?? 0,
    skill_insight: item?.skill_insight ?? 0,
    skill_intimidation: item?.skill_intimidation ?? 0,
    skill_investigation: item?.skill_investigation ?? 0,
    skill_medicine: item?.skill_medicine ?? 0,
    skill_nature: item?.skill_nature ?? 0,
    skill_perception: item?.skill_perception ?? 0,
    skill_performance: item?.skill_performance ?? 0,
    skill_persuasion: item?.skill_persuasion ?? 0,
    skill_religion: item?.skill_religion ?? 0,
    skill_sleight_of_hand: item?.skill_sleight_of_hand ?? 0,
    skill_stealth: item?.skill_stealth ?? 0,
    skill_survival: item?.skill_survival ?? 0,
    // Proficiencies & languages
    idiomas: item?.idiomas ?? '',
    prof_armas: item?.prof_armas ?? '',
    prof_armaduras: item?.prof_armaduras ?? '',
    prof_herramientas: item?.prof_herramientas ?? '',
    rasgos_clase: item?.rasgos_clase ?? '',
    otros_rasgos: item?.otros_rasgos ?? '',
    // Spellcasting
    spell_dc: item?.spell_dc ?? 0,
    spell_attack_bonus: item?.spell_attack_bonus ?? 0,
    spell_ability: item?.spell_ability ?? 'INT',
    spell_slots: item?.spell_slots ?? {},
    hechizos: item?.hechizos ?? [],
    // Attacks & equipment
    ataques: item?.ataques ?? [],
    equipo: item?.equipo ?? [],
    monedas: item?.monedas ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
  })

  const accessStatus = !item?.player_password
    ? <span className="text-txt-muted">Sin acceso</span>
    : item.player_must_change
      ? <span className="text-accent-bright">Debe cambiar contraseña</span>
      : <span className="text-[#7aad82]">Activo</span>

  function handleResetAccess() {
    save('pjs', { ...f, id: item?.id, nivel: parseInt(f.nivel) || 1, player_password: '', player_must_change: false })
  }

  function handleSave() {
    const data = {
      ...f,
      id: item?.id,
      nivel: parseInt(f.nivel) || 1,
      experiencia: parseInt(f.experiencia) || 0,
      stat_str: parseInt(f.stat_str) || 0,
      stat_dex: parseInt(f.stat_dex) || 0,
      stat_con: parseInt(f.stat_con) || 0,
      stat_int: parseInt(f.stat_int) || 0,
      stat_wis: parseInt(f.stat_wis) || 0,
      stat_cha: parseInt(f.stat_cha) || 0,
      stat_hp: parseInt(f.stat_hp) || 0,
      stat_ac: parseInt(f.stat_ac) || 0,
      stat_speed: parseInt(f.stat_speed) || 0,
      stat_initiative: parseInt(f.stat_initiative) || 0,
      stat_proficiency_bonus: parseInt(f.stat_proficiency_bonus) || 2,
      stat_death_saves_success: parseInt(f.stat_death_saves_success) || 0,
      stat_death_saves_failure: parseInt(f.stat_death_saves_failure) || 0,
      spell_dc: parseInt(f.spell_dc) || 0,
      spell_attack_bonus: parseInt(f.spell_attack_bonus) || 0,
    }
    if (newPlayerPwd.trim()) {
      data.player_password = newPlayerPwd.trim()
      data.player_must_change = true
    } else {
      data.player_password = item?.player_password ?? ''
      data.player_must_change = item?.player_must_change ?? false
    }
    save('pjs', data)
  }

  return (
    <div>
      <div className="font-exo text-[17px] font-bold text-txt-primary uppercase tracking-[0.06em] sticky top-0 z-[1] bg-bg-card px-8 pt-7 pb-0 border-b border-border-base">
        <div className="mb-0 pb-4">{item ? 'Editar PJ' : 'Nuevo Personaje Jugador'}</div>
        <div className="flex gap-0 -mb-px">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              className={`font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-5 py-2.5 border-none cursor-pointer transition-colors ${tab === t.id ? 'text-txt-primary border-b-2 border-b-accent bg-transparent' : 'text-txt-muted bg-transparent hover:text-txt-secondary border-b-2 border-b-transparent'}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pt-5">
        {tab === 'identidad' && (
          <PJIdentityTab
            f={f} setF={setF} isDM={isDM} item={item}
            newPlayerPwd={newPlayerPwd} setNewPlayerPwd={setNewPlayerPwd}
            showPlayerPwd={showPlayerPwd} setShowPlayerPwd={setShowPlayerPwd}
            accessStatus={accessStatus} handleResetAccess={handleResetAccess}
          />
        )}
        {tab === 'mecanicas' && <PJMechanicsTab f={f} setF={setF} />}
        {tab === 'inventario' && <PJInventoryTab f={f} setF={setF} />}
      </div>

      <div className="flex gap-2.5 justify-end sticky bottom-0 z-[1] bg-bg-card px-8 py-4 pb-6 border-t border-border-base mt-3">
        {item && <button className={btnDanger} onClick={() => remove('pjs', item.id)}>Eliminar</button>}
        <button className={btnSecondary} onClick={closeForm}>Cancelar</button>
        <button className={btnPrimary} onClick={handleSave}>Guardar</button>
      </div>
    </div>
  )
}
```

- [ ] **Commit:**
```bash
git add src/pages/pj/PJForm.jsx
git commit -m "feat: PJForm container with 3 tabs, full state, and handleSave"
```

---

### Task 23: src/pages/PJs.jsx — Refactor to shell

**Files:**
- Modify: `src/pages/PJs.jsx`

- [ ] **Replace the entire content of `src/pages/PJs.jsx`** with this thin shell:

```jsx
import { useState } from 'react'
import { useApp } from '../AppContext'
import { isVisible } from '../helpers'
import { PageHeader, EmptyState } from '../components/Shared'
import { Shield } from 'lucide-react'
import PJCard from './pj/PJCard'
import PJDetail from './pj/PJDetail'

export default function PJs() {
  const { db, openForm, isDM, currentPlayer } = useApp()
  const [selectedId, setSelectedId] = useState(null)
  const [query, setQuery] = useState('')

  if (selectedId !== null) {
    const pj = db.pjs.find(p => p.id === selectedId)
    if (pj) return <PJDetail pj={pj} onBack={() => setSelectedId(null)} />
  }

  const visible = db.pjs.filter(p => isVisible(p, isDM, currentPlayer))
  const lista = query.trim()
    ? visible.filter(p =>
        [p.nombre, p.clase, p.raza, p.jugador].some(v =>
          (v || '').toLowerCase().includes(query.toLowerCase())
        )
      )
    : visible

  return (
    <div>
      <PageHeader eyebrow="Personajes Jugadores" title="El Grupo">
        {isDM && (
          <button
            className="inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-4 py-2 cursor-pointer transition-all bg-accent text-white hover:bg-accent-bright border-none"
            onClick={() => openForm('pjs')}
          >
            + Nuevo PJ
          </button>
        )}
      </PageHeader>
      <div className="mb-5">
        <input
          className="w-full bg-bg-card border border-border-light text-txt-primary px-3.5 py-2.5 font-barlow text-[13px] outline-none transition-colors focus:border-accent-dim placeholder:text-txt-muted"
          placeholder="Buscar por nombre, clase, raza o jugador…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>
      {lista.length === 0 ? (
        <EmptyState
          icon={<Shield size={40} />}
          title="Sin resultados"
          text={query ? 'No hay PJs que coincidan con la búsqueda.' : 'Agregá los personajes jugadores creados en la sesión cero.'}
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3.5">
          {lista.map(p => (
            <PJCard key={p.id} pj={p} onClick={() => setSelectedId(p.id)} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Run `npm run dev` and verify:** cards load, clicking opens detail, back button works, Editar button opens form. No console errors.

- [ ] **Commit:**
```bash
git add src/pages/PJs.jsx
git commit -m "refactor: PJs.jsx becomes thin shell using PJCard and PJDetail"
```

---

### Task 24: FormModal.jsx — Wire PJForm import + remove old PJForm body

**Files:**
- Modify: `src/components/FormModal.jsx`

- [ ] **Add this import** at the top of the file (after existing imports):
```js
import PJForm from '../pages/pj/PJForm'
```

- [ ] **Remove the inline `PJForm` function** (lines 115–281 in the original file — the entire `function PJForm({ item }) { ... }` block).

- [ ] **The `FORM_COMPONENTS` object already has `pjs: PJForm`.** With the new import, it will now point to the new component. Verify the object still reads:
```js
const FORM_COMPONENTS = {
  sesiones: SesionForm,
  pjs: PJForm,
  pnjs: PNJForm,
  ...
}
```

- [ ] **Run `npm run dev` and test fully:**
  1. Open a PJ's edit form — all 3 tabs appear (Identidad, Mecánicas, Equipo & Rasgos)
  2. Fill in a few fields across tabs, hit Guardar — data saves and appears in detail view
  3. Verify the detail page shows Skills section when skill proficiencies are set
  4. Verify the anchor nav appears and scrolling works
  5. Verify existing PJs (without new fields) still load correctly with no errors

- [ ] **Commit:**
```bash
git add src/components/FormModal.jsx
git commit -m "feat: wire PJForm from pages/pj into FormModal, remove old inline PJForm"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Extended identity fields (trasfondo_dnd, alineamiento, experiencia) — Task 19
- ✅ Physical description badges (edad, altura, peso, ojos, piel, pelo, apariencia) — Task 13
- ✅ Personality fields (personalidad, ideales, vinculos, defectos) — Task 13
- ✅ Proficiency bonus, hit dice, inspiration, passive perception in stats — Task 7
- ✅ 6 saving throw proficiency booleans — Task 20
- ✅ 18 skill proficiency values (0/1/2) — Tasks 8, 15, 20
- ✅ Skills grouped by attribute in detail — Task 8
- ✅ SkillsProficiencyGrid cycling in form — Task 15
- ✅ Passive perception calculated live in form — Task 20
- ✅ Attacks CRUD — Tasks 9, 16, 21
- ✅ Spells CRUD + slots — Tasks 10, 17, 21
- ✅ Equipment CRUD + monedas — Tasks 11, 18, 21
- ✅ Proficiencies & languages textareas — Tasks 12, 21
- ✅ Traits textareas — Tasks 12, 21
- ✅ Anchor navigation with conditional visibility — Task 14
- ✅ Sticky anchor bar — Task 14
- ✅ 3-tab form — Task 22
- ✅ Backward compatible (new fields are `?? default`) — Task 3
- ✅ pjCalc.js with all derived calc functions — Task 1
- ✅ Clean architecture (one file per responsibility) — all tasks
- ✅ Existing card UI preserved — Task 5
- ✅ Existing narrative section preserved — Task 6
- ✅ Player access management preserved — Task 19

**Type consistency:**
- `passivePerception(pj)` called in Task 7 (PJStatsSection) and Task 20 (PJMechanicsTab) — both import from `pjCalc.js` ✅
- `SKILLS_BY_ABILITY` used in Tasks 8, 14, 15, 20 — all import from `pjConstants.js` ✅
- `ABILITY_SCORES` shape changed to `{ label, key, saveKey }` — updated in Tasks 5, 7, 20 ✅
- `FormGroup`, `FormRow`, etc. exported in Task 4, imported in Tasks 19–21 ✅
- CRUD `onChange` signature consistent: receives new array, Tasks 16/17/18 match Tasks 21's calls ✅
