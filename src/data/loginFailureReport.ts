import type { Db } from './types'

export type LoginFailureKind = 'google_disabled' | 'google_error'

export interface LoginFailureReportInput {
  kind: LoginFailureKind
  errorKind?: string
  message?: string
  contact?: string
  /** Pathname only (no query), starting with "/". */
  path?: string
  /** Honeypot: always empty for real people. */
  website?: string
}

export type LoginFailureReportResult = 'ok' | 'rate_limited' | 'invalid_input' | 'unavailable'

/**
 * Reports a login failure through the `report-login-failure` Edge Function (works signed out).
 * Never throws and never surfaces server text: anything unexpected is `unavailable`.
 */
export async function reportLoginFailure(client: Db, input: LoginFailureReportInput): Promise<LoginFailureReportResult> {
  try {
    const { error } = await client.functions.invoke('report-login-failure', { body: input })
    if (!error) return 'ok'
    const status = (error as { context?: { status?: unknown } }).context?.status
    if (status === 400) return 'invalid_input'
    if (status === 429) return 'rate_limited'
    return 'unavailable'
  } catch {
    return 'unavailable'
  }
}
