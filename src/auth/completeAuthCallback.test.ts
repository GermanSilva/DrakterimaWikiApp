import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CALLBACK_CANCELLED,
  CALLBACK_EXPIRED,
  CALLBACK_GENERIC,
  CALLBACK_NETWORK,
  CALLBACK_WRONG_BROWSER,
  completeAuthCallback,
} from './completeAuthCallback'
import { createFakeAuth, fakeSession } from './testing/fakeAuth'

const at = (suffix: string) => ({ href: `http://localhost/auth/callback${suffix}`, pathname: '/auth/callback' })
const stubHistory = (calls: string[]) =>
  ({ state: null, replaceState: () => void calls.push('replaceState') }) as unknown as History

let warn: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => warn.mockRestore())

async function exchangeFailing(error: unknown, throws = false) {
  const { client, auth } = createFakeAuth()
  if (throws) auth.exchangeCodeForSession.mockRejectedValueOnce(error)
  else auth.exchangeCodeForSession.mockResolvedValueOnce({ data: { session: null }, error })
  return completeAuthCallback(client, at('?code=c0de'), stubHistory([]))
}

describe('completeAuthCallback classification', () => {
  it('network: AuthRetryableFetchError, 5xx and a thrown fetch TypeError ask for a new link', async () => {
    expect(await exchangeFailing({ name: 'AuthRetryableFetchError', status: 0, message: 'x' })).toEqual({ ok: false, message: CALLBACK_NETWORK })
    expect(await exchangeFailing({ name: 'AuthApiError', status: 503, message: 'x' })).toEqual({ ok: false, message: CALLBACK_NETWORK })
    expect(await exchangeFailing(new TypeError('Failed to fetch'), true)).toEqual({ ok: false, message: CALLBACK_NETWORK })
    expect(CALLBACK_NETWORK).toMatch(/link nuevo/)
  })

  it('missing code verifier: open it in the same browser', async () => {
    expect(await exchangeFailing({ name: 'AuthPKCECodeVerifierMissingError', message: 'x' })).toEqual({ ok: false, message: CALLBACK_WRONG_BROWSER })
    expect(await exchangeFailing({ message: 'PKCE code verifier not found in storage' })).toEqual({ ok: false, message: CALLBACK_WRONG_BROWSER })
  })

  it('invalid, expired or used code: expired message', async () => {
    expect(await exchangeFailing({ name: 'AuthApiError', status: 400, message: 'invalid flow state' })).toEqual({ ok: false, message: CALLBACK_EXPIRED })
  })

  it('a non-network throw is generic; a response without session is expired', async () => {
    expect(await exchangeFailing(new TypeError("Cannot read properties of undefined (reading 'x')"), true)).toEqual({ ok: false, message: CALLBACK_GENERIC })
    const { client, auth } = createFakeAuth()
    auth.exchangeCodeForSession.mockResolvedValueOnce({ data: { session: null }, error: null })
    expect(await completeAuthCallback(client, at('?code=c'), stubHistory([]))).toEqual({ ok: false, message: CALLBACK_EXPIRED })
  })

  it('provider errors: access_denied is a cancellation, but otp_expired (also access_denied) is expired', async () => {
    const { client } = createFakeAuth()
    expect(await completeAuthCallback(client, at('?error=access_denied&error_description=User+denied+access'), stubHistory([]))).toEqual({
      ok: false,
      message: CALLBACK_CANCELLED,
    })
    expect(
      await completeAuthCallback(client, at('?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'), stubHistory([])),
    ).toEqual({ ok: false, message: CALLBACK_EXPIRED })
    expect(await completeAuthCallback(client, at('?error=server_error&error_description=boom'), stubHistory([]))).toEqual({
      ok: false,
      message: CALLBACK_GENERIC,
    })
  })

  it('success only with a session from this exchange', async () => {
    const { client } = createFakeAuth()
    expect(await completeAuthCallback(client, at('?code=c'), stubHistory([]))).toEqual({ ok: true })
  })
})

describe('completeAuthCallback URL hygiene and logging', () => {
  it('cleans the URL (replaceState) before any await, i.e. before the exchange is called', async () => {
    const order: string[] = []
    const { client, auth } = createFakeAuth()
    auth.exchangeCodeForSession.mockImplementationOnce(async () => {
      order.push('exchange')
      return { data: { session: fakeSession() }, error: null }
    })
    await completeAuthCallback(client, at('?code=c0de'), stubHistory(order))
    expect(order).toEqual(['replaceState', 'exchange'])
  })

  it('rejects a fragment with tokens after cleaning, without any auth call', async () => {
    const order: string[] = []
    const { client, auth } = createFakeAuth()
    const result = await completeAuthCallback(client, at('?code=c#access_token=evil&refresh_token=evil'), stubHistory(order))
    expect(result).toEqual({ ok: false, message: CALLBACK_GENERIC })
    expect(order).toEqual(['replaceState'])
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled()
    expect(auth.setSession).not.toHaveBeenCalled()
  })

  it('logs only name/status/code, never the message, code or tokens', async () => {
    await exchangeFailing({ name: 'AuthApiError', status: 400, code: 'flow_state_not_found', message: 'secret-token-abc c0de' })
    expect(warn).toHaveBeenCalledTimes(1)
    const logged = JSON.stringify(warn.mock.calls)
    expect(logged).toContain('flow_state_not_found')
    expect(logged).not.toContain('secret-token-abc')
    expect(logged).not.toContain('c0de')
  })
})
