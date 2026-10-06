import { execSync } from 'node:child_process'
import type { GlobalSetupContext } from 'vitest/node'

export interface LocalSupabase {
  url: string
  anonKey: string
  /** Local stack only. Used exclusively by test setup/teardown to create and delete throwaway users. */
  serviceKey: string
}

declare module 'vitest' {
  export interface ProvidedContext {
    supabase: LocalSupabase
  }
}

/**
 * Reads the local stack's URL and keys from `supabase status -o json` at runtime. Nothing is
 * written to disk or committed; the values are handed to the tests through vitest's `provide`.
 */
export default function setup({ provide }: GlobalSetupContext) {
  let out: string
  try {
    out = execSync('supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    throw new Error('Cannot read the local Supabase stack. Run `supabase start` first (Docker must be running).')
  }
  const status = JSON.parse(out.slice(out.indexOf('{'))) as Record<string, string>
  const { API_URL: url, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceKey } = status
  if (!url || !anonKey || !serviceKey) throw new Error('`supabase status -o json` did not return API_URL / ANON_KEY / SERVICE_ROLE_KEY')
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url)) {
    throw new Error(`Refusing to run integration tests against a non-local API: ${url}`)
  }
  provide('supabase', { url, anonKey, serviceKey })
}
