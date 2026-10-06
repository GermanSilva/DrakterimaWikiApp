import { DataError, unwrap } from './errors'
import { fromTable } from './loose'
import type { Db } from './types'

/**
 * Explains why an UPDATE/DELETE affected zero rows: if a row matching `match` can be read it
 * exists, so the write was denied (permission); otherwise it is missing or hidden by RLS
 * (not_found). `match` must be a non-empty set of column filters (a key-like identification of the
 * row); the first key is selected, so it must be a column the caller may SELECT (never the hidden
 * visibility column: that would turn every diagnosis into a misleading 42501). Several matching rows are fine:
 * only existence matters (`limit(1)`).
 */
export async function throwZeroRows(
  client: Db,
  table: string,
  match: Record<string, unknown>,
  what: string,
): Promise<never> {
  const keys = Object.keys(match)
  if (keys.length === 0) {
    throw new DataError('validation', `${what}: refusing to explain a zero-row write without a row filter`)
  }
  const rows = unwrap<unknown[] | null>(await fromTable(client, table).select(keys[0]).match(match).limit(1)) ?? []
  if (rows.length > 0) throw new DataError('permission', `${what}: write affected no rows (not permitted)`)
  throw new DataError('not_found', `${what}: not found (missing or not visible)`)
}
