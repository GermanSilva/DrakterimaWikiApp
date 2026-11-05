/**
 * The pure model behind the character editor drawn from the sheet (odd/design/sheet-builder.md, F5/G4b): who may write
 * which key, the payload of a save, the operations the widgets run on the draft, and the unread stamps of a save.
 *
 * The draft is the flat character (promoted columns plus `data` keys, the shape of a FlatEntity) being edited. Where a
 * value lives is documented in sheetAccess.ts. A save sends only the keys that changed AND that the viewer may write:
 * a player's payload is derived from `playerWriteRules()` (the TypeScript twin of the SQL guard), so a form bug can never
 * become a rejected save; the DM may write every non-formula place of the sheet plus coin and economy amounts.
 */
import type { SectionStamps } from '../../pjStamps'
import { sameValue } from '../../../helpers/pjSections'
import { playerValueOk, playerWriteRules, type ValueRule } from './sheetAccess'
import type { Column, Item, Sheet, Table } from './sheetModel'

type Draft = Record<string, unknown>
type RowTable = Extract<Table, { type: 'libre' | 'habilidad' }>

/** Promoted columns the editor writes. `jugador` never: the database derives it from the assignment (S30). */
const IDENTITY_DM = ['nombre', 'imagen_url', 'region', 'estado'] as const
const IDENTITY_PLAYER = ['nombre', 'imagen_url', 'region'] as const
const MAX_AMOUNT = 1e12

