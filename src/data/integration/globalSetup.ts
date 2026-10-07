import { execSync } from 'node:child_process'
import type { GlobalSetupContext } from 'vitest/node'
import { assertLocal } from './assertLocal'

export interface LocalSupabase {
  url: string
  anonKey: string
  /** Local stack only. Used exclusively by test setup/teardown to create and delete throwaway users. */
  serviceKey: string
  /** Local Mailpit/Inbucket HTTP API (magic-link emails). */
  mailUrl: string
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
    out = execSync('supabase status -o json', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 30_000,
    })
  } catch (e) {
    const timedOut = (e as { code?: string }).code === 'ETIMEDOUT'
    throw new Error(
      timedOut
        ? '`supabase status` timed out after 30s. Is Docker running and the stack healthy?'
        : 'Cannot read the local Supabase stack. Install the Supabase CLI, run `supabase start` and make sure Docker is running.',
    )
  }
  const jsonStart = out.indexOf('{')
  if (jsonStart < 0) throw new Error('`supabase status -o json` printed no JSON. Is the local stack running (`supabase start`)?')
  let status: Record<string, string>
  try {
    status = JSON.parse(out.slice(jsonStart)) as Record<string, string>
  } catch {
    throw new Error('`supabase status -o json` printed invalid JSON. Is the local stack fully started?')
  }
  const { API_URL: url, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceKey } = status
  if (!url || !anonKey || !serviceKey) throw new Error('`supabase status -o json` did not return API_URL / ANON_KEY / SERVICE_ROLE_KEY')
  assertLocal('API', url)
  const mailUrl = status.MAILPIT_URL ?? status.INBUCKET_URL ?? 'http://127.0.0.1:54324'
  assertLocal('mail API', mailUrl)
  provide('supabase', { url, anonKey, serviceKey, mailUrl: mailUrl.replace(/\/$/, '') })
}
