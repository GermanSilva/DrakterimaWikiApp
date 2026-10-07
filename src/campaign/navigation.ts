/**
 * Collection key -> section key, for the collections whose URL segment differs. Every other
 * collection (sesiones, pjs, pnjs, lugares, facciones, lore, items, mapas) uses its own key.
 */
const SECTION_OF_TABLE: Record<string, string> = { homebrew_rules: 'homerules' }

export const sectionKeyForTable = (table: string): string => SECTION_OF_TABLE[table] ?? table

/** `/c/:slug/<section>[/<id>]` for an entity collection (wiki links, "back to list", after create). */
export function entityPath(slug: string, table: string, id?: number | null): string {
  const base = `/c/${encodeURIComponent(slug)}/${sectionKeyForTable(table)}`
  return id === undefined || id === null ? base : `${base}/${id}`
}
