/**
 * The D&D 5e character sheet expressed with the sheet builder model (odd/design/sheet-builder.md, section 3).
 * It reuses TODAY's data keys so existing characters need no data rewrite, and its sections reuse today's unread
 * keys (stats, habilidades, ataques, ...). `DND5E_SHEET_GAPS` lists the keys of the current sheet that the model
 * cannot express yet; `dnd5eSheet.test.ts` keeps that list honest.
 */
import { ABILITY_SCORES, SKILLS_BY_ABILITY } from '../../../pages/pj/pjConstants'
import type { Block, Category, Column, Field, Item, Sheet, Table } from './sheetModel'

/**
 * Keys of today's sheet with no counterpart yet:
 *  - spell_slots / spell_slots_current: today objects keyed by spell level; the preset keeps them as the free table
 *    `espacios_conjuro` (one row per level: level, total, spent). The data conversion belongs to the stored-data migration.
 *  - monedas / monedas_guardado: stored in their own jsonb columns, written by the DM and by the lottery/pot RPCs;
 *    the coin table below describes the denominations only (S12, S14).
 *  - custom_fields: the per-campaign custom fields, superseded by the builder itself.
 */
export const DND5E_SHEET_GAPS: readonly string[] = ['spell_slots', 'spell_slots_current', 'monedas', 'monedas_guardado', 'custom_fields']

const num = (key: string, label: string, extra: Partial<Field> = {}): Field => ({ kind: 'field', key, label, type: 'number', editableBy: 'dm', ...extra })
const short = (key: string, label: string, editableBy: Field['editableBy'] = 'dm'): Field => ({ kind: 'field', key, label, type: 'short', editableBy })
const long = (key: string, label: string, editableBy: Field['editableBy'] = 'dm'): Field => ({ kind: 'field', key, label, type: 'paragraph', editableBy })
const col = (key: string, label: string, type: Column['type'], editableBy: Column['editableBy'] = 'player'): Column => ({ key, label, type, editableBy })

const MODIFIER = 'floor(({valor} - 10) / 2)'
const profBonus = (cond: string) => `si(${cond} > 0, {stat_proficiency_bonus}, 0)`
const SAVE_BONUS = `{modificador} + si({competente}, {stat_proficiency_bonus}, 0)`
const SKILL_BONUS = `{modificador} + ${profBonus('{competencia}')} + si({competencia} > 1, {stat_proficiency_bonus}, 0)`
const bonusColumn = (formula: string): Column => ({ key: 'bono', label: 'Bono', type: 'number', formula, format: 'signed', editableBy: 'dm' })
const PROFICIENT = (skill: string) => `si({${skill}} > 0, {stat_proficiency_bonus}, 0) + si({${skill}} > 1, {stat_proficiency_bonus}, 0)`

const statTable: Table = {
  kind: 'table',
  type: 'stat',
  key: 'tabla_stats',
  label: 'Atributos',
  rows: ABILITY_SCORES.map((a) => ({ key: a.key, label: a.label, modifier: MODIFIER, editableBy: 'dm' as const })),
}

const savesTable: Table = {
  kind: 'table',
  type: 'capacidades',
  key: 'tabla_salvaciones',
  label: 'Salvaciones',
  columns: [col('competente', 'Competente', 'boolean', 'dm'), bonusColumn(SAVE_BONUS)],
  rows: ABILITY_SCORES.map((a) => ({ key: a.saveKey, label: 'Salvación', stat: a.key, use: 'modificador' as const, editableBy: 'dm' as const })),
}

const skillsTable: Table = {
  kind: 'table',
  type: 'capacidades',
  key: 'tabla_habilidades',
  label: 'Habilidades',
  columns: [col('competencia', 'Competencia (0-2)', 'number', 'dm'), bonusColumn(SKILL_BONUS)],
  rows: SKILLS_BY_ABILITY.flatMap((group) =>
    group.skills.map((skill) => ({ key: skill.key, label: skill.label, stat: group.key, use: 'modificador' as const, editableBy: 'dm' as const })),
  ),
}

