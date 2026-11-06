/**
 * Discarded fields (S26, S32), the draft side. Removing a SAVED item does not drop it: its definition moves to `discarded` with the
 * section it came from and today's date, and the characters' data stays untouched and hidden. Restoring moves it back to the end of its
 * section (or of the last section when that one is gone); a key a live item took meanwhile gets the next free `key_2`, `key_3`...
 *
 * Columns are NOT discarded: their values live inside the row objects of the table (and in the action collection), so a removed column
 * keeps today's behaviour (the values stay in the rows, unseen). Coin denominations hold no character data of their own either.
 */
import { discardedDataKeys, renameRoots } from '../sheet/discarded'
import type { DiscardedItem } from '../sheet/sheetModel'
import { getAt, isNode, setAt, type Node, type Path } from './draft'
import type { RemovalKind } from './removal'

const nodes = (value: unknown): Node[] => (Array.isArray(value) ? value.filter(isNode) : [])
const isStored = (node: Node): boolean => node._new !== true

/** A copy without the builder-only properties (`_new`, `_open`...) and without the rows or columns added in this session. */
function clean<T>(value: T): T {
  if (Array.isArray(value)) return value.filter((v) => !(isNode(v) && v._new === true)).map(clean) as T
  if (isNode(value)) return Object.fromEntries(Object.entries(value).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, clean(v)])) as T
  return value
}

export interface DiscardedNode {
  item: Node
  section: string
  at: string
}

const keyOf = (node: Node): string => (typeof node.key === 'string' ? node.key : '')

/** The entries removing `list[index]` leaves behind: every saved item inside it, a saved Stat or Capacidades row. */
export function discardedBy(draft: Node, list: Path, index: number, kind: RemovalKind, now: Date): DiscardedNode[] {
  const node = getAt(draft, [...list, index])
  if (!isNode(node)) return []
  const at = now.toISOString()
  const ofItems = (section: Node): DiscardedNode[] => nodes(section.items).filter(isStored).map((item) => ({ item: clean(item), section: keyOf(section), at }))
  if (kind === 'item') {
    const section = getAt(draft, list.slice(0, -1))
    return isStored(node) && isNode(section) ? [{ item: clean(node), section: keyOf(section), at }] : []
  }
  if (kind === 'section') return ofItems(node)
  if (kind === 'category') return nodes(node.sections).flatMap(ofItems)
  if (kind === 'row') {
    const table = getAt(draft, list.slice(0, -1))
    const section = getAt(draft, list.slice(0, -3))
    if (!isNode(table) || !isNode(section) || !isStored(node) || !isStored(table)) return []
    if (table.type === 'capacidades') return [{ item: { ...clean(node), kind: 'row', type: 'capacidades', table: keyOf(table), columns: nodes(table.columns).map(keyOf) }, section: keyOf(section), at }]
    if (table.type === 'stat') return [{ item: { ...clean(node), kind: 'row', type: 'stat', table: keyOf(table) }, section: keyOf(section), at }]
  }
  return []
}

/** The draft with the entries added. An older entry with the same key stays as it is: its definition is never lost (the builder refuses such a removal, see removalConflict). */
export function addDiscarded(draft: Node, entries: DiscardedNode[]): Node {
  if (entries.length === 0) return draft
  const kept = nodes(draft.discarded)
  const held = new Set(kept.map((e) => keyOf(isNode(e.item) ? e.item : {})))
  const fresh = entries.filter((e) => !held.has(keyOf(e.item)))
  return fresh.length === 0 ? draft : { ...draft, discarded: [...kept, ...fresh] }
}

export const discardedEntries = (draft: Node): DiscardedNode[] => nodes(draft.discarded) as unknown as DiscardedNode[]

/** The keys live items own in the draft: items, tables and the rows of its tables. */
function liveKeys(draft: Node): Set<string> {
  const keys = new Set<string>()
  for (const category of nodes(draft.categories)) {
    for (const section of nodes(category.sections)) {
      for (const item of nodes(section.items)) {
        keys.add(keyOf(item))
        nodes(item.rows).forEach((row) => keys.add(keyOf(row)))
      }
    }
  }
  return keys
}

function freshKey(key: string, taken: ReadonlySet<string>): string {
  for (let n = 2; ; n++) {
    const suffix = `_${n}`
    const candidate = `${key.slice(0, 40 - suffix.length)}${suffix}`
    if (!taken.has(candidate)) return candidate
  }
}

