/**
 * The character sheet of a campaign as data (`system_profile.sheet`, odd/design/sheet-builder.md). The code knows
 * categories, sections, fields, tables, blocks and a formula language, never a game. `validateSheet` is the client
 * twin of the database validator: it rebuilds a normalised sheet (only known properties survive, labels trimmed)
 * or reports every problem with its path. A sheet that does not validate is never half-used.
 */
import { cleanLabel } from '../systemProfile'
import { findEdgeCycle, formulaUses, parseFormula } from '../formula/formula'

export const FIELD_TYPES = ['short', 'paragraph', 'number', 'boolean', 'options'] as const
export type FieldType = (typeof FIELD_TYPES)[number]
export type EditableBy = 'dm' | 'player'
export const BLOCK_MODES = ['stat', 'tile', 'capacidades', 'plano', 'modal'] as const
export type BlockMode = (typeof BLOCK_MODES)[number]
export const ROLE_NAMES = ['hp', 'hp_current', 'ac', 'speed', 'initiative'] as const
export type RoleName = (typeof ROLE_NAMES)[number]

export type NumberFormat = 'signed'
export type OptionDisplay = 'select' | 'checkbox'
export const CALC_OPS = ['suma', 'promedio', 'conteo', 'mayor', 'menor', 'mas_frecuente', 'menos_frecuente'] as const
export type CalcOp = (typeof CALC_OPS)[number]

/** One choice of an options field or column; its own formula (a number or a text) is what the choice resolves to. */
export interface OptionDef {
  key: string
  label: string
  formula?: string
  /** Short marker (1 to 3 characters) a capacidades table shows before a row on this option, and its legend. */
  mark?: string
}

/** The longest option mark, in characters (code points). */
export const MARK_MAX = 3
/** A computed field over one column of a Libre, Habilidad or coin table (`conteo` may count the rows). */
export interface Calc {
  table: string
  column?: string
  op: CalcOp
}
/** What a future reset button does to a number column of a Libre or Habilidad table. */
export type Reset = { to: 'zero' } | { to: 'column'; column: string } | { to: 'value'; value: number }
export interface SortBy {
  column: string
  direction: 'asc' | 'desc'
}

/** Habilidad columns: `entry` belongs to the collection entry (shared by every character), `character` is per-character state (prepared, uses). */
export type ColumnScope = 'entry' | 'character'
export const COLUMN_SCOPES: readonly ColumnScope[] = ['entry', 'character']

export interface Column {
  key: string
  label: string
  type: FieldType
  formula?: string
  editableBy: EditableBy
  format?: NumberFormat
  /** Options columns: the choices (2..20) and how they are drawn; checkbox = two options, the first unchecked. */
  options?: OptionDef[]
  display?: OptionDisplay
  reset?: Reset
  /** What a character that has no stored value counts as (a missing proficiency is 0, a missing flag is false, an options column an option key). */
  default?: string | number | boolean
  /** Habilidad tables only; absent means `entry`. */
  scope?: ColumnScope
}
export interface Field {
  kind: 'field'
  key: string
  label: string
  type: FieldType
  formula?: string
  /** With a formula: the value stored on the character, when there is one, wins over the formula (D&D proficiency bonus). */
  overridable?: boolean
  /** With a formula: resolved and referenceable by other formulas, but not drawn. */
  hidden?: boolean
  /** Instead of a formula: a calculation over a table column, resolved and referenceable like a formula field. */
  calc?: Calc
  format?: NumberFormat
  options?: OptionDef[]
  display?: OptionDisplay
  /** Short and number fields only: a search option and a card tag (readers come later). */
  searchable?: boolean
  editableBy: EditableBy
  min?: number
  max?: number
  default?: string | number | boolean
}
export interface StatRow {
  key: string
  label: string
  modifier: string
  editableBy: EditableBy
}
export interface CapacidadRow {
  key: string
  label: string
  stat: string
  use: 'valor' | 'modificador'
  editableBy: EditableBy
}
export interface CoinRow {
  key: string
  label: string
  value: number
}
/** One class of actions (cantrips, spells of a level, feats...) a Habilidad table declares; its rows point at it with `categoria`. */
export interface ActionCategory {
  key: string
  label: string
}
export type Table =
  | { kind: 'table'; type: 'stat'; key: string; label: string; rows: StatRow[] }
  | { kind: 'table'; type: 'capacidades'; key: string; label: string; columns: Column[]; rows: CapacidadRow[] }
  | { kind: 'table'; type: 'habilidad'; key: string; label: string; columns: Column[]; editableBy: EditableBy; sortBy?: SortBy; categories?: ActionCategory[] }
  | { kind: 'table'; type: 'libre'; key: string; label: string; columns: Column[]; editableBy: EditableBy; sortBy?: SortBy }
  | { kind: 'table'; type: 'monedas'; key: string; label: string; rows: CoinRow[]; rewardDestination?: boolean }
  /** Amounts per denomination of the coin table, stored on the character at data[key]; DM only until the SQL guard handles them. */
  | { kind: 'table'; type: 'economia'; key: string; label: string; editableBy: 'dm'; rewardDestination?: boolean }
export type Item = Field | Table
export interface Block {
  key: string
  title?: string
  mode: BlockMode
  items: string[]
  filterCategories?: string[]
}
export interface Section {
  key: string
  label: string
  items: Item[]
  blocks: Block[]
}
export interface Category {
  key: string
  label: string
  sections: Section[]
}
/**
 * A Stat or Capacidades row the DM removed from a table that stays (S26). A capacidades row names the column keys the table had:
 * they decide which `row__column` data keys the row owns.
 */
export type DiscardedRow =
  | { kind: 'row'; type: 'stat'; table: string; key: string; label: string; modifier: string; editableBy: EditableBy }
  | { kind: 'row'; type: 'capacidades'; table: string; key: string; label: string; stat: string; use: 'valor' | 'modificador'; editableBy: EditableBy; columns: string[] }
