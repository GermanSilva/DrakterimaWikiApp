import type { Db } from '../data'
import { callbackUrl } from './authConfig'
import { AuthFlowError, normalizeEmail, toAuthFlowError } from './authErrors'

/** Sends a magic link (creating the account on first use). Throws AuthFlowError. */
export async function requestMagicLink(client: Db, rawEmail: string, origin?: string): Promise<void> {
  const email = normalizeEmail(rawEmail)
  let result
  try {
    result = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl(origin), shouldCreateUser: true },
    })
  } catch (e) {
    throw toAuthFlowError(e)
  }
  if (result.error) throw toAuthFlowError(result.error)
}

export interface GoogleSignInDeps {
  origin?: string
  /** Probe + redirect seams (tests). */
  fetchFn?: typeof fetch
  navigate?: (url: string) => void
}

/**
 * Starts Google OAuth. supabase-js only BUILDS the authorize URL (no request), so a disabled
 * provider would otherwise strand the user on a raw JSON error page. We ask for the URL without
 * redirecting, probe it once without following the redirect, and only navigate when the server
 * did not answer with an error. If the probe itself cannot run (network/CORS), we navigate anyway.
 */
export async function startGoogleSignIn(client: Db, deps: GoogleSignInDeps = {}): Promise<void> {
  const { origin, fetchFn = fetch, navigate = (url: string) => window.location.assign(url) } = deps
  let url: string | null | undefined
  try {
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl(origin), skipBrowserRedirect: true },
    })
    if (error) throw error
    url = data?.url
  } catch (e) {
    throw toAuthFlowError(e)
  }
  if (!url || !/^https?:\/\//i.test(url)) throw new AuthFlowError('unknown')

  try {
    const res = await fetchFn(url, { redirect: 'manual', credentials: 'omit' })
    // A working provider answers 302 (opaque redirect, status 0); an error answers 4xx/5xx.
    if (res.type !== 'opaqueredirect' && res.status >= 400) {
      let message = ''
      try {
        const body = (await res.json()) as { msg?: unknown; error_description?: unknown }
        message = String(body.msg ?? body.error_description ?? '')
      } catch {
        // body is not JSON; classify by status only
      }
      throw toAuthFlowError({ status: res.status, message })
    }
  } catch (e) {
    if (e instanceof AuthFlowError) throw e
    // Probe unavailable: let the browser try the real redirect.
  }
  navigate(url)
}