export type RestorePlan =
  | { ok: true; draft: Node; renames: Record<string, string>; warning: string | null }
  | { ok: false; message: string }

const quoted = (key: string) => `«${key}»`

/**
 * What restoring the discarded item `key` does to the draft: the item at the END of its original section (the last section of the last
 * category when that one is gone), or, for a removed row, at the end of its table. `renames` lists the keys that were taken meanwhile and
 * their new key; when it is not empty the characters' data has to move too (the rekey RPC), and `warning` says so.
 */
export function planRestore(draft: Node, key: string): RestorePlan {
  const entries = discardedEntries(draft)
  const entry = entries.find((e) => keyOf(e.item) === key)
  if (!entry) return { ok: false, message: `No hay un campo descartado con la clave ${quoted(key)}.` }
  const item = entry.item as unknown as DiscardedItem & Node
  const label = typeof item.label === 'string' ? item.label : key

  const live = liveKeys(draft)
  const taken = new Set<string>([...live, ...entries.flatMap((e) => (e === entry ? [] : [keyOf(e.item), ...discardedDataKeys(e.item as unknown as DiscardedItem)]))])
  const renames: Record<string, string> = {}
  for (const root of renameRoots(item)) {
    if (!live.has(root)) continue
    const next = freshKey(root, new Set([...taken, ...live, ...Object.values(renames)]))
    renames[root] = next
  }
  const rename = (k: unknown): unknown => (typeof k === 'string' && renames[k] !== undefined ? renames[k] : k)

  let next: Node = draft
  if (item.kind === 'row') {
    const tablePath = findTable(draft, String(item.table), String(item.type))
    if (!tablePath) return { ok: false, message: `No se puede restaurar ${quoted(label)}: su tabla ${quoted(String(item.table))} ya no está en la plantilla. Restaurala primero.` }
    const { kind: _kind, type: _type, table: _table, columns: _columns, ...row } = item as unknown as Record<string, unknown>
    void [_kind, _type, _table, _columns]
    next = setAt(next, [...tablePath, 'rows'], [...nodes(getAt(next, [...tablePath, 'rows'])), { ...row, key: rename(row.key) }])
  } else {
    const target = restoreTarget(draft, entry.section)
    if (!target) return { ok: false, message: `No se puede restaurar ${quoted(label)}: la plantilla no tiene secciones.` }
    const restored: Node = { ...item, key: rename(item.key) as string }
    if (restored.kind === 'table' && Array.isArray(restored.rows)) restored.rows = nodes(restored.rows).map((row) => ({ ...row, key: rename(row.key) }))
    next = setAt(next, target, [...nodes(getAt(next, target)), restored])
  }

  const remaining = entries.filter((e) => e !== entry)
  const { discarded: _old, ...rest } = next
  void _old
  next = remaining.length > 0 ? { ...rest, discarded: remaining } : rest

  const changed = Object.entries(renames)
  const warning = changed.length === 0 ? null : changed.map(([from, to]) => `La clave ${quoted(from)} ya la usa otro campo de la plantilla: se restauró como ${quoted(to)}.`).join(' ')
  return { ok: true, draft: next, renames, warning }
}

/** `[...path to the section, 'items']` of the section with that key, else of the last section of the last category. */
function restoreTarget(draft: Node, sectionKey: string): Path | null {
  const categories = nodes(draft.categories)
  let last: Path | null = null
  for (let c = 0; c < categories.length; c++) {
    const sections = nodes(categories[c].sections)
    for (let s = 0; s < sections.length; s++) {
      const here: Path = ['categories', c, 'sections', s, 'items']
      if (keyOf(sections[s]) === sectionKey) return here
      last = here
    }
  }
  return last
}

/** The path of the table with that key and type (the ones that have rows to restore into). */
function findTable(draft: Node, tableKey: string, type: string): Path | null {
  const categories = nodes(draft.categories)
  for (let c = 0; c < categories.length; c++) {
    const sections = nodes(categories[c].sections)
    for (let s = 0; s < sections.length; s++) {
      const items = nodes(sections[s].items)
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'table' && items[i].type === type && keyOf(items[i]) === tableKey) return ['categories', c, 'sections', s, 'items', i]
      }
    }
  }
  return null
}
