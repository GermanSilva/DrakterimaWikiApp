import { DataError, unwrap } from './errors'

/** Rows requested per page. The server may cap a response lower (`max_rows`), so it is not a stop signal. */
export const PAGE_SIZE = 1000
/** Safety cap: a list larger than this is a bug or abuse; fail instead of loading it all. */
export const MAX_LIST_ROWS = 20000

export interface PagedListOptions {
  pageSize?: number
  maxRows?: number
}

/**
 * Loads every page of a query. `makeQuery` must return a FRESH, deterministically ordered query
 * builder on each call (the builder is consumed by `.range()` and awaited).
 *
 * Stops only on an EMPTY page: a short page does not prove the end, because the server's
 * `max_rows` may be lower than `pageSize`. Throws as soon as more than `maxRows` rows exist, so
 * the data is never silently truncated.
 */
export async function pagedList<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped dynamic builder, see loose.ts
  makeQuery: () => any,
  label: string,
  { pageSize = PAGE_SIZE, maxRows = MAX_LIST_ROWS }: PagedListOptions = {},
): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from = all.length) {
    const page = unwrap<T[] | null>(await makeQuery().range(from, from + pageSize - 1)) ?? []
    if (page.length === 0) return all
    all.push(...page)
    if (all.length > maxRows) {
      throw new DataError('validation', `${label}: more than ${maxRows} rows exist, refusing to load them all`)
    }
  }
}
