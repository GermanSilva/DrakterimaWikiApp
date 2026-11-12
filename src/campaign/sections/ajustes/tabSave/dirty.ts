const isPlain = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * How many leaf values differ between two drafts (the "N cambios sin guardar" of a block). Objects are compared key by
 * key, arrays by position (extra or missing entries count one each), everything else by value.
 */
export function countChanges(before: unknown, after: unknown): number {
  if (Array.isArray(before) && Array.isArray(after)) {
    let count = 0
    for (let i = 0; i < Math.max(before.length, after.length); i++) count += i < before.length && i < after.length ? countChanges(before[i], after[i]) : 1
    return count
  }
  if (isPlain(before) && isPlain(after)) {
    let count = 0
    for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) count += countChanges(before[name], after[name])
    return count
  }
  return Object.is(before, after) ? 0 : 1
}

/**
 * Same for a list of rows with a stable `uid`: an added or removed row counts one, an edited row counts its changed fields,
 * and a list that only changed order counts one.
 */
export function countRowChanges<T extends { uid: number }>(before: readonly T[], after: readonly T[]): number {
  const was = new Map(before.map((row) => [row.uid, row]))
  const now = new Map(after.map((row) => [row.uid, row]))
  let count = 0
  for (const [uid, row] of now) count += was.has(uid) ? countChanges(was.get(uid), row) : 1
  for (const uid of was.keys()) if (!now.has(uid)) count += 1
  const order = (list: Map<number, T>, other: Map<number, T>) => [...list.keys()].filter((uid) => other.has(uid)).join(',')
  return count + (order(was, now) === order(now, was) ? 0 : 1)
}