export type DiscardedItem = Item | DiscardedRow
/** A part of the template removed while characters may hold data for it: kept hidden until the DM restores or deletes it. */
export interface DiscardedEntry {
  /** The definition as it was. */
  item: DiscardedItem
  /** The section it came from. */
  section: string
  /** When it was discarded (ISO UTC, `Date#toISOString`): the 60-day lifecycle reads it. */
  at: string
}
export interface Sheet {
  categories: Category[]
  roles: Partial<Record<RoleName, string>>
  /** Optional, at most SHEET_LIMITS.discarded entries; never drawn, edited, searched or tagged. A live item may reuse a discarded key. */
  discarded?: DiscardedEntry[]
  /** Optional: what the character card and the detail header show besides identity and roles (resolveCard, card.ts). */
  card?: SheetCard
}

/** A pinned field (or coin/economy table, by its total); `max` names the number field of its maximum (drawn as a bar). */
export interface CardPin {
  key: string
  max?: string
  /** Shown to the DM only (header and card). */
  dmOnly?: true
}

export interface SheetCard {
  /** At most SHEET_LIMITS.pinned, in order: the header shows all of them, the card the first CARD_PINNED. */
  pinned: CardPin[]
  /** A Stat table drawn as a line of short values on the card. */
  statline?: string
  /** A short or paragraph field shown as the card's excerpt (instead of the background). */
  excerpt?: string
}

export interface SheetError {
  path: string
  message: string
}
export type SheetResult = { ok: true; sheet: Sheet } | { ok: false; errors: SheetError[] }

export const SHEET_LIMITS = {
  categories: 12,
  sectionsPerCategory: 12,
  sections: 40,
  itemsPerSection: 60,
  items: 400,
  rows: 100,
  columns: 12,
  blocksPerSection: 60,
  denominations: 8,
  filterCategories: 20,
  actionCategories: 30,
  options: 20,
  discarded: 100,
  pinned: 6,
  coinValue: 1_000_000_000,
  text: 4000,
  bytes: 40_000,
} as const

const KEY = /^[a-z][a-z0-9_]{0,39}$/
/** Keys the application owns (columns of pjs, identity) or that would confuse the formula scope. */
export const RESERVED_KEYS: ReadonlySet<string> = new Set([
  'nombre', 'jugador', 'imagen_url', 'visible_to', 'monedas', 'monedas_guardado', 'notas', 'sections_updated', 'id', 'nivel',
  'clase', 'raza', 'region', 'estado', 'owner_id', 'campaign_id', 'created_by', 'created_at', 'updated_at', 'data',
  'valor', 'modificador', 'constructor', 'prototype',
  'custom_fields', // the legacy per-campaign custom fields: guard_pj_player_update always opens that key to players
])

/** The day exists in the calendar (the format already bounds month, day, hour...): 2026-02-30 is not 2 March. */
const realDay = (iso: string): boolean => {
  const [y, m, d] = [Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10))]
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}
const DISCARDED_AT = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,3})?Z$/
const DISCARDED_FIELD_TYPES: readonly unknown[] = FIELD_TYPES
const DISCARDED_TABLE_TYPES: readonly unknown[] = ['stat', 'capacidades', 'habilidad', 'libre', 'monedas', 'economia']

const PROTOTYPE_KEYS: ReadonlySet<string> = new Set(['constructor', 'prototype'])
/** The database charset of a formula: anything but control characters (C0, DEL, C1) other than tab. */
// eslint-disable-next-line no-control-regex -- the point is to detect control characters
const FORMULA_CONTROL_CHARS = /[\u0000-\u0008\u000a-\u001f\u007f-\u009f]/

const CALC_FUNCTIONS: Record<CalcOp, string> = {
  suma: 'suma',
  promedio: 'promedio',
  conteo: 'conteo',
  mayor: 'mayor',
  menor: 'menor',
  mas_frecuente: 'frecuente',
  menos_frecuente: 'infrecuente',
}
/** The formula a calculation compiles to; the column of a validated calc is a key, so it never needs escaping. */
export const calcFormula = (calc: Calc): string => `${CALC_FUNCTIONS[calc.op]}({${calc.table}}${calc.column !== undefined ? `, "${calc.column}"` : ''})`
const NUMERIC_CALCS: readonly CalcOp[] = ['suma', 'promedio', 'conteo', 'mayor', 'menor']

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isEditor = (value: unknown): value is EditableBy => value === 'dm' || value === 'player'
const isFieldType = (value: unknown): value is FieldType => (FIELD_TYPES as readonly unknown[]).includes(value)

