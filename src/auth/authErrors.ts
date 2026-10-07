export type AuthFlowErrorKind =
  | 'invalid_email'
  | 'rate_limited'
  | 'oauth_rate_limited'
  | 'provider_disabled'
  | 'network'
  | 'unknown'

const MESSAGES: Record<AuthFlowErrorKind, string> = {
  invalid_email: 'Ingresá un email válido.',
  rate_limited: 'Pediste demasiados links en poco tiempo. Esperá unos minutos y volvé a intentar.',
  oauth_rate_limited: 'Hubo demasiados intentos de inicio de sesión. Esperá unos minutos y volvé a intentar.',
  provider_disabled: 'El inicio de sesión con Google no está disponible por ahora. Usá el link por email.',
  network: 'No pudimos conectarnos. Revisá tu conexión y volvé a intentar.',
  unknown: 'No pudimos iniciar sesión. Volvé a intentar en unos minutos.',
}

/** Typed, user-presentable authentication failure (message is Spanish UI copy). */
export class AuthFlowError extends Error {
  readonly kind: AuthFlowErrorKind

  constructor(kind: AuthFlowErrorKind, options?: { cause?: unknown }) {
    super(MESSAGES[kind], options)
    this.name = 'AuthFlowError'
    this.kind = kind
  }
}

interface ErrorLike {
  message?: unknown
  status?: unknown
  code?: unknown
  name?: unknown
}

export const asLike = (error: unknown): ErrorLike => (error ?? {}) as ErrorLike
export const messageOf = (e: ErrorLike) => (typeof e.message === 'string' ? e.message : '')
export const codeOf = (e: ErrorLike) => (typeof e.code === 'string' ? e.code : '')

/** The ONE rate-limit predicate (HTTP 429, a *rate_limit* code, or a rate-limit message). */
export function isRateLimited(error: unknown): boolean {
  const e = asLike(error)
  return e.status === 429 || /rate_limit/i.test(codeOf(e)) || /rate limit|too many/i.test(messageOf(e))
}

/**
 * True only for failures that originate in fetch itself (offline, DNS, CORS): supabase-js'
 * AuthRetryableFetchError, or a TypeError carrying a browser fetch message (Chrome 'Failed to
 * fetch', Firefox 'NetworkError ...', Safari 'Load failed'). Any other TypeError is a bug, not
 * a network problem. An aborted request (AbortError) is deliberately NOT classified here: callers that
 * abort on purpose (the Google probe timeout) handle it themselves.
 */
export function isNetworkFailure(error: unknown): boolean {
  const e = asLike(error)
  if (e.name === 'AuthRetryableFetchError') return true
  return e.name === 'TypeError' && /failed to fetch|networkerror|load failed|network request failed/i.test(messageOf(e))
}

/** Name, status and code only: safe to log (never the message, URL or tokens). */
export function sanitizeForLog(error: unknown): { name?: string; status?: number; code?: string } {
  const e = asLike(error)
  return {
    name: typeof e.name === 'string' ? e.name : undefined,
    status: typeof e.status === 'number' ? e.status : undefined,
    code: typeof e.code === 'string' ? e.code : undefined,
  }
}

const isProviderDisabled = (e: ErrorLike) =>
  /provider.*(not enabled|disabled)|unsupported provider/i.test(messageOf(e)) || codeOf(e) === 'provider_disabled'

/**
 * Maps a supabase-js error from the MAGIC LINK request (signInWithOtp) to an AuthFlowError. Never
 * leaks raw server text. GoTrue answers 422 for several unrelated reasons (signup_disabled,
 * email_provider_disabled, ...), so only the codes that are about the address itself
 * (email_address_invalid, validation_failed) mean invalid_email; any other 422 is unknown.
 */
export function toAuthFlowError(error: unknown): AuthFlowError {
  if (error instanceof AuthFlowError) return error
  const e = asLike(error)
  const code = codeOf(e)
  if (isRateLimited(error)) return new AuthFlowError('rate_limited', { cause: error })
  if (code === 'email_address_invalid' || (e.status === 422 && code === 'validation_failed')) {
    return new AuthFlowError('invalid_email', { cause: error })
  }
  if (isProviderDisabled(e)) return new AuthFlowError('provider_disabled', { cause: error })
  if (isNetworkFailure(error)) return new AuthFlowError('network', { cause: error })
  return new AuthFlowError('unknown', { cause: error })
}

/**
 * Maps an error from the OAUTH start (signInWithOAuth / the authorize probe). Unlike the magic
 * link request, a 422 here is NOT about an email address, so it is never invalid_email.
 */
export function toOAuthFlowError(error: unknown): AuthFlowError {
  if (error instanceof AuthFlowError) return error
  if (isRateLimited(error)) return new AuthFlowError('oauth_rate_limited', { cause: error })
  const e = asLike(error)
  if (isProviderDisabled(e)) return new AuthFlowError('provider_disabled', { cause: error })
  if (isNetworkFailure(error)) return new AuthFlowError('network', { cause: error })
  return new AuthFlowError('unknown', { cause: error })
}

/** RFC 5321 maximum length of a forward-path (email address). */
export const EMAIL_MAX_LENGTH = 254
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Trims and lowercases; throws AuthFlowError('invalid_email') when it does not look like an email. */
export function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase()
  if (email.length > EMAIL_MAX_LENGTH || !EMAIL_RE.test(email)) throw new AuthFlowError('invalid_email')
  return email
}
