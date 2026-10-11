import type { Db } from '../data'
import { callbackUrl } from './authConfig'
import { AuthFlowError, normalizeEmail, toAuthFlowError, toOAuthFlowError } from './authErrors'

export interface MagicLinkOptions {
  captchaToken?: string
  /** Overrides the origin used to build the callback URL (tests). */
  origin?: string
}

/**
 * Sends a magic link (creating the account on first use). Throws AuthFlowError.
 * `captchaToken` (a single-use Turnstile token) is forwarded as `options.captchaToken` only when
 * given; without it the request is exactly what it was before captcha support.
 */
export async function requestMagicLink(
  client: Db,
  rawEmail: string,
  { captchaToken, origin }: MagicLinkOptions = {},
): Promise<void> {
  const email = normalizeEmail(rawEmail)
  let result
  try {
    result = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl(origin), shouldCreateUser: true, ...(captchaToken ? { captchaToken } : {}) },
    })
  } catch (e) {
    throw toAuthFlowError(e)
  }
  if (result.error) throw toAuthFlowError(result.error)
}

/** How long the authorize probe may take before we stop waiting and navigate anyway. */
export const PROBE_TIMEOUT_MS = 5000

export interface GoogleSignInDeps {
  origin?: string
  /** Probe + redirect seams (tests). */
  fetchFn?: typeof fetch
  navigate?: (url: string) => void
  probeTimeoutMs?: number
}

/**
 * Starts Google OAuth. supabase-js only BUILDS the authorize URL (no request), so a disabled
 * provider would otherwise strand the user on a raw JSON error page. We ask for the URL without
 * redirecting, probe it once without following the redirect (aborted after PROBE_TIMEOUT_MS), and
 * only navigate when the server did not answer with an error. If the probe cannot run or times
 * out (network, CORS, slow server), we navigate anyway.
 */
export async function startGoogleSignIn(client: Db, deps: GoogleSignInDeps = {}): Promise<void> {
  const {
    origin,
    fetchFn = fetch,
    navigate = (url: string) => window.location.assign(url),
    probeTimeoutMs = PROBE_TIMEOUT_MS,
  } = deps
  let url: string | null | undefined
  try {
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl(origin), skipBrowserRedirect: true },
    })
    if (error) throw error
    url = data?.url
  } catch (e) {
    throw toOAuthFlowError(e)
  }
  if (!url || !/^https?:\/\//i.test(url)) throw new AuthFlowError('unknown')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), probeTimeoutMs)
  try {
    const res = await fetchFn(url, { redirect: 'manual', credentials: 'omit', signal: controller.signal })
    // A working provider answers 302 (opaque redirect, status 0); an error answers 4xx/5xx.
    if (res.type !== 'opaqueredirect' && res.status >= 400) {
      let message = ''
      try {
        const body = (await res.json()) as { msg?: unknown; error_description?: unknown }
        message = String(body.msg ?? body.error_description ?? '')
      } catch {
        // body is not JSON; classify by status only
      }
      throw toOAuthFlowError({ status: res.status, message })
    }
  } catch (e) {
    if (e instanceof AuthFlowError) throw e
    // Probe unavailable or timed out: let the browser try the real redirect.
  } finally {
    clearTimeout(timer)
  }
  navigate(url)
}