export interface PatchError {
  key: string
  message: string
}
export interface PatchResult {
  patch: Record<string, unknown>
  errors: PatchError[]
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

function allItems(sheet: Sheet): Item[] {
  return sheet.categories.flatMap((category) => category.sections.flatMap((section) => section.items))
}

/** The sheet seen as if every place were player-editable (the DM writes all of them), except computed fields. */
function asEditableByAll(sheet: Sheet): Sheet {
  const open = (column: Column): Column => ({ ...column, editableBy: 'player' })
  const reopen = (item: Item): Item => {
    if (item.kind === 'field') return item.calc ? item : { ...item, editableBy: 'player' }
    if (item.type === 'stat') return { ...item, rows: item.rows.map((row) => ({ ...row, editableBy: 'player' as const })) }
    if (item.type === 'capacidades') return { ...item, columns: item.columns.map(open), rows: item.rows.map((row) => ({ ...row, editableBy: 'player' as const })) }
    if (item.type === 'libre' || item.type === 'habilidad') return { ...item, editableBy: 'player', columns: item.columns.map(open) }
    return item
  }
  return { ...sheet, categories: sheet.categories.map((c) => ({ ...c, sections: c.sections.map((s) => ({ ...s, items: s.items.map(reopen) })) })) }
}

/** The value rule of every data key the viewer may write through the generic widgets (coin and economy amounts are apart). */
export function writeRules(sheet: Sheet, isDM: boolean): Record<string, ValueRule> {
  return playerWriteRules(isDM ? asEditableByAll(sheet) : sheet)
}

/** Keys that hold per-denomination amounts, writable by the DM only: the coin columns and the economy tables. */
function amountKeys(sheet: Sheet): string[] {
  const items = allItems(sheet)
  const keys = items.some((item) => item.kind === 'table' && item.type === 'monedas') ? ['monedas', 'monedas_guardado'] : []
  return [...keys, ...items.flatMap((item) => (item.kind === 'table' && item.type === 'economia' ? [item.key] : []))]
}

const amountError = (value: unknown): string | null => {
  if (!isRecord(value)) return 'las cantidades deben ser un objeto'
  return Object.values(value).every((amount) => typeof amount === 'number' && Number.isInteger(amount) && amount >= 0 && amount <= MAX_AMOUNT) ? null : 'las cantidades son enteros no negativos'
}

const hasId = (row: unknown): boolean => isRecord(row) && row.id !== undefined && row.id !== null && row.id !== ''

/** A row id no other row of the table uses: numeric ids count up from the highest one, any other id is only avoided. */
function nextRowId(rows: readonly unknown[]): number {
  const used = new Set(rows.filter(hasId).map((row) => String((row as Draft).id)))
  const numeric = [...used].filter((id) => /^\d+$/.test(id)).map(Number)
  let id = Math.max(0, ...numeric) + 1
  while (used.has(String(id))) id += 1
  return id
}

function withIds(rows: unknown[]): unknown[] {
  const out: unknown[] = []
  for (const row of rows) out.push(isRecord(row) && !hasId(row) ? { ...row, id: nextRowId([...out, ...rows]) } : row)
  return out
}

/** A new Libre row is blank until the user types: nothing but an id, or only zeros, empty text and unchecked boxes. */
function isBlankRow(row: unknown, columns: Column[]): boolean {
  if (!isRecord(row)) return false
  return columns.every((column) => {
    if (column.formula !== undefined) return true
    const value = row[column.key]
    if (value === undefined || value === null || value === '' || value === false) return true
    return column.type === 'number' && value === 0
  })
}

function rowTables(sheet: Sheet): Map<string, RowTable> {
  const tables = new Map<string, RowTable>()
  for (const item of allItems(sheet)) if (item.kind === 'table' && (item.type === 'libre' || item.type === 'habilidad')) tables.set(item.key, item)
  return tables
}

/**
 * What a save sends: the identity columns and every sheet key the viewer may write whose value differs from the stored
 * character. Accidental zero rows of Libre tables are dropped (S16 A1) and rows without an id get one (only when the
 * table really changed). A value the guard would reject is reported, never sent.
 */
export function sheetPatch(sheet: Sheet, entity: Draft, draft: Draft, isDM: boolean): PatchResult {
  const patch: Record<string, unknown> = {}
  const errors: PatchError[] = []
  for (const key of isDM ? IDENTITY_DM : IDENTITY_PLAYER) {
    if (key in draft && !sameValue(entity[key], draft[key])) patch[key] = draft[key]
  }
  const tables = rowTables(sheet)
  for (const [key, rule] of Object.entries(writeRules(sheet, isDM))) {
    if (!(key in draft)) continue
    let value = draft[key]
    if (sameValue(entity[key], value)) continue // an untouched table keeps even its stored zero rows
    const table = tables.get(key)
    if (table?.type === 'libre' && Array.isArray(value)) value = value.filter((row) => !isBlankRow(row, table.columns))
    if (sameValue(entity[key], value)) continue // only blank rows were added
    if (table && Array.isArray(value)) value = withIds(value)
    if (playerValueOk(value, rule)) patch[key] = value
    else errors.push({ key, message: 'valor no permitido' })
  }
  if (isDM) {
    for (const key of amountKeys(sheet)) {
      if (!(key in draft) || sameValue(entity[key], draft[key])) continue
      const message = amountError(draft[key])
      if (message === null) patch[key] = draft[key]
      else errors.push({ key, message })
    }
  }
  return { patch, errors }
}

export const setKey = (draft: Draft, key: string, value: unknown): Draft => ({ ...draft, [key]: value })

/** One denomination of a coin or economy object (`monedas`, `monedas_guardado`, an economy table). */
export function setAmount(draft: Draft, key: string, denomination: string, value: number): Draft {
  return { ...draft, [key]: { ...(isRecord(draft[key]) ? draft[key] : {}), [denomination]: value } }
}

const rowsOf = (draft: Draft, tableKey: string): unknown[] => (Array.isArray(draft[tableKey]) ? draft[tableKey] : [])

/** Sets one cell of the STORED row at `index` (never a display position); an unknown row changes nothing. */
export function setCell(draft: Draft, tableKey: string, index: number, columnKey: string, value: unknown): Draft {
  const rows = rowsOf(draft, tableKey)
  if (!isRecord(rows[index])) return draft
  return { ...draft, [tableKey]: rows.map((row, at) => (at === index ? { ...(row as Draft), [columnKey]: value } : row)) }
}

export const addRow = (draft: Draft, tableKey: string): Draft => ({ ...draft, [tableKey]: [...rowsOf(draft, tableKey), { id: nextRowId(rowsOf(draft, tableKey)) }] })

export function removeRow(draft: Draft, tableKey: string, index: number): Draft {
  const rows = rowsOf(draft, tableKey)
  return index < 0 || index >= rows.length ? draft : { ...draft, [tableKey]: rows.filter((_, at) => at !== index) }
}

/** The reset button of a number column (S16 A12): to zero, to another column of the same row, or to a fixed value. */
export function resetCell(sheet: Sheet, draft: Draft, tableKey: string, index: number, columnKey: string): Draft {
  const reset = rowTables(sheet).get(tableKey)?.columns.find((column) => column.key === columnKey)?.reset
  const row = rowsOf(draft, tableKey)[index]
  if (!reset || !isRecord(row)) return draft
  const value = reset.to === 'zero' ? 0 : reset.to === 'value' ? reset.value : typeof row[reset.column] === 'number' && Number.isFinite(row[reset.column]) ? (row[reset.column] as number) : 0
  return setCell(draft, tableKey, index, columnKey, value)
}

/** The sheet section that owns each data key (the unread dot is per section, S13). */
function sectionOfKeys(sheet: Sheet): Map<string, string> {
  const owner = new Map<string, string>()
  for (const category of sheet.categories) {
    for (const section of category.sections) {
      for (const item of section.items) {
        if (item.kind === 'field') owner.set(item.key, section.key)
        else if (item.type === 'stat') for (const row of item.rows) owner.set(row.key, section.key)
        else if (item.type === 'capacidades') {
          for (const row of item.rows) item.columns.forEach((column, at) => owner.set(at === 0 ? row.key : `${row.key}__${column.key}`, section.key))
        } else if (item.type === 'monedas') {
          owner.set('monedas', section.key)
          owner.set('monedas_guardado', section.key)
        } else owner.set(item.key, section.key)
      }
    }
  }
  return owner
}

/** Sections whose stamp a non-DM may write: every section of the sheet plus `general`, never `dm` (see sheet_guard_access). */
export function stampableSections(sheet: Sheet): string[] {
  const keys = sheet.categories.flatMap((category) => category.sections.map((section) => section.key))
  return [...new Set([...keys, 'general'])].filter((key) => key !== 'dm')
}

/** The sections a save changed, stamped with the time of the write (identity and unknown keys are "general"). */
export function sheetStamps(sheet: Sheet, patch: Record<string, unknown>, now: Date = new Date()): SectionStamps {
  const owner = sectionOfKeys(sheet)
  const stampable = new Set(stampableSections(sheet))
  const sections = [...new Set(Object.keys(patch).filter((key) => key !== 'sections_updated').map((key) => owner.get(key) ?? 'general'))].filter((key) => stampable.has(key))
  const stamp = now.toISOString()
  return { sections, stamps: Object.fromEntries(sections.map((key) => [key, stamp])) }
}
