/** Finders over a sheet shared by the validator and the executor of action functions. */
import { roleWriteKey } from '../../sheet/roles'
import { ROLE_NAMES, type Column, type Field, type Sheet, type Table } from '../../sheet/sheetModel'

export type RowTable = Extract<Table, { type: 'libre' | 'habilidad' }>

const items = (sheet: Sheet) => sheet.categories.flatMap((c) => c.sections.flatMap((s) => s.items))

export const findTable = (sheet: Sheet, key: string): Table | undefined => items(sheet).find((i): i is Table => i.kind === 'table' && i.key === key)
export const findField = (sheet: Sheet, key: string): Field | undefined => items(sheet).find((i): i is Field => i.kind === 'field' && i.key === key)
export const isRowTable = (table: Table | undefined): table is RowTable => table?.type === 'libre' || table?.type === 'habilidad'

/** A stored number: the only thing an effect can write (no formula, no calculation, no options). */
export const isStoredNumber = (item: { type: string; formula?: string; calc?: unknown }): boolean => item.type === 'number' && item.formula === undefined && item.calc === undefined

export type FieldTarget = { ok: true; key: string; field: Field } | { ok: false; reason: string }

/**
 * The stored number field a `field` target names: a field key, else a role bound in the sheet (resolved to the key it
 * writes). `key` is the data key the effect writes.
 */
export function resolveFieldTarget(sheet: Sheet, name: string): FieldTarget {
  let field = findField(sheet, name)
  let key = name
  if (!field && (ROLE_NAMES as readonly string[]).includes(name)) {
    const role = roleWriteKey(sheet, name as (typeof ROLE_NAMES)[number])
    if (role === undefined) return { ok: false, reason: `the role ${name} is not bound to a stored field in the sheet` }
    field = findField(sheet, role)
    key = role
  }
  if (!field) return { ok: false, reason: `no field or role named ${name}` }
  if (!isStoredNumber(field)) return { ok: false, reason: `${field.key} is not a stored number field` }
  return { ok: true, key, field }
}

/** The numeric (number or flag) columns of a table; what a formula can read as a local value. */
export const numericColumns = (columns: Column[]): Column[] => columns.filter((c) => c.type === 'number' || c.type === 'boolean')