// Today a player cannot write attacks, equipment, resources or spells (guard_pj_player_update lists identity and
// narrative keys only), so the preset keeps every table DM-only; a DM may open one to players in the builder.
const table = (type: 'libre' | 'habilidad', key: string, label: string, columns: Column[]): Table => ({ kind: 'table', type, key, label, columns, editableBy: 'dm' })

const priceColumns = [col('precio', 'Precio', 'number'), col('precio_moneda', 'Moneda', 'short')]

const attacks = table('libre', 'ataques', 'Ataques', [
  col('nombre', 'Arma', 'short'),
  col('bono_ataque', 'Bono de ataque', 'short'),
  col('dano', 'Daño', 'short'),
  col('tipo_dano', 'Tipo', 'short'),
  col('alcance', 'Alcance', 'short'),
  col('notas', 'Notas', 'paragraph'),
  ...priceColumns,
  col('portando', 'Portando', 'boolean'),
])

const resources = table('libre', 'recursos', 'Recursos', [
  col('nombre', 'Nombre', 'short'),
  col('maximo', 'Máximo', 'number'),
  col('actual', 'Actual', 'number'),
  col('recuperacion', 'Recuperación', 'short'),
  col('notas', 'Notas', 'paragraph'),
])

const equipment = table('libre', 'equipo', 'Equipo', [
  col('nombre', 'Nombre', 'short'),
  col('cantidad', 'Cantidad', 'number'),
  col('descripcion', 'Descripción', 'paragraph'),
  ...priceColumns,
  col('portando', 'Portando', 'boolean'),
])

const spellSlots: Table = { ...table('libre', 'espacios_conjuro', 'Espacios de conjuro', [col('nivel', 'Nivel', 'number', 'dm'), col('total', 'Total', 'number', 'dm'), col('gastados', 'Gastados', 'number', 'dm')]), editableBy: 'dm' } as Table

const spells = table('habilidad', 'hechizos', 'Hechizos', [
  col('nombre', 'Nombre', 'short'),
  col('categoria', 'Categoría', 'short'),
  col('nivel', 'Nivel', 'number'),
  col('preparado', 'Preparado', 'boolean'),
  col('escuela', 'Escuela', 'short'),
  col('casting_time', 'Tiempo de lanzamiento', 'short'),
  col('alcance', 'Alcance', 'short'),
  col('componentes', 'Componentes', 'short'),
  col('duracion', 'Duración', 'short'),
  col('descripcion', 'Descripción', 'paragraph'),
])

const coins: Table = {
  kind: 'table',
  type: 'monedas',
  key: 'dinero',
  label: 'Dinero',
  rows: [
    { key: 'cp', label: 'Cobre', value: 1 },
    { key: 'sp', label: 'Plata', value: 10 },
    { key: 'ep', label: 'Electrum', value: 50 },
    { key: 'gp', label: 'Oro', value: 100 },
    { key: 'pp', label: 'Platino', value: 1000 },
  ],
}

const SPELL_CATEGORIES = ['Truco', ...Array.from({ length: 9 }, (_, i) => `Nivel ${i + 1}`)]

const keys = (...items: Item[]) => items.map((item) => item.key)
const tiles = (key: string, items: Item[], title?: string): Block => ({ key, ...(title ? { title } : {}), mode: 'tile', items: keys(...items) })
const plain = (key: string, item: Item): Block => ({ key, mode: 'plano', items: [item.key] })

