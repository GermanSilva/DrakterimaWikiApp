export const ABILITY_SCORES = [
  { label: 'FUE', full: 'Fuerza', color: '#DC1D1D', key: 'stat_str', saveKey: 'save_str' },
  { label: 'DES', full: 'Destreza', color: '#25A514', key: 'stat_dex', saveKey: 'save_dex' },
  { label: 'CON', full: 'Constitución', color: '#fcab29', key: 'stat_con', saveKey: 'save_con' },
  { label: 'INT', full: 'Inteligencia', color: '#227eda', key: 'stat_int', saveKey: 'save_int' },
  { label: 'SAB', full: 'Sabiduría', color: '#9026c1', key: 'stat_wis', saveKey: 'save_wis' },
  { label: 'CAR', full: 'Carisma', color: '#fddb1c', key: 'stat_cha', saveKey: 'save_cha' },
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
