/**
 * A scratch copy of a character and its link that effects are applied to, shared by the executor and the undo planner.
 * The inputs are never mutated: arrays are copied before a row changes, and `patch()` reports only what was touched.
 */
export type AppliedTarget =
  /** `key` is the data key written (a role is already resolved to its field). */
  | { type: 'field'; key: string }
  /** The row is found again by `match` (the column equals the value) wherever it sits. */
  | { type: 'row'; table: string; match: { column: string; value: number }; column: string }
  | { type: 'state'; column: string }

export interface Patch {
  pj: Record<string, unknown>
  linkState?: Record<string, unknown>
}

const own = (record: Record<string, unknown>, key: string): unknown => (Object.hasOwn(record, key) ? record[key] : undefined)
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const finiteNumber = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)

export interface Working {
  pj: Record<string, unknown>
  state: Record<string, unknown>
  touchedPj: Set<string>
  touchedState: Set<string>
}

export const startWorking = (pj: Record<string, unknown>, state: Record<string, unknown>): Working => ({ pj: { ...pj }, state: { ...state }, touchedPj: new Set(), touchedState: new Set() })

/** Index in the stored array of the first row whose `column` is exactly `value`; -1 when there is none. */
export function findRow(pj: Record<string, unknown>, table: string, column: string, value: number): number {
  const rows = own(pj, table)
  return Array.isArray(rows) ? rows.findIndex((row) => isRecord(row) && own(row, column) === value) : -1
}

/** `value` is undefined when nothing is stored; `invalid` carries a stored value that is not a number (hand-edited data, a number as text). */
export type Read = { found: false } | { found: true; value: number | undefined; invalid?: { stored: unknown } }

const readValue = (raw: unknown): Read => {
  const value = finiteNumber(raw)
  if (value === undefined && raw !== undefined && raw !== null && raw !== '') return { found: true, value: undefined, invalid: { stored: raw } }
  return { found: true, value }
}

/** The number a target holds now; `value` is undefined when nothing is stored, and a stored non-number is reported as `invalid`. */
export function readTarget(work: Pick<Working, 'pj' | 'state'>, target: AppliedTarget): Read {
  if (target.type === 'field') return readValue(own(work.pj, target.key))
  if (target.type === 'state') return readValue(own(work.state, target.column))
  const at = findRow(work.pj, target.table, target.match.column, target.match.value)
  if (at < 0) return { found: false }
  return readValue(own((work.pj[target.table] as Record<string, unknown>[])[at], target.column))
}

/** Writes a number into the scratch copy; false when the row of a row target is not there. */
export function writeTarget(work: Working, target: AppliedTarget, value: number): boolean {
  if (target.type === 'field') {
    work.pj[target.key] = value
    work.touchedPj.add(target.key)
    return true
  }
  if (target.type === 'state') {
    work.state[target.column] = value
    work.touchedState.add(target.column)
    return true
  }
  const at = findRow(work.pj, target.table, target.match.column, target.match.value)
  if (at < 0) return false
  const rows = [...(work.pj[target.table] as unknown[])]
  rows[at] = { ...(rows[at] as Record<string, unknown>), [target.column]: value }
  work.pj[target.table] = rows
  work.touchedPj.add(target.table)
  return true
}

export function patchOf(work: Working): Patch {
  const pj: Record<string, unknown> = {}
  for (const key of work.touchedPj) pj[key] = work.pj[key]
  if (work.touchedState.size === 0) return { pj }
  const linkState: Record<string, unknown> = {}
  for (const column of work.touchedState) linkState[column] = work.state[column]
  return { pj, linkState }
}
