export type DataErrorKind =
  | 'permission' // RLS / privilege denial (42501)
  | 'not_found' // no row (or not visible)
  | 'conflict' // concurrent edit or unique violation
  | 'validation' // constraint / input violation
  | 'business' // RPC raise exception (P0001); see `reason`
  | 'auth' // not signed in / expired session
  | 'written_not_visible' // a write returned no row (e.g. RLS hides the new row); it may have been applied: re-read before retrying
  | 'unknown'

/**
 * Stable reason codes raised on purpose by our SQL functions and triggers. They can arrive with
 * SQLSTATE P0001 (business), 42501 (permission) or 23514 (validation), so `kind` stays tied to the
 * SQLSTATE and `reason` tells them apart.
 */
export const KNOWN_REASONS = [
  'invite_not_found',
  'invite_expired',
  'invite_exhausted',
  'character_already_claimed',
  'character_already_owned',
  'character_already_has_pending_invite',
  'reserved_slug',
  'campaign_limit_reached',
  'not_a_member',
  'character_required',
  'not_your_character',
  'already_played_today',
  'dm_only',
  'insufficient_pot',
  'character_not_found',
] as const

export type DataErrorReason = (typeof KNOWN_REASONS)[number]

export interface PostgrestLikeError {
  message: string
  code?: string
  details?: string | null
  hint?: string | null
}

export class DataError extends Error {
  readonly kind: DataErrorKind
  readonly code?: string
  readonly details?: string | null
  readonly hint?: string | null
  /** Set only for the whitelisted reason codes above. */
  readonly reason?: DataErrorReason

  constructor(kind: DataErrorKind, message: string, source?: Partial<PostgrestLikeError>, reason?: DataErrorReason) {
    super(message)
    this.name = 'DataError'
    this.kind = kind
    this.code = source?.code
    this.details = source?.details
    this.hint = source?.hint
    this.reason = reason
  }
}

/** The row changed between read and write (optimistic version check failed). */
export class ConflictError extends DataError {
  constructor(message = 'The record was modified by someone else; reload and retry') {
    super('conflict', message)
    this.name = 'ConflictError'
  }
}

function kindOf(code: string | undefined): DataErrorKind {
  if (!code) return 'unknown'
  if (code === '42501') return 'permission'
  if (code === 'PGRST116') return 'not_found'
  if (code === '23505') return 'conflict'
  if (code === '28000' || code.startsWith('PGRST30')) return 'auth'
  if (code === 'P0001') return 'business'
  if (code.startsWith('23') || code.startsWith('22') || code === '54000') return 'validation'
  return 'unknown'
}

const REASON_CODES = new Set(['P0001', '42501', '23514'])
const reasons = new Set<string>(KNOWN_REASONS)

export function toDataError(error: PostgrestLikeError): DataError {
  const reason =
    error.code && REASON_CODES.has(error.code) && reasons.has(error.message)
      ? (error.message as DataErrorReason)
      : undefined
  return new DataError(kindOf(error.code), error.message, error, reason)
}

/** Returns `data` or throws a typed DataError. Errors are never swallowed. */
export function unwrap<T>(res: { data: T; error: PostgrestLikeError | null }): T {
  if (res.error) throw toDataError(res.error)
  return res.data
}

/**
 * Like `unwrap`, for INSERT/UPSERT/UPDATE ... select().single(). PGRST116 there means the write
 * ran but no row came back, which must not be reported as `not_found` (a retry could duplicate it).
 */
export function unwrapWrite<T>(res: { data: T; error: PostgrestLikeError | null }): T {
  if (res.error?.code === 'PGRST116') {
    throw new DataError(
      'written_not_visible',
      'The write returned no row (it may have been applied but is not visible to you); re-read before retrying',
      res.error,
    )
  }
  return unwrap(res)
}
