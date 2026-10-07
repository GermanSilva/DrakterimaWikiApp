/** A plain object, or {} for anything else (a corrupted `custom_fields` string / array / null must not reach the inputs). */
const plainObject = v => (typeof v === 'object' && v !== null && !Array.isArray(v) ? v : {})

/**
 * Form state of a character (one flat object seeded from the entity) and the payload built from it.
 * Shared by the form and by the hub host: the host diffs the payload of the form's CURRENT values against
 * the payload of its INITIAL values, so only what the user really edited is written (defaults the entity
 * lacks, like `stat_hp_current` seeded from `stat_hp`, never travel).
 *
 * @param {Record<string, any> | null | undefined} item the character being edited (null = new)
 * @param {{ regions?: { key: string }[], characterFields?: readonly { key: string, flat?: boolean }[] }} [ctx]
 * @returns {Record<string, any>}
 */
export function buildPjFormState(item, { regions = [], characterFields = [] } = {}) {
  const flatFields = characterFields.filter(fld => fld.flat)
  const hasCustomFields = characterFields.some(fld => !fld.flat)
  return {
    // Core identity
    nombre: item?.nombre ?? '',
    jugador: item?.jugador ?? '',
    clase: item?.clase ?? '',
    raza: item?.raza ?? '',
    nivel: item?.nivel ?? 1,
    region: item?.region ?? regions[0]?.key ?? 'magral',
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
    ...Object.fromEntries(flatFields.map(fld => [fld.key, item?.[fld.key] ?? ''])),
    ...(hasCustomFields && { custom_fields: plainObject(item?.custom_fields) }),
    notas: item?.notas ?? '',
    // Combat mechanics
    stat_str: item?.stat_str ?? 0,
    stat_dex: item?.stat_dex ?? 0,
    stat_con: item?.stat_con ?? 0,
    stat_int: item?.stat_int ?? 0,
    stat_wis: item?.stat_wis ?? 0,
    stat_cha: item?.stat_cha ?? 0,
    stat_hp: item?.stat_hp ?? 0,
    stat_hp_current: item?.stat_hp_current ?? item?.stat_hp ?? 0,
    stat_hp_temp: item?.stat_hp_temp ?? 0,
    stat_ac: item?.stat_ac ?? 0,
    stat_ac_temp: item?.stat_ac_temp ?? 0,
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
    spell_slots_current: item?.spell_slots_current ?? {},
    hechizos: item?.hechizos ?? [],
    // Attacks & equipment
    ataques: item?.ataques ?? [],
    equipo: item?.equipo ?? [],
    recursos: item?.recursos ?? [],
    monedas: item?.monedas ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    monedas_guardado: item?.monedas_guardado ?? {},
  }
}

/**
 * The values the form saves: the state with every numeric field coerced the way the legacy form did.
 *
 * @param {Record<string, any>} f
 * @param {number | undefined} id
 * @returns {Record<string, any>}
 */
export function toPjPayload(f, id) {
  return {
    ...f,
    id,
    nivel: parseInt(f.nivel) || 1,
    experiencia: parseInt(f.experiencia) || 0,
    stat_str: parseInt(f.stat_str) || 0,
    stat_dex: parseInt(f.stat_dex) || 0,
    stat_con: parseInt(f.stat_con) || 0,
    stat_int: parseInt(f.stat_int) || 0,
    stat_wis: parseInt(f.stat_wis) || 0,
    stat_cha: parseInt(f.stat_cha) || 0,
    stat_hp: parseInt(f.stat_hp) || 0,
    stat_hp_current: parseInt(f.stat_hp_current) || 0,
    stat_hp_temp: parseInt(f.stat_hp_temp) || 0,
    stat_ac: parseInt(f.stat_ac) || 0,
    stat_ac_temp: parseInt(f.stat_ac_temp) || 0,
    stat_speed: parseInt(f.stat_speed) || 0,
    stat_initiative: parseInt(f.stat_initiative) || 0,
    stat_proficiency_bonus: parseInt(f.stat_proficiency_bonus) || 2,
    stat_death_saves_success: parseInt(f.stat_death_saves_success) || 0,
    stat_death_saves_failure: parseInt(f.stat_death_saves_failure) || 0,
    spell_dc: parseInt(f.spell_dc) || 0,
    spell_attack_bonus: parseInt(f.spell_attack_bonus) || 0,
  }
}
