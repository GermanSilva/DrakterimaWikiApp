/**
 * The character sheet of a campaign as data (`system_profile.sheet`, odd/design/sheet-builder.md). The code knows
 * categories, sections, fields, tables, blocks and a formula language, never a game. `validateSheet` is the client
 * twin of the database validator: it rebuilds a normalised sheet (only known properties survive, labels trimmed)
 * or reports every problem with its path. A sheet that does not validate is never half-used.
 */
import { cleanLabel } from '../systemProfile'
import { findFormulaCycle, parseFormula } from '../formula/formula'

export const FIELD_TYPES = ['short', 'paragraph', 'number', 'boolean'] as const
export type FieldType = (typeof FIELD_TYPES)[number]
export type EditableBy = 'dm' | 'player'
export const BLOCK_MODES = ['stat', 'tile', 'capacidades', 'plano', 'modal'] as const
export type BlockMode = (typeof BLOCK_MODES)[number]
export const ROLE_NAMES = ['hp', 'hp_current', 'ac', 'speed', 'initiative'] as const
export type RoleName = (typeof ROLE_NAMES)[number]

export interface Column {
  key: string
  label: string
  type: FieldType
  formula?: string
  editableBy: EditableBy
}
export interface Field {
  kind: 'field'
  key: string
  label: string
  type: FieldType
  formula?: string
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
export type Table =
  | { kind: 'table'; type: 'stat'; key: string; label: string; rows: StatRow[] }
  | { kind: 'table'; type: 'capacidades'; key: string; label: string; columns: Column[]; rows: CapacidadRow[] }
  | { kind: 'table'; type: 'habilidad'; key: string; label: string; columns: Column[]; editableBy: EditableBy }
  | { kind: 'table'; type: 'libre'; key: string; label: string; columns: Column[]; editableBy: EditableBy }
  | { kind: 'table'; type: 'monedas'; key: string; label: string; rows: CoinRow[] }
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
export interface Sheet {
  categories: Category[]
  roles: Partial<Record<RoleName, string>>
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
  coinValue: 1_000_000_000,
  text: 4000,
} as const

const KEY = /^[a-z][a-z0-9_]{0,39}$/
/** Keys the application owns (columns of pjs, identity) or that would confuse the formula scope. */
export const RESERVED_KEYS: ReadonlySet<string> = new Set([
  'nombre', 'jugador', 'imagen_url', 'visible_to', 'monedas', 'monedas_guardado', 'notas', 'sections_updated', 'id', 'nivel',
  'clase', 'raza', 'region', 'estado', 'owner_id', 'campaign_id', 'created_by', 'created_at', 'updated_at', 'data',
  'valor', 'modificador', 'constructor', 'prototype',
])

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isEditor = (value: unknown): value is EditableBy => value === 'dm' || value === 'player'
const isFieldType = (value: unknown): value is FieldType => (FIELD_TYPES as readonly unknown[]).includes(value)

export function validateSheet(raw: unknown): SheetResult {
  const errors: SheetError[] = []
  const fail = (path: string, message: string) => void errors.push({ path, message })

  if (!isRecord(raw) || !Array.isArray(raw.categories)) return { ok: false, errors: [{ path: '', message: 'a sheet needs categories' }] }

  const globalKeys = new Map<string, string>() // key -> path, items, tables and rows share one namespace
  const claim = (key: unknown, path: string): string | null => {
    if (typeof key !== 'string' || !KEY.test(key)) return void fail(path, 'invalid key'), null
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
    if (typeof key !== 'string' || !KEY.test(key) || RESERVED_KEYS.has(key)) fail(path, 'invalid key')
    else if (seen.has(key)) fail(path, 'repeated key')
    else seen.add(key)
    return typeof key === 'string' ? key : ''
  }
  const editor = (value: unknown, path: string): EditableBy => {
    if (!isEditor(value)) fail(path, 'editableBy must be dm or player')
    return isEditor(value) ? value : 'dm'
  }
  const formulaOf = (value: unknown, path: string): string | undefined => {
    if (value === undefined) return undefined
    if (typeof value !== 'string' || !parseFormula(value).ok) {
      fail(path, 'invalid formula')
      return undefined
    }
    return value
  }
  const columnsOf = (value: unknown, path: string): Column[] => {
    if (!Array.isArray(value) || value.length > SHEET_LIMITS.columns) return void fail(path, 'columns required'), []
    const seen = new Set<string>()
    return value.map((c, i) => {
      const at = `${path}[${i}]`
      const col = isRecord(c) ? c : {}
      if (!isRecord(c)) fail(at, 'invalid column')
      const type = isFieldType(col.type) ? col.type : (fail(`${at}.type`, 'invalid type'), 'short' as FieldType)
      const formula = formulaOf(col.formula, `${at}.formula`)
      if (formula !== undefined && type !== 'number' && type !== 'boolean') fail(`${at}.formula`, 'formula needs a number or boolean column')
      return {
        key: plainKey(col.key, `${at}.key`, seen),
        label: label(col.label, `${at}.label`),
        type,
        ...(formula !== undefined ? { formula } : {}),
        editableBy: editor(col.editableBy, `${at}.editableBy`),
      }
    })
  }

  // Pass 1: structure (collected so formula and link checks can resolve against everything)
  const formulas: { path: string; key: string; text: string; locals: string[] }[] = []
  const statRows = new Set<string>()
  const capRows: { path: string; stat: string }[] = []
  const capColumns = new Map<string, Map<string, boolean>>() // `${row}` -> column key -> hasFormula
  const fieldTypes = new Map<string, FieldType>()
  let coinTables = 0
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
            const formula = formulaOf(item.formula, `${ipath}.formula`)
            const editableBy = editor(item.editableBy, `${ipath}.editableBy`)
            if (formula !== undefined) {
              if (type !== 'number' && type !== 'boolean') fail(`${ipath}.formula`, 'formula needs a number or boolean field')
              if (editableBy !== 'dm') fail(`${ipath}.editableBy`, 'a formula field is computed, only the DM level can own it')
              formulas.push({ path: `${ipath}.formula`, key, text: formula, locals: [] })
            }
            fieldTypes.set(key, type)
            const field: Field = { kind: 'field', key, label: name, type, editableBy, ...(formula !== undefined ? { formula } : {}) }
            for (const bound of ['min', 'max'] as const) {
              const value = item[bound]
              if (value === undefined) continue
              if (type !== 'number' || typeof value !== 'number' || !Number.isFinite(value)) fail(`${ipath}.${bound}`, 'invalid bound')
              else field[bound] = value
            }
            if (item.default !== undefined) {
              const d = item.default
              const ok =
                (type === 'number' && typeof d === 'number' && Number.isFinite(d)) ||
                (type === 'boolean' && typeof d === 'boolean') ||
                ((type === 'short' || type === 'paragraph') && typeof d === 'string' && d.length <= SHEET_LIMITS.text)
              if (ok) field.default = d as string | number | boolean
              else fail(`${ipath}.default`, 'default does not match the type')
            }
            return field
          }
          if (item.kind === 'table') {
            const rowsRaw = Array.isArray(item.rows) ? item.rows : []
            if (rowsRaw.length > (item.type === 'monedas' ? SHEET_LIMITS.denominations : SHEET_LIMITS.rows)) fail(`${ipath}.rows`, 'too many rows')
            const rowsOf = rowsRaw.slice(0, SHEET_LIMITS.rows)
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
              const hasFormula = new Map(columns.map((c) => [c.key, c.formula !== undefined]))
              const local = columns.filter((c) => c.formula !== undefined)
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
              for (const [c, col] of local.entries()) {
                const ci2 = columns.indexOf(col)
                formulas.push({ path: `${ipath}.columns[${ci2}].formula`, key: `col:${key}.${col.key}`, text: col.formula as string, locals: columns.map((x) => x.key) })
                void c
              }
              return { kind: 'table', type: 'capacidades', key, label: name, columns, rows }
            }
            if (item.type === 'habilidad' || item.type === 'libre') {
              const columns = columnsOf(item.columns, `${ipath}.columns`)
              columns.forEach((col, ci2) => {
                if (col.formula !== undefined) formulas.push({ path: `${ipath}.columns[${ci2}].formula`, key: `col:${key}.${col.key}`, text: col.formula, locals: columns.map((x) => x.key) })
              })
              return { kind: 'table', type: item.type, key, label: name, columns, editableBy: editor(item.editableBy, `${ipath}.editableBy`) }
            }
            if (item.type === 'monedas') {
              coinTables += 1
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
              return { kind: 'table', type: 'monedas', key, label: name, rows }
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
            block.filterCategories = filter.map((f, fi) => label(f, `${bpath}.filterCategories[${fi}]`))
          }
          return block
        })
        return { key: plainKey(sec.key, `${spath}.key`, sectionKeys), label: label(sec.label, `${spath}.label`), items, blocks }
      }),
    }
  })
  if (raw.categories.length > SHEET_LIMITS.categories) fail('categories', 'too many categories')
  if (totalSections > SHEET_LIMITS.sections) fail('categories', 'too many sections')
  if (totalItems > SHEET_LIMITS.items) fail('categories', 'too many items')
  if (coinTables > 1) fail('categories', 'only one coin table is allowed')
  for (const { path, stat } of capRows) if (!statRows.has(stat)) fail(path, 'must be the key of a stat row')

  // Pass 2: formulas
  const known = new Set<string>(['nivel', ...globalKeys.keys()])
  for (const row of statRows) {
    known.add(`${row}.valor`)
    known.add(`${row}.modificador`)
  }
  for (const [row, cols] of capColumns) for (const [col, hasFormula] of cols) if (!hasFormula) known.add(`${row}.${col}`)
  const graph: Record<string, string> = {}
  for (const f of formulas) {
    const parsed = parseFormula(f.text)
    if (!parsed.ok) continue
    for (const ref of parsed.refs) {
      if (!known.has(ref) && !f.locals.includes(ref)) fail(f.path, `unknown reference {${ref}}`)
    }
    if (!f.key.startsWith('col:')) graph[f.key] = f.text
  }
  if (findFormulaCycle(graph) !== null) fail('categories', 'formulas reference each other in a cycle')

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

  return errors.length > 0 ? { ok: false, errors } : { ok: true, sheet: { categories, roles } }
}
