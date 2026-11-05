/**
 * Who may write which `pjs.data` key, derived from the sheet (odd/design/sheet-builder.md sections 5 and 8). The database
 * derives the same list in `sheet_guard_access()` (migration 20261028140000); pgTAP 21 and the parity test in
 * dnd5eSheet.test.ts keep the two from drifting apart. The DM is never restricted by the sheet.
 *
 * Where a value lives in `data`:
 *  - field: `data[field.key]`
 *  - Stat row: `data[row.key]` (the value); the name and the modifier formula are structural and never written on a character
 *  - Capacidades row: `data[row.key]` (first value column) and `data[row.key + '__' + column.key]` for the others;
 *    a row value is writable only when the row AND its column allow the player (S11)
 *  - Habilidad / Libre table: `data[table.key]`, an array of rows owned by the character
 *  - coins: never (credited by the server, written by the DM; S12)
 *  - economy table: never (G2c: `data[table.key]` is an amounts object the SQL guard does not derive; DM only, so the
 *    validators reject `editableBy: 'player'` on it)
 */
import type { FieldType, Sheet } from './sheetModel'

/**
 * How the database judges one value a player writes (the `spec` of `_sheet_value_ok`, migration 20261105160000):
 * `opts` are the option keys declared at that place, `cols` the non-formula columns of a table.
 */
export interface ValueRule {
  t: FieldType | 'table'
  min?: number
  max?: number
  opts?: string[]
  cols?: Record<string, ValueRule>
}

/** The value rule of every data key a player may write, derived like `sheet_guard_access()` does. */
export function playerWriteRules(sheet: Sheet): Record<string, ValueRule> {
  const rules: Record<string, ValueRule> = {}
  for (const category of sheet.categories) {
    for (const section of category.sections) {
      for (const item of section.items) {
        if (item.kind === 'field') {
          if (item.editableBy === 'player' && item.formula === undefined) {
            rules[item.key] = {
              t: item.type,
              ...(item.min !== undefined ? { min: item.min } : {}),
              ...(item.max !== undefined ? { max: item.max } : {}),
              ...(item.options ? { opts: item.options.map((o) => o.key) } : {}),
            }
          }
        } else if (item.type === 'stat') {
          for (const row of item.rows) if (row.editableBy === 'player') rules[row.key] = { t: 'number' }
        } else if (item.type === 'capacidades') {
          for (const row of item.rows) {
            if (row.editableBy !== 'player') continue
            item.columns.forEach((column, index) => {
              if (column.editableBy !== 'player' || column.formula !== undefined) return
              rules[index === 0 ? row.key : `${row.key}__${column.key}`] = { t: column.type, ...(column.options ? { opts: column.options.map((o) => o.key) } : {}) }
            })
          }
        } else if (item.type === 'habilidad' || item.type === 'libre') {
          if (item.editableBy !== 'player') continue
          const cols: Record<string, ValueRule> = {}
          for (const column of item.columns) {
            if (column.formula !== undefined) continue
            cols[column.key] = { t: column.type, ...(column.options ? { opts: column.options.map((o) => o.key) } : {}) }
          }
          rules[item.key] = { t: 'table', cols }
        }
      }
    }
  }
  return rules
}

/** Twin of `_sheet_value_ok`: null clears; otherwise the value must fit the rule (an options value is one of its declared keys). */
export function playerValueOk(value: unknown, rule: ValueRule): boolean {
  if (value === null || value === undefined) return true
  if (rule.t === 'table') {
    if (!Array.isArray(value) || value.length > 500 || JSON.stringify(value).length > 200000) return false
    const cols = rule.cols ?? {}
    return value.every((row) => {
      if (typeof row !== 'object' || row === null || Array.isArray(row)) return false
      return Object.entries(row).every(([k, v]) => {
        if (k === 'id') return (typeof v === 'number' || typeof v === 'string') && String(v).length <= 64
        return Object.hasOwn(cols, k) && playerValueOk(v, cols[k])
      })
    })
  }
  if (rule.t === 'short') return typeof value === 'string' && [...value].length <= 500
  if (rule.t === 'paragraph') return typeof value === 'string' && [...value].length <= 20000
  if (rule.t === 'boolean') return typeof value === 'boolean'
  if (rule.t === 'options') return typeof value === 'string' && (rule.opts ?? []).includes(value)
  if (rule.t === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e12) return false
    return (rule.min === undefined || value >= rule.min) && (rule.max === undefined || value <= rule.max)
  }
  return false
}

export function playerWritableKeys(sheet: Sheet): string[] {
  return Object.keys(playerWriteRules(sheet)).sort()
}