const identity = [short('trasfondo_dnd', 'Trasfondo D&D', 'player'), short('alineamiento', 'Alineamiento', 'player'), num('experiencia', 'Experiencia (XP)', { min: 0 })]
const vitals = [
  num('stat_hp', 'HP máx.', { min: 0 }), num('stat_hp_current', 'HP actual', { min: 0 }), num('stat_hp_temp', 'HP temporal', { min: 0 }),
  num('stat_ac', 'AC', { min: 0 }), num('stat_ac_temp', 'AC temporal', { min: 0 }), num('stat_speed', 'Velocidad (ft)', { min: 0 }),
  num('stat_initiative', 'Iniciativa', { format: 'signed' }), short('stat_hit_dice', 'Dados de golpe'),
  { kind: 'field', key: 'stat_inspiration', label: 'Inspiración', type: 'boolean', editableBy: 'dm' } as Field,
  // the stored value wins; without one the bonus suggested by level applies (what the sheet does today)
  num('stat_proficiency_bonus', 'Bono de competencia', { formula: '2 + floor(({nivel} - 1) / 4)', overridable: true, format: 'signed' }),
  num('stat_death_saves_success', 'Salvaciones de muerte: éxitos', { min: 0, max: 3 }),
  num('stat_death_saves_failure', 'Salvaciones de muerte: fallos', { min: 0, max: 3 }),
  num('percepcion_pasiva', 'Percepción pasiva', { formula: `10 + {stat_wis.modificador} + ${PROFICIENT('skill_perception')}` }),
]
const casting = [num('spell_dc', 'DC de conjuración', { min: 0 }), num('spell_attack_bonus', 'Bono de ataque de hechizo', { format: 'signed' }), short('spell_ability', 'Característica de lanzamiento')]
const traits = [
  long('rasgos_clase', 'Rasgos de clase'), long('otros_rasgos', 'Otros rasgos'), short('idiomas', 'Idiomas'),
  short('prof_armas', 'Competencia con armas'), short('prof_armaduras', 'Competencia con armaduras'), short('prof_herramientas', 'Competencia con herramientas'),
]
const story = [long('trasfondo', 'Trasfondo', 'player'), long('motivo', 'Motivo', 'player'), long('magralita', 'Magralita')]
const looks = ['edad', 'altura', 'peso', 'ojos', 'piel', 'pelo'].map((key) => short(key, key[0].toUpperCase() + key.slice(1), 'player'))
const personality = [
  long('apariencia', 'Apariencia', 'player'), long('personalidad', 'Personalidad', 'player'), long('ideales', 'Ideales', 'player'),
  long('vinculos', 'Vínculos', 'player'), long('defectos', 'Defectos', 'player'),
]

const categories: Category[] = [
  { key: 'identidad_dnd', label: 'Identidad D&D', sections: [{ key: 'general', label: 'General', items: identity, blocks: [tiles('b_general', identity)] }] },
  {
    key: 'mecanicas',
    label: 'Mecánicas',
    sections: [
      { key: 'stats', label: 'Atributos y combate', items: [statTable, ...vitals], blocks: [{ key: 'b_stats', mode: 'stat', items: keys(statTable) }, tiles('b_vitals', vitals, 'Combate')] },
      {
        key: 'habilidades',
        label: 'Salvaciones y habilidades',
        items: [savesTable, skillsTable],
        blocks: [{ key: 'b_caps', mode: 'capacidades', items: keys(savesTable, skillsTable) }],
      },
      {
        key: 'hechizos',
        label: 'Hechizos',
        items: [...casting, spellSlots, spells],
        blocks: [tiles('b_casting', casting), plain('b_slots', spellSlots), { key: 'b_spells', mode: 'modal', items: keys(spells), filterCategories: SPELL_CATEGORIES }],
      },
    ],
  },
  {
    key: 'equipo_rasgos',
    label: 'Equipo y rasgos',
    sections: [
      { key: 'ataques', label: 'Ataques', items: [attacks], blocks: [plain('b_attacks', attacks)] },
      { key: 'recursos', label: 'Recursos', items: [resources], blocks: [plain('b_resources', resources)] },
      { key: 'equipo', label: 'Equipo', items: [equipment, coins], blocks: [plain('b_equipment', equipment), plain('b_coins', coins)] },
      { key: 'rasgos', label: 'Rasgos', items: traits, blocks: [tiles('b_traits', traits)] },
    ],
  },
  {
    key: 'historia',
    label: 'Historia',
    sections: [
      { key: 'narrativa', label: 'Narrativa', items: story, blocks: [tiles('b_story', story)] },
      { key: 'apariencia', label: 'Apariencia', items: [...looks, ...personality], blocks: [tiles('b_looks', looks), tiles('b_personality', personality)] },
    ],
  },
]

export const DND5E_SHEET: Sheet = {
  categories,
  roles: { hp: 'stat_hp', hp_current: 'stat_hp_current', ac: 'stat_ac', speed: 'stat_speed', initiative: 'stat_initiative' },
}
