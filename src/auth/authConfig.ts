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
 * Absolute callback URL on THIS page's origin. It is never derived from user input or from the
 * current URL's query, so it cannot be steered to another site (Supabase also allow-lists it).
 */
export function callbackUrl(origin: string = window.location.origin): string {
  return `${origin}${AUTH_CALLBACK_PATH}`
}
