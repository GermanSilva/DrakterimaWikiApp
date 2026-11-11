/** How many things differ between the saved template and the draft, for the "N cambios sin guardar" line. Editor-only properties (`_open`) do not count. */
import { isNode } from './draft'

type Named = { key: string }
const isNamed = (value: unknown): value is Named => isNode(value) && typeof value.key === 'string'
const allNamed = (list: unknown[]): boolean => list.every(isNamed)

/** Entries with a `key` are matched by it (added, removed, changed; a different order counts once); the rest by position. */
function listChanges(before: unknown[], after: unknown[]): number {
  if (allNamed(before) && allNamed(after)) {
    const was = new Map((before as Named[]).map((entry) => [entry.key, entry]))
    const now = new Map((after as Named[]).map((entry) => [entry.key, entry]))
    let count = 0
    for (const [name, entry] of now) count += was.has(name) ? changes(was.get(name), entry) : 1
    for (const name of was.keys()) if (!now.has(name)) count += 1
    const order = (list: Map<string, unknown>, other: Map<string, unknown>) => [...list.keys()].filter((name) => other.has(name)).join('\u0000')
    return count + (order(was, now) === order(now, was) ? 0 : 1)
  }
  let count = 0
  for (let i = 0; i < Math.max(before.length, after.length); i++) count += i < before.length && i < after.length ? changes(before[i], after[i]) : 1
  return count
}

export function changes(before: unknown, after: unknown): number {
  if (Array.isArray(before) && Array.isArray(after)) return listChanges(before, after)
  if (isNode(before) && isNode(after)) {
    const names = new Set([...Object.keys(before), ...Object.keys(after)].filter((name) => !name.startsWith('_')))
    let count = 0
    for (const name of names) {
      const was = before[name]
      const now = after[name]
      count += was !== undefined && now !== undefined ? changes(was, now) : was === now ? 0 : 1
    }
    return count
  }
  return JSON.stringify(before) === JSON.stringify(after) ? 0 : 1
}
