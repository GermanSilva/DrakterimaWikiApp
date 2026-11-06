import { resolveSheetItems } from './resolveSheet'
import { ROLE_NAMES, type RoleName, type Sheet } from './sheetModel'

export type RoleKeys = Partial<Record<RoleName, string>>
export type RoleValues = Partial<Record<RoleName, number>>

/** The keys the readers outside the sheet use when the campaign has no valid stored sheet (the D&D 5e ones). */
export const LEGACY_ROLE_KEYS: RoleKeys = { hp: 'stat_hp', hp_current: 'stat_hp_current', ac: 'stat_ac', speed: 'stat_speed', initiative: 'stat_initiative' }

/** The field key each role is bound to; without a sheet, the fixed D&D keys. */
export function roleKeys(sheet: Sheet | null): RoleKeys {
  return sheet ? sheet.roles : LEGACY_ROLE_KEYS
}

/**
 * The value of each role for a character: computed through the sheet (formula and calc fields included). An unbound
 * role, or a bound one with no value, is absent. Without a sheet the fixed keys are read raw, as the readers always did.
 */
export function roleValues(sheet: Sheet | null, pj: Record<string, unknown>): RoleValues {
  const values: RoleValues = {}
  if (!sheet) {
    for (const role of ROLE_NAMES) {
      const raw = pj[LEGACY_ROLE_KEYS[role] as string]
      if (raw !== undefined) values[role] = raw as number
    }
    return values
  }
  if (Object.keys(sheet.roles).length === 0) return values
  const items = resolveSheetItems(sheet, pj)
  for (const role of ROLE_NAMES) {
    const key = sheet.roles[role]
    const item = key === undefined ? undefined : items[key]
    if (item?.kind === 'field' && !item.error && !item.empty && typeof item.value === 'number') values[role] = item.value
  }
  return values
}

/** The key a reader may WRITE for a role: bound and stored (a formula or calc field cannot be written). */
export function roleWriteKey(sheet: Sheet | null, role: RoleName): string | undefined {
  if (!sheet) return LEGACY_ROLE_KEYS[role]
  const key = sheet.roles[role]
  if (key === undefined) return undefined
  for (const category of sheet.categories) {
    for (const section of category.sections) {
      for (const item of section.items) {
        if (item.kind === 'field' && item.key === key) return item.formula === undefined && item.calc === undefined ? key : undefined
      }
    }
  }
  return undefined
}

/** Every key the sheet stores a value under: fields, tables and the rows of Stat and Capacidades tables. */
export function sheetKeys(sheet: Sheet): Set<string> {
  const keys = new Set<string>()
  for (const category of sheet.categories) {
    for (const section of category.sections) {
      for (const item of section.items) {
        keys.add(item.key)
        if (item.kind === 'table' && 'rows' in item) for (const row of item.rows) keys.add(row.key)
      }
    }
  }
  return keys
}
