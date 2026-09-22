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

const ABILITY_KEYS = ABILITY_SCORES.map(a => a.key)
const SAVE_KEYS = ABILITY_SCORES.map(a => a.saveKey)
const SKILL_KEYS = SKILLS_BY_ABILITY.flatMap(g => g.skills.map(s => s.key))

export const SECTION_FIELDS = {
  stats: [
    ...ABILITY_KEYS, 'stat_hp', 'stat_hp_current', 'stat_hp_temp', 'stat_ac', 'stat_ac_temp', 'stat_speed',
    'stat_initiative', 'stat_hit_dice', 'stat_inspiration', 'stat_proficiency_bonus', 'skill_perception',
  ],
  habilidades: [...ABILITY_KEYS, ...SAVE_KEYS, ...SKILL_KEYS, 'stat_proficiency_bonus'],
  ataques: ['ataques'],
  hechizos: ['hechizos', 'spell_dc', 'spell_attack_bonus', 'spell_ability', 'spell_slots', 'spell_slots_current'],
  recursos: ['recursos'],
  equipo: ['equipo', 'monedas', 'monedas_guardado'],
  rasgos: ['rasgos_clase', 'otros_rasgos', 'idiomas', 'prof_armas', 'prof_armaduras', 'prof_herramientas'],
  narrativa: ['trasfondo', 'motivo', 'magralita'],
  apariencia: ['edad', 'altura', 'peso', 'ojos', 'piel', 'pelo', 'apariencia', 'personalidad', 'ideales', 'vinculos', 'defectos'],
  dm: ['notas'],
}

export const UNTRACKED_FIELDS = [
  'id', 'createdAt', 'updatedAt', 'sections_updated', 'player_password', 'player_must_change',
  'stat_death_saves_success', 'stat_death_saves_failure', 'experiencia', 'trasfondo_dnd',
]

export const SECTION_SHOW = {
  stats: () => true,
  habilidades: () => true,
  ataques: p => p.ataques?.length > 0,
  hechizos: p => !!(p.hechizos?.length > 0 || Object.keys(p.spell_slots ?? {}).length > 0),
  recursos: p => p.recursos?.length > 0,
  equipo: p => !!(p.equipo?.length > 0 || Object.values(p.monedas ?? {}).some(v => v > 0)),
  rasgos: p => !!(p.rasgos_clase || p.idiomas || p.prof_armas || p.prof_armaduras || p.prof_herramientas || p.otros_rasgos),
  narrativa: () => true,
  apariencia: p => !!(p.edad || p.altura || p.personalidad || p.ideales || p.vinculos || p.defectos || p.apariencia),
}
