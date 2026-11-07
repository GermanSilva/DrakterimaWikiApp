/**
 * The D&D 5e character sheet expressed with the sheet builder model (odd/design/sheet-builder.md, section 3).
 * It reuses TODAY's data keys so existing characters need no data rewrite, and its sections reuse today's unread
 * keys (stats, habilidades, ataques, ...). `DND5E_SHEET_GAPS` lists the keys of the current sheet that the model
 * cannot express yet; `dnd5eSheet.test.ts` keeps that list honest.
 *
 * v2 (G10b): skill proficiency is an options column, hit dice are fields plus a text formula, spell slots and resources
 * use resettable columns, spells are a collection-backed Habilidad table with declared categories, and equipment rows
 * carry a value computed over the coin table. `DND5E_V2_MIGRATION_MAP` lists every stored shape that changed, for the
 * data migration (G10c).
 */
import { ABILITY_SCORES, SKILLS_BY_ABILITY } from '../../../pages/pj/pjConstants'
import type { Block, Category, Column, Field, Item, Sheet, Table } from './sheetModel'

/**
 * Keys of today's sheet with no counterpart yet:
 *  - spell_slots / spell_slots_current: today objects keyed by spell level; the preset keeps them as the free table
 *    `espacios_conjuro` (one row per level: nivel, disponibles, maximo). The data conversion belongs to the stored-data migration.
 *  - monedas / monedas_guardado: stored in their own jsonb columns, written by the DM and by the lottery/pot RPCs;
 *    the coin table below describes the denominations only (S12, S14).
 *  - custom_fields: the per-campaign custom fields, superseded by the builder itself.
 *  - magralita: a Drakterima campaign custom field, not D&D content; the data migration (G10c) turns the campaign custom fields into
 *    paragraph fields of the campaign's own sheet section (S17).
 */
export const DND5E_SHEET_GAPS: readonly string[] = ['spell_slots', 'spell_slots_current', 'monedas', 'monedas_guardado', 'custom_fields', 'magralita']

const num = (key: string, label: string, extra: Partial<Field> = {}): Field => ({ kind: 'field', key, label, type: 'number', editableBy: 'dm', ...extra })
const short = (key: string, label: string, editableBy: Field['editableBy'] = 'dm'): Field => ({ kind: 'field', key, label, type: 'short', editableBy })
const long = (key: string, label: string, editableBy: Field['editableBy'] = 'dm'): Field => ({ kind: 'field', key, label, type: 'paragraph', editableBy })
const col = (key: string, label: string, type: Column['type'], editableBy: Column['editableBy'] = 'player'): Column => ({ key, label, type, editableBy })

const MODIFIER = 'floor(({valor} - 10) / 2)'
const SAVE_BONUS = `{modificador} + si({competente}, {stat_proficiency_bonus}, 0)`
const bonusColumn = (formula: string): Column => ({ key: 'bono', label: 'Bono', type: 'number', formula, format: 'signed', editableBy: 'dm' })

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
  columns: [{ ...col('competente', 'Competente', 'boolean', 'dm'), default: false }, bonusColumn(SAVE_BONUS)],
  rows: ABILITY_SCORES.map((a) => ({ key: a.saveKey, label: 'Salvación', stat: a.key, use: 'modificador' as const, editableBy: 'dm' as const })),
}

/** One formula per level: the bonus of the skill (the linked modifier plus the proficiency bonus once or twice). */
const PROFICIENCY: Column = {
  key: 'competencia',
  label: 'Competencia',
  type: 'options',
  display: 'select',
  format: 'signed',
  default: 'no',
  editableBy: 'dm',
  options: [
    { key: 'no', label: 'No competente', formula: '{modificador}' },
    { key: 'competente', label: 'Competente', formula: '{modificador} + {stat_proficiency_bonus}' },
    { key: 'experto', label: 'Experto', formula: '{modificador} + {stat_proficiency_bonus} * 2' },
  ],
}

const skillsTable: Table = {
  kind: 'table',
  type: 'capacidades',
  key: 'tabla_habilidades',
  label: 'Habilidades',
  columns: [PROFICIENCY],
  rows: SKILLS_BY_ABILITY.flatMap((group) =>
    group.skills.map((skill) => ({ key: skill.key, label: skill.label, stat: group.key, use: 'modificador' as const, editableBy: 'dm' as const })),
  ),
}

