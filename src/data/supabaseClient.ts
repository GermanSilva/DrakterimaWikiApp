import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import type { Db } from './types'

let instance: Db | null = null

/**
 * PKCE: magic links and OAuth return a one-time `?code=` that only the browser that started the
 * sign-in can exchange (it holds the code verifier), so a link opened elsewhere, or a crafted
 * `#access_token=` URL, cannot sign anyone in. `detectSessionInUrl` is off: src/auth's
 * completeAuthCallback is the single owner of the callback URL (explicit exchange + URL cleanup).
 * `auth` options can be overridden (integration tests inject an in-memory storage).
 */
export function createSupabaseClient(url: string, anonKey: string, auth: Record<string, unknown> = {}): Db {
  return createClient<Database>(url, anonKey, { auth: { flowType: 'pkce', detectSessionInUrl: false, ...auth } })
}

/**
 * Lazily creates the shared typed client from VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, so
 * importing data-layer modules (e.g. in tests) never needs the environment. The anon key is
 * public by design; authorization is enforced by RLS. A service-role key must never be used here.
 */
export function getSupabase(): Db {
  if (!instance) {
    const url = import.meta.env.VITE_SUPABASE_URL
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    if (!url || !anonKey) {
      throw new Error(
        'Missing Supabase configuration: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see src/data/README.md)',
      )
    }
    instance = createSupabaseClient(url, anonKey)
  }
  return instance
}

/** Injects (or clears, with null) the shared client. Used by tests and by the auth layer. */
export function setSupabaseClient(client: Db | null): void {
  instance = client
}
