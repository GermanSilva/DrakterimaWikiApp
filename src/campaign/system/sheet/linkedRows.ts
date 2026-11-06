import type { LinkedAction } from '../../../data'
import type { Sheet } from './sheetModel'

/** Shown by the row modal as the description of a linked entry (not a column: the entry carries it, not the table). */
export const DESCRIPTION_KEY = '__descripcion'

/**
 * The character as the detail reads it when it links collection entries (S36): the rows of each Habilidad table are the legacy
 * rows stored in `pj[table]` FIRST (the character's own data, in the order they were stored) and the linked entries AFTER them
 * (name, category and entry columns from the entry, state columns from the link). Legacy rows stay until G10 migrates them
 * into the collection. Links to a table that is not a Habilidad table of the sheet are ignored. Returns `pj` itself when
 * there is nothing to add; never mutates it.
 */
export function withLinkedRows(sheet: Sheet, pj: Record<string, unknown>, linked: readonly LinkedAction[] | undefined): Record<string, unknown> {
  if (!linked || linked.length === 0) return pj
  const tables = new Set(
    sheet.categories.flatMap((c) => c.sections.flatMap((s) => s.items)).flatMap((i) => (i.kind === 'table' && i.type === 'habilidad' ? [i.key] : [])),
  )
  const added = new Map<string, Record<string, unknown>[]>()
  for (const { action, link } of linked) {
    if (!tables.has(action.table_key)) continue
    const row = { ...action.extras, ...link.state, id: `a${action.id}`, nombre: action.name, categoria: action.category, [DESCRIPTION_KEY]: action.description }
    added.set(action.table_key, [...(added.get(action.table_key) ?? []), row])
  }
  if (added.size === 0) return pj
  const out: Record<string, unknown> = { ...pj }
  for (const [key, rows] of added) out[key] = [...(Array.isArray(pj[key]) ? (pj[key] as unknown[]) : []), ...rows]
  return out
}
