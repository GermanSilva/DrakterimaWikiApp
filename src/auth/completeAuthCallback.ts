import type { Db } from '../data'

export type CallbackResult = { ok: true } | { ok: false; message: string }

const EXPIRED = 'El link es inválido o ya venció. Pedí uno nuevo.'
const WRONG_BROWSER = 'No pudimos completar el inicio de sesión. Abrí el link en el mismo navegador donde lo pediste, o pedí uno nuevo.'
const GENERIC = 'No pudimos completar el inicio de sesión. Pedí un link nuevo.'

function messageForError(params: URLSearchParams): string {
  const code = params.get('error_code') ?? ''
  const desc = params.get('error_description') ?? ''
  if (code === 'otp_expired' || /expired|invalid/i.test(desc)) return EXPIRED
  if (params.get('error') === 'access_denied') return 'Cancelaste el inicio de sesión.'
  return GENERIC
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
 *  - server error text is never shown; the UI uses fixed messages.
 */
export async function completeAuthCallback(
  client: Db,
  location: Pick<Location, 'href' | 'pathname'> = window.location,
  history: Pick<History, 'replaceState' | 'state'> = window.history,
): Promise<CallbackResult> {
  const url = new URL(location.href)
  const query = url.searchParams
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''))
  history.replaceState(history.state, '', location.pathname)

  if (fragment.has('access_token') || fragment.has('refresh_token')) {
    return { ok: false, message: GENERIC }
  }
  for (const params of [query, fragment]) {
    if (params.get('error') || params.get('error_description') || params.get('error_code')) {
      return { ok: false, message: messageForError(params) }
    }
  }

  const code = query.get('code')
  if (!code) return { ok: false, message: EXPIRED }

  try {
    const { data, error } = await client.auth.exchangeCodeForSession(code)
    if (error || !data?.session) return { ok: false, message: WRONG_BROWSER }
    return { ok: true }
  } catch {
    return { ok: false, message: GENERIC }
  }
}
