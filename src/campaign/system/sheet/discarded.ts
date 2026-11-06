/**
 * Which character data keys a discarded item owns (S26). The twin of `_discarded_data_keys` / `_discarded_rename_roots` in the
 * database (migration 20261106120000): the review reads these keys to show each character's value, and the purge and restore RPCs
 * act on exactly the same set.
 */
import type { DiscardedItem } from './sheetModel'

const KEYLIKE = /^[a-z][a-z0-9_]{0,89}$/
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)
const keyOf = (value: unknown): string | undefined => (isRecord(value) ? text(value.key) : undefined)

/** `row` and `row__column` for the columns after the first (the first value of a Capacidades row lives at the row key). */
const capacidadesKeys = (row: string, columnKeys: (string | undefined)[]): string[] => columnKeys.flatMap((column, at) => (at === 0 ? [row] : column !== undefined ? [`${row}__${column}`] : []))

/** The `data` keys an item owns. A coin table owns none (its amounts live in the `monedas` column). */
export function discardedDataKeys(entry: DiscardedItem): string[] {
  const item: unknown = entry
  if (!isRecord(item)) return []
  const key = text(item.key)
  let keys: (string | undefined)[] = []
  if (item.kind === 'field') keys = [key]
  else if (item.kind === 'row') keys = key === undefined ? [] : item.type === 'capacidades' ? capacidadesKeys(key, list(item.columns).map(text)) : [key]
  else if (item.kind === 'table') {
    if (item.type === 'libre' || item.type === 'habilidad' || item.type === 'economia') keys = [key]
    else if (item.type === 'stat') keys = list(item.rows).map(keyOf)
    else if (item.type === 'capacidades') {
      const columns = list(item.columns).map(keyOf)
      keys = list(item.rows).flatMap((row) => {
        const rowKey = keyOf(row)
        return rowKey === undefined ? [] : capacidadesKeys(rowKey, columns)
      })
    }
  }
  return [...new Set(keys.filter((k): k is string => k !== undefined && KEYLIKE.test(k)))]
}

/** The keys a restore can rename: the key of the item, plus the row keys of a Stat or Capacidades table. */
export function renameRoots(entry: DiscardedItem): string[] {
  const item: unknown = entry
  if (!isRecord(item)) return []
  const roots = [text(item.key)]
  if (item.kind === 'table' && (item.type === 'stat' || item.type === 'capacidades')) roots.push(...list(item.rows).map(keyOf))
  return roots.filter((k): k is string => k !== undefined)
}

/** Each owned data key paired with the key it moves to when the roots in `renames` are renamed; keys that stay are not listed. */
export function renamedDataKeys(item: DiscardedItem, renames: Readonly<Record<string, string>>): { from: string; to: string }[] {
  const pairs: { from: string; to: string }[] = []
  for (const owned of discardedDataKeys(item)) {
    const root = Object.keys(renames).find((r) => owned === r || owned.startsWith(`${r}__`))
    if (root !== undefined) pairs.push({ from: owned, to: renames[root] + owned.slice(root.length) })
  }
  return pairs.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))
}