// Today a player cannot write attacks, equipment, resources or spells (guard_pj_player_update lists identity and
// narrative keys only), so the preset keeps every table DM-only; a DM may open one to players in the builder.
type RowTable = Extract<Table, { type: 'libre' | 'habilidad' }>
const table = (type: 'libre' | 'habilidad', key: string, label: string, columns: Column[]): RowTable => ({ kind: 'table', type, key, label, columns, editableBy: 'dm' })

// An unknown currency counts as gold, like the sheet does today.
const GOLD_RATE = 'lookup({dinero}, "key", {precio_moneda}, "value", lookup({dinero}, "key", "gp", "value", 0))'
const valueColumn = (formula: string): Column => ({ key: 'valor', label: 'Valor', type: 'number', formula, editableBy: 'dm' })

const priceColumns = [col('precio', 'Precio', 'number'), col('precio_moneda', 'Moneda', 'short')]

const attacks = table('libre', 'ataques', 'Ataques', [
  col('nombre', 'Arma', 'short'),
  col('bono_ataque', 'Bono de ataque', 'short'),
  col('dano', 'Daño', 'short'),
  col('tipo_dano', 'Tipo', 'short'),
  col('alcance', 'Alcance', 'short'),
  col('notas', 'Notas', 'paragraph'),
  { ...priceColumns[0], default: 0 },
  { ...priceColumns[1], default: 'gp' },
  { ...col('portando', 'Portando', 'boolean'), default: true },
  valueColumn(`{precio} * ${GOLD_RATE}`),
])

const resources = table('libre', 'recursos', 'Recursos', [
  col('nombre', 'Nombre', 'short'),
  { ...col('actual', 'Actual', 'number'), reset: { to: 'column', column: 'maximo' } },
  col('maximo', 'Máximo', 'number'),
  {
    key: 'recuperacion',
    label: 'Recuperación',
    type: 'options',
    display: 'select',
    default: 'largo',
    editableBy: 'player',
    options: [
      { key: 'largo', label: 'Descanso largo' },
      { key: 'corto', label: 'Descanso corto' },
    ],
  },
  col('notas', 'Notas', 'paragraph'),
])

// A missing quantity counts 1, a missing currency gold and a missing flag "carrying", like the sheet does today.
const equipment = table('libre', 'equipo', 'Equipo', [
  col('nombre', 'Nombre', 'short'),
  { ...col('cantidad', 'Cantidad', 'number'), default: 1 },
  col('descripcion', 'Descripción', 'paragraph'),
  { ...priceColumns[0], default: 0 },
  { ...priceColumns[1], default: 'gp' },
  { ...col('portando', 'Portando', 'boolean'), default: true },
  valueColumn(`{precio} * {cantidad} * ${GOLD_RATE}`),
])
// Today's total counts equipment and attacks: two hidden sums feed the visible total
const equipmentSum: Field = { kind: 'field', key: 'valor_equipo', label: 'Valor del equipo', type: 'number', editableBy: 'dm', hidden: true, calc: { table: 'equipo', column: 'valor', op: 'suma' } }
const attacksSum: Field = { kind: 'field', key: 'valor_ataques', label: 'Valor de los ataques', type: 'number', editableBy: 'dm', hidden: true, calc: { table: 'ataques', column: 'valor', op: 'suma' } }
const inventoryValue: Field = { kind: 'field', key: 'valor_inventario', label: 'Valor del inventario', type: 'number', editableBy: 'dm', formula: '{valor_equipo} + {valor_ataques}' }

const spellSlots: RowTable = {
  ...table('libre', 'espacios_conjuro', 'Espacios de conjuro', [
    col('nivel', 'Nivel', 'number', 'dm'),
    { ...col('disponibles', 'Disponibles', 'number', 'dm'), reset: { to: 'column', column: 'maximo' } },
    col('maximo', 'Máximo', 'number', 'dm'),
  ]),
  sortBy: { column: 'nivel', direction: 'asc' },
}

const SPELL_CATEGORIES = [
  { key: 'trucos', label: 'Trucos' },
  ...Array.from({ length: 9 }, (_, i) => ({ key: `nivel_${i + 1}`, label: `Nivel ${i + 1}` })),
  { key: 'rasgos', label: 'Rasgos y dotes' },
]

