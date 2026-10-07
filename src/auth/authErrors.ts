export type AuthFlowErrorKind = 'invalid_email' | 'rate_limited' | 'provider_disabled' | 'network' | 'unknown'

const MESSAGES: Record<AuthFlowErrorKind, string> = {
  invalid_email: 'Ingresá un email válido.',
  rate_limited: 'Pediste demasiados links en poco tiempo. Esperá unos minutos y volvé a intentar.',
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

/** Maps a supabase-js auth error (or anything thrown) to an AuthFlowError. Never leaks raw server text. */
export function toAuthFlowError(error: unknown): AuthFlowError {
  if (error instanceof AuthFlowError) return error
  const e = (error ?? {}) as ErrorLike
  const message = typeof e.message === 'string' ? e.message : ''
  const code = typeof e.code === 'string' ? e.code : ''
  if (e.status === 429 || /rate_limit/i.test(code) || /rate limit|too many/i.test(message)) {
    return new AuthFlowError('rate_limited', { cause: error })
  }
  if (code === 'email_address_invalid' || (e.status === 422 && code !== 'signup_disabled')) {
    return new AuthFlowError('invalid_email', { cause: error })
  }
  if (/provider.*(not enabled|disabled)|unsupported provider/i.test(message) || code === 'provider_disabled') {
    return new AuthFlowError('provider_disabled', { cause: error })
  }
  if (e.name === 'AuthRetryableFetchError' || e.name === 'TypeError' || /failed to fetch|network/i.test(message)) {
    return new AuthFlowError('network', { cause: error })
  }
  return new AuthFlowError('unknown', { cause: error })
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Trims and lowercases; throws AuthFlowError('invalid_email') when it does not look like an email. */
export function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase()
  if (email.length > 254 || !EMAIL_RE.test(email)) throw new AuthFlowError('invalid_email')
  return email
}