export function validateSheet(raw: unknown): SheetResult {
  const errors: SheetError[] = []
  const fail = (path: string, message: string) => void errors.push({ path, message })

  // Bound the work before any walk: the database applies a (looser) cap too.
  if (JSON.stringify(raw ?? null).length > SHEET_LIMITS.bytes) return { ok: false, errors: [{ path: '', message: 'the sheet is too large' }] }
  if (!isRecord(raw) || !Array.isArray(raw.categories)) return { ok: false, errors: [{ path: '', message: 'a sheet needs categories' }] }

  const globalKeys = new Map<string, string>() // key -> path, items, tables and rows share one namespace
  const claim = (key: unknown, path: string): string | null => {
    if (typeof key !== 'string' || !KEY.test(key) || key.includes('__')) return void fail(path, 'invalid key'), null // '__' separates row and column in data
    if (RESERVED_KEYS.has(key)) return void fail(path, 'reserved key'), null
    if (globalKeys.has(key)) return void fail(path, `key already used at ${globalKeys.get(key)}`), null
    globalKeys.set(key, path)
    return key
  }
  const label = (value: unknown, path: string): string => {
    const text = cleanLabel(value)
    if (text === null) fail(path, 'invalid label')
    return text ?? ''
  }
  const plainKey = (key: unknown, path: string, seen: Set<string>): string => {
    // Scoped keys (columns, categories, sections, blocks) never become a top level `data` key, so only prototype names are off limits.
    if (typeof key !== 'string' || !KEY.test(key) || PROTOTYPE_KEYS.has(key)) fail(path, 'invalid key')
    else if (seen.has(key)) fail(path, 'repeated key')
    else seen.add(key)
    return typeof key === 'string' ? key : ''
  }
  const editor = (value: unknown, path: string): EditableBy => {
    if (!isEditor(value)) fail(path, 'editableBy must be dm or player')
    return isEditor(value) ? value : 'dm'
  }
  const formatOf = (value: unknown, type: FieldType, path: string): NumberFormat | undefined => {
    if (value === undefined) return undefined
    if (value !== 'signed' || (type !== 'number' && type !== 'options')) {
      fail(path, 'format signed needs a number or options field')
      return undefined
    }
    return value
  }
  const defaultOf = (value: unknown, type: FieldType, path: string, optionKeys: string[] = []): string | number | boolean | undefined => {
    if (value === undefined) return undefined
    const ok =
      (type === 'options' && typeof value === 'string' && optionKeys.includes(value)) ||
      (type === 'number' && typeof value === 'number' && Number.isFinite(value)) ||
      (type === 'boolean' && typeof value === 'boolean') ||
      ((type === 'short' || type === 'paragraph') && typeof value === 'string' && Array.from(value).length <= SHEET_LIMITS.text)
    if (!ok) fail(path, 'default does not match the type')
    return ok ? (value as string | number | boolean) : undefined
  }
  const formulaOf = (value: unknown, path: string): string | undefined => {
    if (value === undefined) return undefined
    if (typeof value !== 'string') {
      fail(path, 'invalid formula')
      return undefined
    }
    if (!parseFormula(value).ok || FORMULA_CONTROL_CHARS.test(value)) {
      fail(path, 'invalid formula')
      return undefined
    }
    return value
  }
  /** The options of an options field or column; any other type must not carry options or a display. */
  const optionsOf = (src: Record<string, unknown>, type: FieldType, path: string): { options: OptionDef[]; display: OptionDisplay } | null => {
    if (type !== 'options') {
      if (src.options !== undefined) fail(`${path}.options`, 'options belong to an options field')
      if (src.display !== undefined) fail(`${path}.display`, 'display belongs to an options field')
      return null
    }
    let options: OptionDef[] = []
    if (!Array.isArray(src.options) || src.options.length < 2 || src.options.length > SHEET_LIMITS.options) {
      fail(`${path}.options`, 'an options field needs 2 to 20 options')
    } else {
      const seen = new Set<string>()
      options = src.options.map((o, i): OptionDef => {
        const at = `${path}.options[${i}]`
        if (!isRecord(o)) return void fail(at, 'invalid option'), { key: '', label: '' }
        const formula = formulaOf(o.formula, `${at}.formula`)
        const mark = o.mark === undefined ? undefined : label(o.mark, `${at}.mark`)
        if (mark !== undefined && Array.from(mark).length > MARK_MAX) fail(`${at}.mark`, 'a mark has 1 to 3 characters')
        return { key: plainKey(o.key, `${at}.key`, seen), label: label(o.label, `${at}.label`), ...(formula !== undefined ? { formula } : {}), ...(mark ? { mark } : {}) }
      })
    }
    const display: OptionDisplay = src.display === 'select' || src.display === 'checkbox' ? src.display : (fail(`${path}.display`, 'display must be select or checkbox'), 'select')
    if (display === 'checkbox' && options.length > 2) fail(`${path}.display`, 'a checkbox has exactly two options')
    return { options, display }
  }
  const resetOf = (value: unknown, self: { key: string; type: FieldType; formula?: string }, siblings: unknown[], allowed: boolean, path: string): Reset | undefined => {
    if (value === undefined) return undefined
    const bad = (message: string) => void fail(path, message)
    if (!allowed || self.type !== 'number' || self.formula !== undefined) return bad('reset needs a custom number column of a Libre or Habilidad table')
    if (!isRecord(value)) return bad('invalid reset')
    if (value.to === 'zero') return { to: 'zero' }
    if (value.to === 'value') {
      if (typeof value.value === 'number' && Number.isFinite(value.value)) return { to: 'value', value: value.value }
      return bad('reset to a value needs a finite number')
    }
    if (value.to === 'column') {
      const target = siblings.find((c) => isRecord(c) && c.key === value.column)
      if (typeof value.column === 'string' && value.column !== self.key && isRecord(target) && target.type === 'number') return { to: 'column', column: value.column }
      return bad('reset to a column needs another number column of the table')
    }
    return bad('reset must go to zero, a column or a value')
  }
  const columnsOf = (value: unknown, path: string, allowReset = false, allowScope = false): Column[] => {
    if (!Array.isArray(value) || value.length > SHEET_LIMITS.columns) return void fail(path, 'columns required'), []
    const seen = new Set<string>()
    return value.map((c, i) => {
      const at = `${path}[${i}]`
      const col = isRecord(c) ? c : {}
      if (!isRecord(c)) fail(at, 'invalid column')
      const type = isFieldType(col.type) ? col.type : (fail(`${at}.type`, 'invalid type'), 'short' as FieldType)
      const spec = optionsOf(col, type, at)
      const formula = formulaOf(col.formula, `${at}.formula`)
      if (formula !== undefined && type !== 'number' && type !== 'boolean') fail(`${at}.formula`, 'formula needs a number or boolean column')
      const format = formatOf(col.format, type, `${at}.format`)
      const fallback = defaultOf(col.default, type, `${at}.default`, spec?.options.map((o) => o.key))
      const key = plainKey(col.key, `${at}.key`, seen)
      const reset = resetOf(col.reset, { key, type, formula }, value, allowReset, `${at}.reset`)
      let scope: ColumnScope | undefined
      if (col.scope !== undefined) {
        if (!allowScope || formula !== undefined || !(COLUMN_SCOPES as readonly unknown[]).includes(col.scope)) fail(`${at}.scope`, 'scope must be entry or character on a Habilidad column without a formula')
        else scope = col.scope as ColumnScope
      }
      return {
        key,
        label: label(col.label, `${at}.label`),
        type,
        ...(formula !== undefined ? { formula } : {}),
        ...(format !== undefined ? { format } : {}),
        ...(spec ? { options: spec.options, display: spec.display } : {}),
        ...(reset !== undefined ? { reset } : {}),
        ...(fallback !== undefined ? { default: fallback } : {}),
        ...(scope !== undefined ? { scope } : {}),
        editableBy: editor(col.editableBy, `${at}.editableBy`),
      }
    })
  }

  const calcOf = (value: unknown, path: string): Calc | undefined => {
    if (!isRecord(value)) return void fail(path, 'invalid calculation'), undefined
    const op = (CALC_OPS as readonly unknown[]).includes(value.op) ? (value.op as CalcOp) : undefined
    if (op === undefined) fail(`${path}.op`, 'unknown calculation')
    const table = typeof value.table === 'string' && value.table !== '' ? value.table : undefined
    if (table === undefined) fail(`${path}.table`, 'a calculation needs a table')
    let column: string | undefined
    let columnOk = true
    if (value.column !== undefined) {
      if (typeof value.column === 'string' && value.column !== '') column = value.column
      else columnOk = (fail(`${path}.column`, 'invalid column'), false)
    } else if (op !== undefined && op !== 'conteo') columnOk = (fail(`${path}.column`, 'this calculation needs a column'), false)
    return op !== undefined && table !== undefined && columnOk ? { table, ...(column !== undefined ? { column } : {}), op } : undefined
  }
  const sortOf = (value: unknown, columns: Column[], path: string): SortBy | undefined => {
    if (value === undefined) return undefined
    if (!isRecord(value)) return void fail(path, 'invalid sort'), undefined
    const column = typeof value.column === 'string' && columns.some((c) => c.key === value.column) ? value.column : undefined
    if (column === undefined) fail(`${path}.column`, 'sort by a column of the table')
    const direction = value.direction === 'asc' || value.direction === 'desc' ? value.direction : undefined
    if (direction === undefined) fail(`${path}.direction`, 'direction must be asc or desc')
    return column !== undefined && direction !== undefined ? { column, direction } : undefined
  }

  const categoriesOf = (value: unknown, path: string): ActionCategory[] | undefined => {
    if (!Array.isArray(value) || value.length < 1 || value.length > SHEET_LIMITS.actionCategories) return void fail(path, 'a table declares 1 to 30 categories'), undefined
    const seen = new Set<string>()
    return value.map((c, i) => {
      const at = `${path}[${i}]`
      if (!isRecord(c)) return void fail(at, 'invalid category'), { key: '', label: '' }
      return { key: plainKey(c.key, `${at}.key`, seen), label: label(c.label, `${at}.label`) }
    })
  }
  let rewardDestinations = 0
  /** The reward destination flag of a coin or economy table; at most one table of the sheet may have it on. */
  const rewardOf = (value: unknown, path: string): boolean | undefined => {
    if (value === undefined) return undefined
    if (typeof value !== 'boolean') return void fail(path, 'rewardDestination is a boolean'), undefined
    if (value && ++rewardDestinations > 1) fail(path, 'only one table can be the reward destination')
    return value
  }

  // Pass 1: structure (collected so formula and link checks can resolve against everything)
  // `table`: the formula is a row column of that free/skill table, so its locals are columns of that table (and graph nodes)
  const formulas: { path: string; key: string; text: string; locals: string[]; table?: string }[] = []
  const calcs: { path: string; key: string; calc: Calc }[] = []
  const tableColumns = new Map<string, Set<string>>() // tables a formula can read as rows: free, skill and coin tables
  const tableKeys = new Set<string>() // every table, whatever its kind
  const statRows = new Set<string>()
  const capRows: { path: string; stat: string }[] = []
  const capColumns = new Map<string, Map<string, boolean>>() // `${row}` -> column key -> hasFormula
  const fieldTypes = new Map<string, FieldType>()
  let coinTables = 0
  let economyTables = 0
  const actionCategoryKeys = new Map<string, string[]>() // Habilidad table -> the category keys it declares
  let totalItems = 0
  let totalSections = 0

  const categoryKeys = new Set<string>()
  const sectionKeys = new Set<string>()

  const categories: Category[] = raw.categories.slice(0, SHEET_LIMITS.categories).map((c, ci) => {
    const cpath = `categories[${ci}]`
    const cat = isRecord(c) ? c : {}
    if (!isRecord(c)) fail(cpath, 'invalid category')
    const sectionsRaw = Array.isArray(cat.sections) ? cat.sections : (fail(`${cpath}.sections`, 'sections required'), [])
    if (sectionsRaw.length > SHEET_LIMITS.sectionsPerCategory) fail(`${cpath}.sections`, 'too many sections')
    totalSections += sectionsRaw.length
    return {
      key: plainKey(cat.key, `${cpath}.key`, categoryKeys),
      label: label(cat.label, `${cpath}.label`),
      sections: sectionsRaw.slice(0, SHEET_LIMITS.sectionsPerCategory).map((s, si) => {
        const spath = `${cpath}.sections[${si}]`
        const sec = isRecord(s) ? s : {}
        if (!isRecord(s)) fail(spath, 'invalid section')
        const itemsRaw = Array.isArray(sec.items) ? sec.items : (fail(`${spath}.items`, 'items required'), [])
        if (itemsRaw.length > SHEET_LIMITS.itemsPerSection) fail(`${spath}.items`, 'too many items')
        totalItems += itemsRaw.length
        const items: Item[] = itemsRaw.slice(0, SHEET_LIMITS.itemsPerSection).map((it, ii) => {
          const ipath = `${spath}.items[${ii}]`
          const item = isRecord(it) ? it : {}
          if (!isRecord(it)) fail(ipath, 'invalid item')
          const key = claim(item.key, `${ipath}.key`) ?? ''
          const name = label(item.label, `${ipath}.label`)
          if (item.kind === 'field') {
            const type = isFieldType(item.type) ? item.type : (fail(`${ipath}.type`, 'invalid type'), 'short' as FieldType)
            const spec = optionsOf(item, type, ipath)
            const formula = formulaOf(item.formula, `${ipath}.formula`)
            let calc: Calc | undefined
            if (item.calc !== undefined) {
              if (item.formula !== undefined) fail(`${ipath}.calc`, 'a field has a formula or a calculation, not both')
              else {
                calc = calcOf(item.calc, `${ipath}.calc`)
                if (calc) {
                  const fits = NUMERIC_CALCS.includes(calc.op) ? type === 'number' : type === 'number' || type === 'short'
                  if (!fits) fail(`${ipath}.type`, 'this calculation gives a number (a most or least repeated value: a number or short text)')
                  calcs.push({ path: `${ipath}.calc`, key, calc })
                }
              }
            }
            const computed = formula !== undefined || calc !== undefined
            const editableBy = editor(item.editableBy, `${ipath}.editableBy`)
            if (formula !== undefined) {
              if (type !== 'number' && type !== 'boolean' && type !== 'short') fail(`${ipath}.formula`, 'formula needs a number, boolean or short text field')
              formulas.push({ path: `${ipath}.formula`, key, text: formula, locals: [] })
            }
            if (computed && editableBy !== 'dm') fail(`${ipath}.editableBy`, 'a computed field is computed, only the DM level can own it')
            spec?.options.forEach((o, oi) => {
              if (o.formula !== undefined) formulas.push({ path: `${ipath}.options[${oi}].formula`, key, text: o.formula, locals: [] })
            })
            fieldTypes.set(key, type)
            const field: Field = {
              kind: 'field',
              key,
              label: name,
              type,
              editableBy,
              ...(formula !== undefined ? { formula } : {}),
              ...(calc !== undefined ? { calc } : {}),
              ...(spec ? { options: spec.options, display: spec.display } : {}),
            }
            const format = formatOf(item.format, type, `${ipath}.format`)
            if (format !== undefined) field.format = format
            if (item.overridable !== undefined) {
              if (typeof item.overridable !== 'boolean' || formula === undefined) fail(`${ipath}.overridable`, 'overridable is a boolean and needs a formula')
              else field.overridable = item.overridable
            }
            if (item.hidden !== undefined) {
              if (typeof item.hidden !== 'boolean' || !computed) fail(`${ipath}.hidden`, 'hidden is a boolean and needs a formula or a calculation')
              else field.hidden = item.hidden
            }
            for (const bound of ['min', 'max'] as const) {
              const value = item[bound]
              if (value === undefined) continue
              if (type !== 'number' || typeof value !== 'number' || !Number.isFinite(value)) fail(`${ipath}.${bound}`, 'invalid bound')
              else field[bound] = value
            }
            if (item.searchable !== undefined) {
              if (typeof item.searchable !== 'boolean' || (type !== 'short' && type !== 'number')) fail(`${ipath}.searchable`, 'searchable is a boolean for short and number fields')
              else field.searchable = item.searchable
            }
            const fieldDefault = defaultOf(item.default, type, `${ipath}.default`, spec?.options.map((o) => o.key))
            if (fieldDefault !== undefined) field.default = fieldDefault
            return field
          }
          if (item.kind === 'table') {
            tableKeys.add(key)
            const rowsRaw = Array.isArray(item.rows) ? item.rows : []
            if (rowsRaw.length > (item.type === 'monedas' ? SHEET_LIMITS.denominations : SHEET_LIMITS.rows)) fail(`${ipath}.rows`, 'too many rows')
            const rowsOf = rowsRaw.slice(0, SHEET_LIMITS.rows)
            if (item.sortBy !== undefined && item.type !== 'libre' && item.type !== 'habilidad') fail(`${ipath}.sortBy`, 'only Libre and Habilidad tables can be sorted')
            if (item.categories !== undefined && item.type !== 'habilidad') fail(`${ipath}.categories`, 'only Habilidad tables declare categories')
            if (item.rewardDestination !== undefined && item.type !== 'monedas' && item.type !== 'economia') fail(`${ipath}.rewardDestination`, 'only the coin table or an economy table can be the reward destination')
            if (item.type === 'stat') {
              return {
                kind: 'table',
                type: 'stat',
                key,
                label: name,
                rows: rowsOf.map((r, ri) => {
                  const rpath = `${ipath}.rows[${ri}]`
                  const row = isRecord(r) ? r : {}
                  if (!isRecord(r)) fail(rpath, 'invalid row')
                  const rk = claim(row.key, `${rpath}.key`) ?? ''
                  statRows.add(rk)
                  const modifier = formulaOf(row.modifier, `${rpath}.modifier`) ?? (row.modifier === undefined ? (fail(`${rpath}.modifier`, 'modifier formula required'), '0') : '0')
                  formulas.push({ path: `${rpath}.modifier`, key: `${rk}.modificador`, text: modifier, locals: ['valor'] })
                  return { key: rk, label: label(row.label, `${rpath}.label`), modifier, editableBy: editor(row.editableBy, `${rpath}.editableBy`) }
                }),
              }
            }
            if (item.type === 'capacidades') {
              const columns = columnsOf(item.columns, `${ipath}.columns`)
              const hasFormula = new Map(columns.map((c) => [c.key, c.formula !== undefined || (c.options?.some((o) => o.formula !== undefined) ?? false)]))
              const rows: CapacidadRow[] = rowsOf.map((r, ri) => {
                const rpath = `${ipath}.rows[${ri}]`
                const row = isRecord(r) ? r : {}
                if (!isRecord(r)) fail(rpath, 'invalid row')
                const rk = claim(row.key, `${rpath}.key`) ?? ''
                capColumns.set(rk, hasFormula)
                const stat = typeof row.stat === 'string' ? row.stat : ''
                capRows.push({ path: `${rpath}.stat`, stat })
                const use = row.use === 'valor' || row.use === 'modificador' ? row.use : (fail(`${rpath}.use`, 'use must be valor or modificador'), 'valor' as const)
                return { key: rk, label: label(row.label, `${rpath}.label`), stat, use, editableBy: editor(row.editableBy, `${rpath}.editableBy`) }
              })
              const locals = [...columns.map((x) => x.key), 'valor', 'modificador']
              columns.forEach((col, ci2) => {
                const id = `col:${key}.${col.key}`
                if (col.formula !== undefined) formulas.push({ path: `${ipath}.columns[${ci2}].formula`, key: id, text: col.formula, locals })
                col.options?.forEach((o, oi) => {
                  if (o.formula !== undefined) formulas.push({ path: `${ipath}.columns[${ci2}].options[${oi}].formula`, key: id, text: o.formula, locals })
                })
              })
              return { kind: 'table', type: 'capacidades', key, label: name, columns, rows }
            }
            if (item.type === 'habilidad' || item.type === 'libre') {
              const columns = columnsOf(item.columns, `${ipath}.columns`, true, item.type === 'habilidad')
              const sortBy = sortOf(item.sortBy, columns, `${ipath}.sortBy`)
              const actionCategories = item.type === 'habilidad' && item.categories !== undefined ? categoriesOf(item.categories, `${ipath}.categories`) : undefined
              if (actionCategories) actionCategoryKeys.set(key, actionCategories.map((c) => c.key))
              columns.forEach((col, ci2) => {
                const id = `col:${key}.${col.key}`
                const locals = columns.map((x) => x.key)
                if (col.formula !== undefined) formulas.push({ path: `${ipath}.columns[${ci2}].formula`, key: id, text: col.formula, locals, table: key })
                col.options?.forEach((o, oi) => {
                  if (o.formula !== undefined) formulas.push({ path: `${ipath}.columns[${ci2}].options[${oi}].formula`, key: id, text: o.formula, locals, table: key })
                })
              })
              tableColumns.set(key, new Set(columns.map((x) => x.key)))
              const tableEditor = editor(item.editableBy, `${ipath}.editableBy`)
              // Rows of these tables belong to the character and the guard judges the table as one value, so a table the
              // player can write cannot also hold a column only the DM may write.
              if (tableEditor === 'player') columns.forEach((c, ci2) => c.editableBy === 'dm' && fail(`${ipath}.columns[${ci2}].editableBy`, 'a table the player edits cannot hold a DM column'))
              return { kind: 'table', type: item.type, key, label: name, columns, editableBy: tableEditor, ...(sortBy ? { sortBy } : {}), ...(actionCategories ? { categories: actionCategories } : {}) }
            }
            if (item.type === 'economia') {
              economyTables += 1
              for (const part of ['rows', 'columns']) if (item[part] !== undefined) fail(`${ipath}.${part}`, 'an economy table holds amounts only')
              if (editor(item.editableBy, `${ipath}.editableBy`) === 'player') fail(`${ipath}.editableBy`, 'an economy table is DM only')
              const reward = rewardOf(item.rewardDestination, `${ipath}.rewardDestination`)
              return { kind: 'table', type: 'economia', key, label: name, editableBy: 'dm', ...(reward !== undefined ? { rewardDestination: reward } : {}) }
            }
            if (item.type === 'monedas') {
              coinTables += 1
              tableColumns.set(key, new Set(['key', 'label', 'value']))
              const rows: CoinRow[] = rowsOf.map((r, ri) => {
                const rpath = `${ipath}.rows[${ri}]`
                const row = isRecord(r) ? r : {}
                if (!isRecord(r)) fail(rpath, 'invalid row')
                const rk = claim(row.key, `${rpath}.key`) ?? ''
                const value = row.value
                if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > SHEET_LIMITS.coinValue) fail(`${rpath}.value`, 'value must be an integer from 1 to 1e9')
                return { key: rk, label: label(row.label, `${rpath}.label`), value: typeof value === 'number' ? value : 1 }
              })
              if (rows.length > 0) {
                const values = rows.map((r) => r.value)
                if (new Set(values).size !== values.length) fail(`${ipath}.rows`, 'denomination values must differ')
                if (Math.min(...values) !== 1) fail(`${ipath}.rows`, 'the smallest denomination must be worth 1')
              }
              const reward = rewardOf(item.rewardDestination, `${ipath}.rewardDestination`)
              return { kind: 'table', type: 'monedas', key, label: name, rows, ...(reward !== undefined ? { rewardDestination: reward } : {}) }
            }
            fail(`${ipath}.type`, 'invalid table type')
            return { kind: 'table', type: 'libre', key, label: name, columns: [], editableBy: 'dm' }
          }
          fail(`${ipath}.kind`, 'kind must be field or table')
          return { kind: 'field', key, label: name, type: 'short', editableBy: 'dm' }
        })
        const itemByKey = new Map(items.map((it) => [it.key, it]))
        const blocksRaw = Array.isArray(sec.blocks) ? sec.blocks : (fail(`${spath}.blocks`, 'blocks required'), [])
        if (blocksRaw.length > SHEET_LIMITS.blocksPerSection) fail(`${spath}.blocks`, 'too many blocks')
        const blockKeys = new Set<string>()
        const shown = new Set<string>()
        const blocks: Block[] = blocksRaw.slice(0, SHEET_LIMITS.blocksPerSection).map((b, bi) => {
          const bpath = `${spath}.blocks[${bi}]`
          const blk = isRecord(b) ? b : {}
          if (!isRecord(b)) fail(bpath, 'invalid block')
          const mode = (BLOCK_MODES as readonly unknown[]).includes(blk.mode) ? (blk.mode as BlockMode) : (fail(`${bpath}.mode`, 'invalid mode'), 'plano' as BlockMode)
          const itemKeys = Array.isArray(blk.items) && blk.items.every((x) => typeof x === 'string') ? (blk.items as string[]) : (fail(`${bpath}.items`, 'items must be keys'), [])
          for (const k of itemKeys) {
            const target = itemByKey.get(k)
            if (!target) fail(`${bpath}.items`, `${k} is not an item of this section`)
            else if (shown.has(k)) fail(`${bpath}.items`, `${k} is already shown by another block`)
            else {
              shown.add(k)
              const type = target.kind === 'table' ? target.type : null
              const fits =
                mode === 'stat' ? type === 'stat'
                : mode === 'capacidades' ? type === 'capacidades'
                : mode === 'modal' ? type === 'habilidad'
                : mode === 'tile' ? type === null
                : true
              if (!fits) fail(`${bpath}.mode`, `mode ${mode} does not fit ${k}`)
            }
          }
          const block: Block = { key: plainKey(blk.key, `${bpath}.key`, blockKeys), mode, items: itemKeys }
          if (typeof blk.title === 'string') block.title = label(blk.title, `${bpath}.title`)
          if (mode === 'modal') {
            const filter = Array.isArray(blk.filterCategories) ? blk.filterCategories : []
            if (filter.length < 1 || filter.length > SHEET_LIMITS.filterCategories) fail(`${bpath}.filterCategories`, 'a modal block names the categories it filters')
            // A table that declares categories is filtered by those keys; any other one by free text.
            const first = itemKeys.map((k) => itemByKey.get(k)).find((t) => t?.kind === 'table' && t.type === 'habilidad')
            const declared = first ? actionCategoryKeys.get(first.key) : undefined
            block.filterCategories = filter.map((f, fi) => {
              const at = `${bpath}.filterCategories[${fi}]`
              if (declared === undefined) return label(f, at)
              if (typeof f !== 'string' || !declared.includes(f)) fail(at, 'not a category of the table')
              return typeof f === 'string' ? f : ''
            })
          }
          return block
        })
        const sectionKey = plainKey(sec.key, `${spath}.key`, sectionKeys)
        if (sectionKey === 'dm') fail(`${spath}.key`, 'reserved key') // the dm unread stamp is frozen for players
        return { key: sectionKey, label: label(sec.label, `${spath}.label`), items, blocks }
      }),
    }
  })
  if (raw.categories.length > SHEET_LIMITS.categories) fail('categories', 'too many categories')
  if (totalSections > SHEET_LIMITS.sections) fail('categories', 'too many sections')
  if (totalItems > SHEET_LIMITS.items) fail('categories', 'too many items')
  if (coinTables > 1) fail('categories', 'only one coin table is allowed')
  if (economyTables > 0 && coinTables === 0) fail('categories', 'an economy table needs the coin table that defines the denominations')
  for (const { path, stat } of capRows) if (!statRows.has(stat)) fail(path, 'must be the key of a stat row')

  // Pass 2: formulas
  const known = new Set<string>(['nivel', ...globalKeys.keys()])
  for (const row of statRows) {
    known.add(`${row}.valor`)
    known.add(`${row}.modificador`)
  }
  for (const [row, cols] of capColumns) for (const [col, hasFormula] of cols) if (!hasFormula) known.add(`${row}.${col}`)
  const edges = new Map<string, string[]>()
  for (const f of formulas) {
    const parsed = parseFormula(f.text)
    if (!parsed.ok) continue
    for (const ref of parsed.refs) {
      if (!known.has(ref) && !f.locals.includes(ref)) fail(f.path, `unknown reference {${ref}}`)
    }
    const uses = formulaUses(parsed.ast)
    // A table is read through a table function, never as a value; its columns must exist.
    for (const ref of uses.plain) if (tableKeys.has(ref) && !f.locals.includes(ref)) fail(f.path, `{${ref}} is a table, use it inside a table function`)
    for (const { table, columns } of uses.tables) {
      const cols = tableColumns.get(table)
      if (!cols) {
        if (known.has(table)) fail(f.path, `{${table}} is not a free, skill or coin table`) // an unknown name was reported above
      } else for (const column of columns) if (!cols.has(column)) fail(f.path, `${table} has no column "${column}"`)
    }
    // Cycle nodes: fields, stat modifiers and the formula columns of free/skill tables. A table function depends on the
    // columns it names (a stored column is not a node); column locals point at the column of the same table.
    if (!f.key.startsWith('col:') || f.table !== undefined) {
      const near = (ref: string) => (f.table !== undefined && f.locals.includes(ref) ? `col:${f.table}.${ref}` : ref)
      const deps = [...uses.plain.map(near), ...uses.tables.flatMap(({ table, columns }) => columns.map((c) => `col:${table}.${c}`))]
      edges.set(f.key, [...(edges.get(f.key) ?? []), ...deps]) // an options field or column has one formula per option
    }
  }
  // A calculation reads the column it names: a formula column is a graph node, a stored one is a leaf.
  for (const { path, key, calc } of calcs) {
    const cols = tableColumns.get(calc.table)
    if (!cols) fail(`${path}.table`, 'a calculation reads a free, skill or coin table')
    else if (calc.column !== undefined && !cols.has(calc.column)) fail(`${path}.column`, `${calc.table} has no column "${calc.column}"`)
    edges.set(key, calc.column === undefined ? [] : [`col:${calc.table}.${calc.column}`])
  }
  if (findEdgeCycle(edges) !== null) fail('categories', 'formulas reference each other in a cycle')

  // Roles
  const roles: Sheet['roles'] = {}
  if (raw.roles !== undefined) {
    if (!isRecord(raw.roles)) fail('roles', 'roles must be an object')
    else {
      for (const [name, key] of Object.entries(raw.roles)) {
        if (!(ROLE_NAMES as readonly string[]).includes(name)) fail(`roles.${name}`, 'unknown role')
        else if (typeof key !== 'string' || fieldTypes.get(key) !== 'number') fail(`roles.${name}`, 'a role is bound to a number field')
        else roles[name as RoleName] = key
      }
    }
  }

  const discarded = raw.discarded === undefined ? undefined : discardedOf(raw.discarded, fail)
  const card = raw.card === undefined ? undefined : cardOf(raw.card, categories, fail)

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, sheet: { categories, roles, ...(discarded !== undefined ? { discarded } : {}), ...(card !== undefined ? { card } : {}) } }
}

