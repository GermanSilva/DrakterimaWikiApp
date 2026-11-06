/**
 * The builder edits the sheet as plain JSON (a "draft") addressed by the same paths `validateSheet` reports, so an error
 * lands on the part that caused it. Every helper here is pure and returns a new tree; nothing mutates the draft.
 * A node the DM just added carries `_new: true` (its key is still editable); `validateSheet` drops it on save.
 */
import { RESERVED_KEYS } from '../sheet/sheetModel'

export type Node = Record<string, unknown>
export type Step = string | number
export type Path = readonly Step[]

export const isNode = (value: unknown): value is Node => typeof value === 'object' && value !== null && !Array.isArray(value)

/** `categories[0].sections[1]` -> ['categories', 0, 'sections', 1]. */
export function parsePath(text: string): Path {
  return [...text.matchAll(/\[(\d+)\]|([^.[\]]+)/g)].map((m) => (m[1] !== undefined ? Number(m[1]) : m[2]))
}

export function getAt(root: unknown, path: Path): unknown {
  let cur = root
  for (const step of path) {
    if (Array.isArray(cur) && typeof step === 'number') cur = cur[step]
    else if (isNode(cur) && typeof step === 'string') cur = cur[step]
    else return undefined
  }
  return cur
}

/** A copy of `root` with `value` at `path` (the nodes on the way are copied, the rest is shared). */
export function setAt<T>(root: T, path: Path, value: unknown): T {
  if (path.length === 0) return value as T
  const [step, ...rest] = path
  if (Array.isArray(root)) {
    const next = [...root]
    next[step as number] = setAt(root[step as number], rest, value)
    return next as T
  }
  const base: Node = isNode(root) ? root : {}
  return { ...base, [step]: setAt(base[step as string], rest, value) } as T
}

export const updateAt = <T>(root: T, path: Path, change: (current: unknown) => unknown): T => setAt(root, path, change(getAt(root, path)))

const listAt = (root: unknown, list: Path): unknown[] => {
  const found = getAt(root, list)
  return Array.isArray(found) ? found : []
}

export const appendAt = <T>(root: T, list: Path, node: unknown): T => setAt(root, list, [...listAt(root, list), node])
export const removeFrom = <T>(root: T, list: Path, index: number): T => setAt(root, list, listAt(root, list).filter((_, i) => i !== index))

export function moveIn<T>(root: T, list: Path, index: number, delta: -1 | 1): T {
  const items = [...listAt(root, list)]
  const target = index + delta
  if (target < 0 || target >= items.length) return root
  ;[items[index], items[target]] = [items[target], items[index]]
  return setAt(root, list, items)
}

const PROTOTYPE_NAMES: ReadonlySet<string> = new Set(['constructor', 'prototype'])

/**
 * A key (`^[a-z][a-z0-9_]{0,39}$`, no `__`) built from a label and made unique among `taken`. `global` keys (items, tables,
 * rows) also avoid the names the application owns; scoped ones (columns, options, categories...) only the prototype names.
 */
export function slugKey(label: string, taken: ReadonlySet<string>, global = true, extraReserved: readonly string[] = []): string {
  const base =
    label
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/^[0-9]+/, '')
      .replace(/^_+/, '')
      .slice(0, 34)
      .replace(/_+$/, '') || 'nuevo'
  const free = (key: string) => !taken.has(key) && !PROTOTYPE_NAMES.has(key) && !extraReserved.includes(key) && !(global && RESERVED_KEYS.has(key))
  if (free(base)) return base
  for (let n = 2; ; n++) {
    const key = `${base}_${n}`
    if (free(key)) return key
  }
}

const keysOf = (list: unknown): string[] => (Array.isArray(list) ? list.flatMap((n) => (isNode(n) && typeof n.key === 'string' ? [n.key] : [])) : [])
const nodesOf = (list: unknown): Node[] => (Array.isArray(list) ? list.filter(isNode) : [])

export interface KeySpaces {
  /** Items, tables and the rows of stat, capacidades and monedas tables share one namespace (they are `data` keys). */
  global: Set<string>
  categories: Set<string>
  sections: Set<string>
}

/** Every key the draft already uses, by namespace. */
export function keySpaces(draft: unknown): KeySpaces {
  const spaces: KeySpaces = { global: new Set(), categories: new Set(), sections: new Set() }
  for (const category of nodesOf(isNode(draft) ? draft.categories : undefined)) {
    keysOf([category]).forEach((k) => spaces.categories.add(k))
    for (const section of nodesOf(category.sections)) {
      keysOf([section]).forEach((k) => spaces.sections.add(k))
      for (const item of nodesOf(section.items)) {
        keysOf([item]).forEach((k) => spaces.global.add(k))
        keysOf(item.rows).forEach((k) => spaces.global.add(k))
      }
    }
  }
  return spaces
}
