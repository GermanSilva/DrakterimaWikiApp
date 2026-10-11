/** Path the identity provider / magic link redirects back to. Must match supabase/config.toml. */
export const AUTH_CALLBACK_PATH = '/auth/callback'

/**
 * Whether the "Continuar con Google" button is offered. On unless VITE_AUTH_GOOGLE_ENABLED is
 * literally 'false' (Google stays disabled in the local stack until credentials exist).
 */
// Reads the single key, never the whole import.meta.env object: Vite would inline EVERY VITE_* value
// (including the legacy app's passwords) into whichever chunk references the object itself.
export function isGoogleEnabled(
  env: Record<string, unknown> = { VITE_AUTH_GOOGLE_ENABLED: import.meta.env.VITE_AUTH_GOOGLE_ENABLED },
): boolean {
  return env.VITE_AUTH_GOOGLE_ENABLED !== 'false'
}

/**
 * Cloudflare Turnstile site key (public by design). Null when unset or blank: no widget is shown and
 * no captcha token is sent (local dev, or a project without captcha). The matching SECRET key lives
 * only in Supabase Auth settings, never in this app.
 */
export function turnstileSiteKey(
  env: Record<string, unknown> = { VITE_TURNSTILE_SITE_KEY: import.meta.env.VITE_TURNSTILE_SITE_KEY },
): string | null {
  const value = env.VITE_TURNSTILE_SITE_KEY
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/**
 * Absolute callback URL on THIS page's origin. It is never derived from user input or from the
 * current URL's query, so it cannot be steered to another site (Supabase also allow-lists it).
 */
export function callbackUrl(origin: string = window.location.origin): string {
  return `${origin}${AUTH_CALLBACK_PATH}`
}