/** The card: pinned fields or coin/economy tables (with an optional number max), a Stat table line and a text excerpt. */
function cardOf(value: unknown, categories: Category[], fail: (path: string, message: string) => void): SheetCard | undefined {
  if (!isRecord(value)) return void fail('card', 'card must be an object'), undefined
  const items = new Map<string, Item>()
  for (const category of categories) for (const section of category.sections) for (const item of section.items) items.set(item.key, item)
  const isNumberField = (key: unknown) => typeof key === 'string' && items.get(key)?.kind === 'field' && (items.get(key) as Field).type === 'number'
  const pinned: CardPin[] = []
  if (!Array.isArray(value.pinned) || value.pinned.length > SHEET_LIMITS.pinned) fail('card.pinned', 'at most 6 pinned fields')
  else {
    const seen = new Set<string>()
    value.pinned.forEach((pin, i) => {
      const at = `card.pinned[${i}]`
      if (!isRecord(pin)) return void fail(at, 'invalid pinned field')
      const item = typeof pin.key === 'string' ? items.get(pin.key) : undefined
      const pinnable = item !== undefined && (item.kind === 'field' || item.type === 'monedas' || item.type === 'economia')
      if (!pinnable) return void fail(`${at}.key`, 'a pinned key is a field or a coin table')
      if (seen.has(item.key)) return void fail(`${at}.key`, 'pinned twice')
      seen.add(item.key)
      if (pin.max !== undefined && !(isNumberField(pin.max) && isNumberField(item.key))) fail(`${at}.max`, 'a max needs a number field and a number max')
      if (pin.dmOnly !== undefined && typeof pin.dmOnly !== 'boolean') fail(`${at}.dmOnly`, 'dmOnly is true or false')
      pinned.push({ key: item.key, ...(typeof pin.max === 'string' ? { max: pin.max } : {}), ...(pin.dmOnly === true ? { dmOnly: true as const } : {}) })
    })
  }
  const statItem = typeof value.statline === 'string' ? items.get(value.statline) : undefined
  if (value.statline !== undefined && !(statItem?.kind === 'table' && statItem.type === 'stat')) fail('card.statline', 'the stat line is a stat table')
  const excerptItem = typeof value.excerpt === 'string' ? items.get(value.excerpt) : undefined
  if (value.excerpt !== undefined && !(excerptItem?.kind === 'field' && (excerptItem.type === 'short' || excerptItem.type === 'paragraph'))) fail('card.excerpt', 'the excerpt is a text field')
  return {
    pinned,
    ...(typeof value.statline === 'string' ? { statline: value.statline } : {}),
    ...(typeof value.excerpt === 'string' ? { excerpt: value.excerpt } : {}),
  }
}

