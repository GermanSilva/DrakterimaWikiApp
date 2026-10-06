import { DataError, unwrap } from './errors'

/** PostgREST caps a response at `max_rows` (1000 by default). */
export const PAGE_SIZE = 1000
/** Safety cap: a list this large is a bug or abuse; fail instead of loading it all. */
export const MAX_LIST_ROWS = 20000

/**
 * Loads every page of a query. `makeQuery` must return a FRESH, deterministically ordered query
 * builder on each call (the builder is consumed by `.range()` and awaited).
 */
export async function pagedList<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped dynamic builder, see loose.ts
  makeQuery: () => any,
  label: string,
): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = unwrap<T[]>(await makeQuery().range(from, from + PAGE_SIZE - 1))
    all.push(...page)
    if (page.length < PAGE_SIZE) return all
    if (all.length >= MAX_LIST_ROWS) {
      throw new DataError('validation', `${label}: more than ${MAX_LIST_ROWS} rows, refusing to load them all`)
    }
  }
}
