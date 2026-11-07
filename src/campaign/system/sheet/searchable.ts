import { resolveSheetItems } from './resolveSheet'
import { validateSheet, type Sheet } from './sheetModel'

/** One searchable value of a character: a card tag and a text the list search matches. */
export interface SearchableTag {
  key: string
  label: string
  text: string
}

/** The stored sheet of the campaign when it validates (the check that decides the sheet detail and editor), else null. */
export function storedSheet(system: { sheet?: unknown }): Sheet | null {
  if (system.sheet === undefined || system.sheet === null) return null
  const result = validateSheet(system.sheet)
  return result.ok ? result.sheet : null
}

/**
 * Fields a viewer may see and the search reads: searchable short and number fields. The sheet has no per-field
 * visibility beyond `hidden` (a formula field nobody sees), so a hidden field is never offered.
 */
function visibleSearchable(sheet: Sheet) {
  return sheet.categories.flatMap((c) => c.sections.flatMap((s) => s.items)).filter((i) => i.kind === 'field' && i.searchable === true && i.hidden !== true)
}

/** Searchable values of a character in sheet order; empty values are left out. */
export function searchableTags(sheet: Sheet, pj: Record<string, unknown>): SearchableTag[] {
  const fields = visibleSearchable(sheet)
  if (fields.length === 0) return []
  const resolved = resolveSheetItems(sheet, pj)
  const tags: SearchableTag[] = []
  for (const field of fields) {
    const item = resolved[field.key]
    if (item?.kind !== 'field' || item.empty || item.hidden || item.text === '') continue
    tags.push({ key: item.key, label: item.label, text: item.text })
  }
  return tags
}

/** Labels of the searchable fields, for the search box hint. */
export function searchableLabels(sheet: Sheet): string[] {
  return visibleSearchable(sheet).map((f) => f.label)
}