const isScopedKey = (key: unknown): key is string => typeof key === 'string' && KEY.test(key) && !PROTOTYPE_KEYS.has(key)

/**
 * The discarded list: shape only (key, label, type, bounds). The formulas inside refer to a sheet that no longer exists, so they are
 * judged when the item is restored and the whole sheet is validated again. Same rules as validate_sheet in the database.
 */
function discardedOf(value: unknown, fail: (path: string, message: string) => void): DiscardedEntry[] | undefined {
  if (!Array.isArray(value) || value.length > SHEET_LIMITS.discarded) return void fail('discarded', 'discarded is a list of at most 100 entries'), undefined
  const seen = new Set<string>()
  const out: DiscardedEntry[] = []
  value.forEach((entry, i) => {
    const at = `discarded[${i}]`
    if (!isRecord(entry)) return void fail(at, 'invalid entry')
    const src = entry.item
    if (!isRecord(src)) return void fail(`${at}.item`, 'invalid item') // no cap of its own: the size of the whole sheet bounds it, as for a live item
    const kind = src.kind
    if (kind !== 'field' && kind !== 'table' && kind !== 'row') return void fail(`${at}.item.kind`, 'kind must be field, table or row')
    const key = src.key
    if (typeof key !== 'string' || !KEY.test(key) || key.includes('__') || PROTOTYPE_KEYS.has(key)) return void fail(`${at}.item.key`, 'invalid key')
    if (RESERVED_KEYS.has(key)) return void fail(`${at}.item.key`, 'reserved key')
    if (seen.has(key)) return void fail(`${at}.item.key`, 'key already discarded')
    seen.add(key)
    const text = cleanLabel(src.label)
    if (text === null) return void fail(`${at}.item.label`, 'invalid label')
    if (kind === 'field') {
      if (!DISCARDED_FIELD_TYPES.includes(src.type)) return void fail(`${at}.item.type`, 'invalid type')
    } else if (kind === 'table') {
      if (!DISCARDED_TABLE_TYPES.includes(src.type)) return void fail(`${at}.item.type`, 'invalid type')
    } else {
      if (src.type !== 'stat' && src.type !== 'capacidades') return void fail(`${at}.item.type`, 'a removed row is a stat or capacidades row')
      if (!isScopedKey(src.table)) return void fail(`${at}.item.table`, 'a removed row names its table')
      if (src.type === 'capacidades') {
        const columns = src.columns
        const ok = Array.isArray(columns) && columns.length >= 1 && columns.length <= SHEET_LIMITS.columns && columns.every(isScopedKey) && new Set(columns).size === columns.length
        if (!ok) return void fail(`${at}.item.columns`, 'a capacidades row names the column keys of its table')
      } else if (src.columns !== undefined) return void fail(`${at}.item.columns`, 'only a capacidades row names columns')
    }
    const section = entry.section
    if (!isScopedKey(section)) return void fail(`${at}.section`, 'invalid key')
    if (typeof entry.at !== 'string' || !DISCARDED_AT.test(entry.at) || !realDay(entry.at)) return void fail(`${at}.at`, 'at must be an ISO date')
    out.push({ item: { ...src, label: text } as unknown as DiscardedItem, section, at: entry.at })
  })
  return out
}
