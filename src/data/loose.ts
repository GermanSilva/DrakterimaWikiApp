import type { Db } from './types'

/**
 * Query builder for a table chosen at runtime.
 *
 * supabase-js derives result types from literal table names and literal select strings. The
 * repositories here are generic over tables (and use column lists built at runtime), so the
 * builder is deliberately untyped at this single boundary; every repository casts the awaited
 * result to its own row type through `unwrap<T>()`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see doc comment above
export function fromTable(client: Db, table: string): any {
  return client.from(table as never)
}