// Backed by the action collection: name, category and description belong to the entry, the extra columns too; only
// `preparado` is per character. The entry's own description is shown, so there is no description column.
const spells: RowTable = { ...table('habilidad', 'hechizos', 'Hechizos', [
  col('nombre', 'Nombre', 'short'),
  col('categoria', 'Categoría', 'short'),
  col('escuela', 'Escuela', 'short'),
  col('tiempo_lanzamiento', 'Tiempo de lanzamiento', 'short'),
  col('alcance', 'Alcance', 'short'),
  col('componentes', 'Componentes', 'short'),
  col('duracion', 'Duración', 'short'),
  col('a_niveles_superiores', 'A niveles superiores', 'paragraph'),
  col('concentracion', 'Concentración', 'boolean'),
  col('ritual', 'Ritual', 'boolean'),
  { ...col('preparado', 'Preparado', 'boolean'), scope: 'character' },
]), categories: SPELL_CATEGORIES } as RowTable

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
  rewardDestination: true,
}

const keys = (...items: Item[]) => items.map((item) => item.key)
const tiles = (key: string, items: Item[], title?: string): Block => ({ key, ...(title ? { title } : {}), mode: 'tile', items: keys(...items) })
const plain = (key: string, item: Item): Block => ({ key, mode: 'plano', items: [item.key] })

