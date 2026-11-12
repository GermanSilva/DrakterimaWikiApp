/** Read-only questions the editors ask about the whole draft (which tables, stats and number fields exist). */
import { isNode, type Node, type Path } from './draft'

const nodes = (value: unknown): Node[] => (Array.isArray(value) ? value.filter(isNode) : [])

/** Every item of the sheet with the path of its list entry. */
export function allItems(draft: Node): { item: Node; path: Path }[] {
  return nodes(draft.categories).flatMap((category, ci) =>
    nodes(category.sections).flatMap((section, si) => nodes(section.items).map((item, ii) => ({ item, path: ['categories', ci, 'sections', si, 'items', ii] as Path }))),
  )
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')

/** The tables a calculation can read: Libre, Habilidad and coin tables, with the columns it can name. */
export function calcTables(draft: Node): { key: string; label: string; columns: { key: string; label: string }[] }[] {
  return allItems(draft)
    .filter(({ item }) => item.kind === 'table' && (item.type === 'libre' || item.type === 'habilidad' || item.type === 'monedas'))
    .map(({ item }) => ({
      key: text(item.key),
      label: text(item.label),
      columns:
        item.type === 'monedas'
          ? [{ key: 'key', label: 'Clave' }, { key: 'label', label: 'Nombre' }, { key: 'value', label: 'Valor' }]
          : nodes(item.columns).map((c) => ({ key: text(c.key), label: text(c.label) })),
    }))
}

/** The rows of every Stat table: what a Capacidades row can be linked to. */
export const statRows = (draft: Node): { key: string; label: string }[] =>
  allItems(draft)
    .filter(({ item }) => item.kind === 'table' && item.type === 'stat')
    .flatMap(({ item }) => nodes(item.rows).map((r) => ({ key: text(r.key), label: text(r.label) })))
