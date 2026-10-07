import type { Db } from '../data'
import { isNetworkFailure, sanitizeForLog } from './authErrors'

export type CallbackResult = { ok: true } | { ok: false; message: string }

export const CALLBACK_EXPIRED = 'El link es inválido o ya venció. Pedí uno nuevo.'
export const CALLBACK_WRONG_BROWSER =
  'No pudimos completar el inicio de sesión. Abrí el link en el mismo navegador donde lo pediste, o pedí uno nuevo.'
export const CALLBACK_NETWORK = 'No pudimos conectarnos para completar el inicio de sesión. Revisá tu conexión y pedí un link nuevo.'
export const CALLBACK_CANCELLED = 'Cancelaste el inicio de sesión.'
export const CALLBACK_RATE_LIMITED = 'Hubo demasiados intentos. Esperá unos minutos y pedí un link nuevo.'
export const CALLBACK_GENERIC = 'No pudimos completar el inicio de sesión. Pedí un link nuevo.'

function messageForProviderError(params: URLSearchParams): string {
  const code = params.get('error_code') ?? ''
  const desc = params.get('error_description') ?? ''
  if (code === 'otp_expired') return CALLBACK_EXPIRED
  if (params.get('error') === 'access_denied') {
    // GoTrue reports expired/invalid links as access_denied too; a user cancelling has neither word.
    return /expired|invalid/i.test(desc) ? CALLBACK_EXPIRED : CALLBACK_CANCELLED
  }
  // Any other provider error (e.g. invalid_request "Unsupported provider") is not an expired link.
  return CALLBACK_GENERIC
}

function messageForExchangeError(error: unknown): string {
  const e = (error ?? {}) as { name?: unknown; status?: unknown; message?: unknown; code?: unknown }
  if (e.status === 429 || e.code === 'over_request_rate_limit') return CALLBACK_RATE_LIMITED
  if (isNetworkFailure(error) || (typeof e.status === 'number' && e.status >= 500)) return CALLBACK_NETWORK
  if (e.name === 'AuthPKCECodeVerifierMissingError' || /code verifier/i.test(String(e.message ?? ''))) {
    return CALLBACK_WRONG_BROWSER
  }
  return CALLBACK_EXPIRED // 400/401/403/404/422: invalid, expired or already used code
}

/**
 * Finishes a PKCE sign-in from the current URL. It is the single owner of the callback URL (the
 * client is created with detectSessionInUrl: false):
 *  - the query and fragment are wiped with history.replaceState BEFORE any await, so the code or a
 *    stray token never lingers in the address bar, history or Referer;
 *  - success is reported only when THIS code exchange returned a session (an already signed-in
 *    user does not make a bad link look valid);
 *  - a fragment carrying tokens (implicit-flow style, e.g. a crafted link) is rejected, never
 *    turned into a session;
 *  - exchange failures are classified (network/5xx, missing verifier, invalid/expired/used) and
 *    logged with name/status/code only; server error text is never shown or logged.
 */
export async function completeAuthCallback(
  client: Db,
  location: Pick<Location, 'href' | 'pathname'> = window.location,
  history: Pick<History, 'replaceState' | 'state'> = window.history,
): Promise<CallbackResult> {
  const url = new URL(location.href)
  const query = url.searchParams
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''))
  try {
    history.replaceState(history.state, '', location.pathname)
  } catch (e) {
    // Cannot wipe the URL: do not proceed to the exchange and leave the code behind silently.
    console.warn('auth callback: could not clean the URL', sanitizeForLog(e))
    return { ok: false, message: CALLBACK_GENERIC }
  }

  if (fragment.has('access_token') || fragment.has('refresh_token')) {
    return { ok: false, message: CALLBACK_GENERIC }
  }
  for (const params of [query, fragment]) {
    if (params.get('error') || params.get('error_description') || params.get('error_code')) {
      return { ok: false, message: messageForProviderError(params) }
    }
  }

  const code = query.get('code')
  if (!code) return { ok: false, message: CALLBACK_EXPIRED }

  try {
    const { data, error } = await client.auth.exchangeCodeForSession(code)
    if (error) {
      console.warn('auth callback: code exchange failed', sanitizeForLog(error))
      return { ok: false, message: messageForExchangeError(error) }
    }
    if (!data?.session) {
      console.warn('auth callback: code exchange returned no session')
      return { ok: false, message: CALLBACK_EXPIRED }
    }
    return { ok: true }
  } catch (e) {
    console.warn('auth callback: code exchange threw', sanitizeForLog(e))
    // A throw is not a server verdict on the code: only a fetch failure is classified, the rest is generic.
    return { ok: false, message: isNetworkFailure(e) ? CALLBACK_NETWORK : CALLBACK_GENERIC }
  }
}