const identity = [short('trasfondo_dnd', 'Trasfondo D&D', 'player'), short('alineamiento', 'Alineamiento', 'player'), num('experiencia', 'Experiencia (XP)', { min: 0 })]
// "1d8 (a/b)": a = dice available, b = total, which for D&D is the level
const dieField: Field = { ...short('dado_golpe', 'Dado de golpe'), default: '' }
const diceLeft = num('dados_disponibles', 'Dados de golpe disponibles', { min: 0, default: 0 })
const hitDice: Field = { ...short('stat_hit_dice', 'Dados de golpe'), formula: '{dado_golpe} & " (" & {dados_disponibles} & "/" & {nivel} & ")"' }
const vitals = [
  num('stat_hp', 'HP máx.', { min: 0 }), num('stat_hp_current', 'HP actual', { min: 0 }), num('stat_hp_temp', 'HP temporal', { min: 0 }),
  num('stat_ac', 'AC', { min: 0 }), num('stat_ac_temp', 'AC temporal', { min: 0 }), num('stat_speed', 'Velocidad (ft)', { min: 0 }),
  num('stat_initiative', 'Iniciativa', { format: 'signed' }), hitDice,
  { kind: 'field', key: 'stat_inspiration', label: 'Inspiración', type: 'boolean', editableBy: 'dm' } as Field,
  // the stored value wins; without one the bonus suggested by level applies (what the sheet does today)
  num('stat_proficiency_bonus', 'Bono de competencia', { formula: '2 + floor(({nivel} - 1) / 4)', overridable: true, format: 'signed' }),
  num('stat_death_saves_success', 'Salvaciones de muerte: éxitos', { min: 0, max: 3 }),
  num('stat_death_saves_failure', 'Salvaciones de muerte: fallos', { min: 0, max: 3 }),
  num('percepcion_pasiva', 'Percepción pasiva', { formula: '10 + {skill_perception}' }),
]
const casting = [num('spell_dc', 'DC de conjuración', { min: 0 }), num('spell_attack_bonus', 'Bono de ataque de hechizo', { format: 'signed' }), short('spell_ability', 'Característica de lanzamiento')]
const traits = [
  long('rasgos_clase', 'Rasgos de clase'), long('otros_rasgos', 'Otros rasgos'), short('idiomas', 'Idiomas'),
  short('prof_armas', 'Competencia con armas'), short('prof_armaduras', 'Competencia con armaduras'), short('prof_herramientas', 'Competencia con herramientas'),
]
const story = [long('trasfondo', 'Trasfondo', 'player'), long('motivo', 'Motivo', 'player')]
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
      { key: 'stats', label: 'Atributos y combate', items: [statTable, dieField, diceLeft, ...vitals], blocks: [{ key: 'b_stats', mode: 'stat', items: keys(statTable) }, tiles('b_vitals', vitals, 'Combate')] },
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
        blocks: [tiles('b_casting', casting), plain('b_slots', spellSlots), { key: 'b_spells', mode: 'modal', items: keys(spells), filterCategories: SPELL_CATEGORIES.map((c) => c.key) }],
      },
    ],
  },
  {
    key: 'equipo_rasgos',
    label: 'Equipo y rasgos',
    sections: [
      { key: 'ataques', label: 'Ataques', items: [attacks], blocks: [plain('b_attacks', attacks)] },
      { key: 'recursos', label: 'Recursos', items: [resources], blocks: [plain('b_resources', resources)] },
      { key: 'equipo', label: 'Equipo', items: [equipment, coins, equipmentSum, attacksSum, inventoryValue], blocks: [plain('b_equipment', equipment), plain('b_coins', coins), tiles('b_inventory_value', [inventoryValue])] },
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

const SKILL_LEVEL_KEYS = { 0: 'no', 1: 'competente', 2: 'experto' } as const

/** One stored shape that changes between today's sheet and preset v2 (the data migration G10c consumes the list). */
export interface MigrationRule {
  oldKey: string
  oldShape: string
  newKey: string
  newShape: string
  /** Value translation for a plain value (stored number -> option key). */
  values?: Readonly<Record<number, string>>
  note?: string
}

export const DND5E_V2_MIGRATION_MAP: readonly MigrationRule[] = [
  {
    oldKey: 'skill_*',
    oldShape: 'number 0 | 1 | 2 (first column of the Capacidades row, stored at the row key)',
    newKey: 'skill_*',
    newShape: 'same keys; option key "no" | "competente" | "experto"',
    values: SKILL_LEVEL_KEYS,
    note: 'a missing value counts as "no" (column default); save_* stay booleans',
  },
  {
    oldKey: 'stat_hit_dice',
    oldShape: 'short text "1d8 (a/b)": a = dice available, b = total',
    newKey: 'dado_golpe',
    newShape: 'short text, the die ("1d8")',
    note: 'stat_hit_dice becomes a text formula field (stored text is ignored: drop the key); the total is the level',
  },
  {
    oldKey: 'stat_hit_dice',
    oldShape: 'short text "1d8 (a/b)": a = dice available, b = total',
    newKey: 'dados_disponibles',
    newShape: 'number >= 0, the dice available (a)',
    note: 'text that does not parse: keep it in dado_golpe and leave dados_disponibles unset',
  },
  {
    oldKey: 'spell_slots',
    oldShape: 'object { "<level>": maximum slots } (DM only)',
    newKey: 'espacios_conjuro',
    newShape: 'array of rows { nivel, disponibles, maximo }, shown sorted by nivel; maximo = the value of that level',
    note: 'zero rows are not persisted',
  },
  {
    oldKey: 'spell_slots_current',
    oldShape: 'object { "<level>": slots remaining }; a level that is absent counts as full',
    newKey: 'espacios_conjuro',
    newShape: 'disponibles of the row of that level',
    note: 'disponibles = the remaining slots; absent = full, so disponibles = maximo',
  },
  {
    oldKey: 'hechizos',
    oldShape: 'array of rows { nombre, nivel 0..9 | 10, preparado, escuela, casting_time, alcance, componentes, duracion, descripcion, a_niveles_superiores, concentracion, ritual }',
    newKey: 'hechizos',
    newShape: 'collection entries (name, category, description, extras) linked by the character; preparado is link state',
    note: 'nivel 0 -> trucos, 1..9 -> nivel_1..nivel_9, 10 -> rasgos; descripcion -> entry description; casting_time -> extras.tiempo_lanzamiento; escuela, alcance, componentes, duracion, a_niveles_superiores, concentracion, ritual -> extras (same keys); S39 dedupe/private rules',
  },
  {
    oldKey: 'recursos',
    oldShape: 'array of rows { nombre, maximo, actual, recuperacion: free text }',
    newKey: 'recursos',
    newShape: 'array of rows { nombre, actual, maximo, recuperacion: option key "largo" | "corto", notas }',
    note: 'rows kept; recuperacion text -> "largo" | "corto" (anything else counts as the default "largo")',
  },
  {
    oldKey: 'equipo',
    oldShape: 'array of rows { nombre, cantidad, descripcion, precio, precio_moneda, portando }',
    newKey: 'equipo',
    newShape: 'same rows; valor is computed (never stored) and valor_inventario is a calc field',
    note: 'no data change (ataques too: valor is computed there as well): a missing portando counts as true, quantity 1, currency gp, price 0 (column defaults)',
  },
  {
    oldKey: '(none)',
    oldShape: 'no counterpart',
    newKey: 'valor_inventario',
    newShape: 'formula field (equipo.valor sum + ataques.valor sum, through the hidden calc fields valor_equipo and valor_ataques), never stored',
  },
]
