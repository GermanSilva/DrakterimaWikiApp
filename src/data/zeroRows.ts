import { DataError, unwrap } from './errors'
import { fromTable } from './loose'
import type { Db } from './types'

/**
 * Explains why an UPDATE/DELETE affected zero rows: if the row can be read it exists, so the
 * write was denied (permission); otherwise it is missing or hidden by RLS (not_found).
 * `match` identifies the row; its first key is selected (must be a readable column).
 */
export async function throwZeroRows(
  client: Db,
  table: string,
  match: Record<string, unknown>,
  what: string,
): Promise<never> {
  const key = Object.keys(match)[0]
  const row = unwrap<unknown>(await fromTable(client, table).select(key).match(match).maybeSingle())
  if (row) throw new DataError('permission', `${what}: write affected no rows (not permitted)`)
  throw new DataError('not_found', `${what}: not found (missing or not visible)`)
}
