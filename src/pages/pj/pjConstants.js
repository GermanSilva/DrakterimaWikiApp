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
