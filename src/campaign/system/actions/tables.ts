/**
 * What the action collection needs to know about the Habilidad tables of a sheet (S35-S37): which tables exist, which
 * columns belong to the entry (shared) or to the character (state), and who may write which state column.
 */
import { useMemo } from 'react'
import { useCampaign } from '../../CampaignContext'
import { parseSystemProfile } from '../systemProfile'
import { playerValueOk, type ValueRule } from '../sheet/sheetAccess'
import { storedSheet } from '../sheet/searchable'
import type { Column, Sheet, Table } from '../sheet/sheetModel'

export type HabilidadTable = Extract<Table, { type: 'habilidad' }>

/** Columns the entry stores itself (name, category), never as extras. */
const BUILT_IN = new Set(['nombre', 'categoria'])

export function habilidadTables(sheet: Sheet | null): HabilidadTable[] {
  if (!sheet) return []
  return sheet.categories.flatMap((c) => c.sections.flatMap((s) => s.items)).filter((i): i is HabilidadTable => i.kind === 'table' && i.type === 'habilidad')
}

/** The Habilidad tables of the stored sheet of a system document; none when the campaign has no valid sheet. */
export function actionTablesOf(system: { sheet?: unknown }): HabilidadTable[] {
  return habilidadTables(storedSheet(system))
}

/** True when the raw `campaigns.system_profile` holds a valid sheet with a Habilidad table: the only case the catalogue exists. */
export function hasActionTablesIn(systemProfile: unknown): boolean {
  return actionTablesOf(parseSystemProfile(systemProfile)).length > 0
}

/** `hasActionTablesIn` for the current campaign. */
export function useHasActionTables(): boolean {
  const { campaign } = useCampaign()
  return useMemo(() => hasActionTablesIn(campaign.system_profile), [campaign.system_profile])
}

/** Entry-scope columns that the form edits as `extras`. */
export function entryColumns(table: HabilidadTable): Column[] {
  return table.columns.filter((c) => c.formula === undefined && (c.scope ?? 'entry') === 'entry' && !BUILT_IN.has(c.key))
}

/** Character-scope columns: the per-character state of a link. */
export function stateColumns(table: HabilidadTable): Column[] {
  return table.columns.filter((c) => c.formula === undefined && c.scope === 'character')
}

/**
 * The state keys a viewer may write on a link and how each value is judged. The DM writes every state column; a player only
 * on a table the sheet opens to them and on columns that are player-editable too (the server twin is validate_pj_action_link).
 */
export function stateRules(table: HabilidadTable, isDM: boolean): Record<string, ValueRule> {
  if (!isDM && table.editableBy !== 'player') return {}
  const rules: Record<string, ValueRule> = {}
  for (const column of stateColumns(table)) {
    if (!isDM && column.editableBy !== 'player') continue
    rules[column.key] = { t: column.type, ...(column.options ? { opts: column.options.map((o) => o.key) } : {}) }
  }
  return rules
}

/** The keys of `patch` the viewer may send; `invalid` names the refused ones (not writable, or a value the server would reject). */
export function allowedStatePatch(table: HabilidadTable, isDM: boolean, patch: Record<string, unknown>): { allowed: Record<string, unknown>; invalid: string[] } {
  const rules = stateRules(table, isDM)
  const allowed: Record<string, unknown> = {}
  const invalid: string[] = []
  for (const [key, value] of Object.entries(patch)) {
    if (Object.hasOwn(rules, key) && playerValueOk(value, rules[key])) allowed[key] = value
    else invalid.push(key)
  }
  return { allowed, invalid }
}

export const categoryLabel = (table: HabilidadTable, key: string): string => table.categories?.find((c) => c.key === key)?.label ?? key

export interface CategoryGroup<T> {
  /** The declared key; absent for the trailing "Otras" group and for free-text groups. */
  key?: string
  label: string
  items: T[]
}

/**
 * Items grouped by category like the sheet rows are: the declared categories in their order with their labels, then "Otras"
 * for any other value; without declared categories, by free text in alphabetical order ("Sin categoría" last). Empty groups are left out.
 */
export function groupByCategory<T>(table: HabilidadTable, items: T[], categoryOf: (item: T) => string): CategoryGroup<T>[] {
  if (table.categories) {
    const declared = table.categories
    const groups: CategoryGroup<T>[] = [
      ...declared.map((c) => ({ key: c.key, label: c.label, items: items.filter((i) => categoryOf(i) === c.key) })),
      { label: 'Otras', items: items.filter((i) => !declared.some((c) => c.key === categoryOf(i))) },
    ]
    return groups.filter((g) => g.items.length > 0)
  }
  const texts = [...new Set(items.map((i) => categoryOf(i).trim()))].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
  return texts.map((text) => ({ label: text === '' ? 'Sin categoría' : text, items: items.filter((i) => categoryOf(i).trim() === text) }))
}
