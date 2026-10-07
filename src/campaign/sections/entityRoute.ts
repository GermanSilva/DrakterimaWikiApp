export type EntityRoute =
  | { kind: 'list' }
  | { kind: 'detail'; id: number }
  /** A segment that cannot be an entity id: shown as "not found", no request is made. */
  | { kind: 'invalid' }

/** Largest id we accept; far below Number.MAX_SAFE_INTEGER so the round trip through Number is exact. */
const MAX_ID_DIGITS = 15

/**
 * `/c/:slug/:section/:id` -> what the page shows. Only a plain run of digits is an id: `12abc`, `-1`,
 * `1.5`, `0x10`, `1e3` and the empty string are all `invalid`, so a malformed URL never reaches a query.
 */
export function parseEntityRoute(id: string | undefined): EntityRoute {
  if (id === undefined) return { kind: 'list' }
  if (!new RegExp(`^[0-9]{1,${MAX_ID_DIGITS}}$`).test(id)) return { kind: 'invalid' }
  const parsed = Number(id)
  return parsed > 0 ? { kind: 'detail', id: parsed } : { kind: 'invalid' }
}
