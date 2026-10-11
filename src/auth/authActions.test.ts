import { describe, expect, it, vi } from 'vitest'
import { requestMagicLink, startGoogleSignIn } from './authActions'
import { callbackUrl, isGoogleEnabled } from './authConfig'
import { AuthFlowError, normalizeEmail, toAuthFlowError, toOAuthFlowError } from './authErrors'
import { createFakeAuth } from './testing/fakeAuth'

const kindOf = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return (e as AuthFlowError).kind
  }
  return 'resolved'
}

describe('authConfig', () => {
  it('builds the callback URL from the given origin only', () => {
    expect(callbackUrl('https://hub.test')).toBe('https://hub.test/auth/callback')
    expect(callbackUrl()).toBe(`${window.location.origin}/auth/callback`)
  })
  it('hides Google only when the flag is the string "false"', () => {
    expect(isGoogleEnabled({})).toBe(true)
    expect(isGoogleEnabled({ VITE_AUTH_GOOGLE_ENABLED: 'true' })).toBe(true)
    expect(isGoogleEnabled({ VITE_AUTH_GOOGLE_ENABLED: 'false' })).toBe(false)
  })
})

describe('normalizeEmail', () => {
  it('trims and lowercases', () => expect(normalizeEmail('  Ana@Example.COM ')).toBe('ana@example.com'))
  it.each(['', 'ana', 'ana@', '@x.com', 'a b@x.com', 'ana@x', `${'a'.repeat(250)}@x.com`])('rejects %j', (raw) => {
    expect(() => normalizeEmail(raw)).toThrow(AuthFlowError)
  })
})

describe('toAuthFlowError', () => {
  it('classifies rate limits by status or code', () => {
    expect(toAuthFlowError({ status: 429, message: 'x' }).kind).toBe('rate_limited')
    expect(toAuthFlowError({ code: 'over_email_send_rate_limit', message: 'x' }).kind).toBe('rate_limited')
  })
  it('maps only address-related 422 codes to invalid_email', () => {
    expect(toAuthFlowError({ code: 'email_address_invalid', message: 'x' }).kind).toBe('invalid_email')
    expect(toAuthFlowError({ status: 422, code: 'validation_failed', message: 'x' }).kind).toBe('invalid_email')
    expect(toAuthFlowError({ status: 422, message: 'x' }).kind).toBe('unknown')
    expect(toAuthFlowError({ status: 422, code: 'signup_disabled', message: 'x' }).kind).toBe('unknown')
    expect(toAuthFlowError({ status: 422, code: 'email_provider_disabled', message: 'x' }).kind).toBe('unknown')
  })
  it('classifies a disabled provider, network failures and the rest', () => {
    expect(toAuthFlowError({ message: 'Unsupported provider: provider is not enabled' }).kind).toBe('provider_disabled')
    expect(toAuthFlowError({ name: 'AuthRetryableFetchError', message: 'x' }).kind).toBe('network')
    expect(toAuthFlowError(new Error('boom')).kind).toBe('unknown')
    expect(toAuthFlowError(null).kind).toBe('unknown')
  })
  it('counts only fetch-originated TypeErrors as network', () => {
    expect(toAuthFlowError(new TypeError('Failed to fetch')).kind).toBe('network')
    expect(toAuthFlowError(new TypeError('NetworkError when attempting to fetch resource.')).kind).toBe('network')
    expect(toAuthFlowError(new TypeError('Load failed')).kind).toBe('network')
    expect(toAuthFlowError(new TypeError("Cannot read properties of undefined (reading 'x')")).kind).toBe('unknown')
    expect(toAuthFlowError({ message: 'network down' }).kind).toBe('unknown')
  })
  it('OAuth classifier: 422 is not invalid_email, 429 has its own message', () => {
    expect(toOAuthFlowError({ status: 422, message: 'x' }).kind).toBe('unknown')
    expect(toOAuthFlowError({ status: 429, message: 'x' }).kind).toBe('oauth_rate_limited')
    expect(toOAuthFlowError({ status: 429, message: 'x' }).message).not.toMatch(/links/)
    expect(toOAuthFlowError({ message: 'Unsupported provider: provider is not enabled' }).kind).toBe('provider_disabled')
    expect(toOAuthFlowError(new TypeError('Failed to fetch')).kind).toBe('network')
  })
  it('maps captcha errors by code or message, never leaking the server text', () => {
    const e = toAuthFlowError({ status: 400, code: 'captcha_failed', message: 'secret internal detail' })
    expect(e.kind).toBe('captcha_failed')
    expect(e.message).toMatch(/verificación de seguridad/)
    expect(e.message).not.toContain('secret')
    expect(toAuthFlowError({ message: 'Captcha verification failed' }).kind).toBe('captcha_failed')
  })
  it('never leaks the server message', () => {
    expect(toAuthFlowError({ message: 'secret internal detail' }).message).not.toContain('secret')
  })
})

describe('requestMagicLink', () => {
  it('sends a normalized email with the callback redirect and shouldCreateUser', async () => {
    const { client, auth } = createFakeAuth()
    await requestMagicLink(client, ' Ana@Example.com ', undefined, 'https://hub.test')
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'ana@example.com',
      options: { emailRedirectTo: 'https://hub.test/auth/callback', shouldCreateUser: true },
    })
  })
  it('forwards a captcha token as options.captchaToken, and omits the key when there is none', async () => {
    const { client, auth } = createFakeAuth()
    await requestMagicLink(client, 'a@b.co', 'tok-1', 'https://hub.test')
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'a@b.co',
      options: { emailRedirectTo: 'https://hub.test/auth/callback', shouldCreateUser: true, captchaToken: 'tok-1' },
    })
    await requestMagicLink(client, 'a@b.co', undefined, 'https://hub.test')
    expect(auth.signInWithOtp.mock.calls[1][0]).not.toHaveProperty('options.captchaToken')
  })
  it('maps a captcha rejection to its own Spanish message', async () => {
    const { client, auth } = createFakeAuth()
    auth.signInWithOtp.mockResolvedValueOnce({ data: {}, error: { status: 400, code: 'captcha_failed', message: 'captcha protection: request disallowed (invalid-input-response)' } })
    expect(await kindOf(requestMagicLink(client, 'a@b.co', 'bad'))).toBe('captcha_failed')
    auth.signInWithOtp.mockResolvedValueOnce({ data: {}, error: { status: 400, message: 'captcha verification process failed' } })
    expect(await kindOf(requestMagicLink(client, 'a@b.co', 'bad'))).toBe('captcha_failed')
  })
  it('rejects an invalid email without calling the server', async () => {
    const { client, auth } = createFakeAuth()
    expect(await kindOf(requestMagicLink(client, 'nope'))).toBe('invalid_email')
    expect(auth.signInWithOtp).not.toHaveBeenCalled()
  })
  it('maps a rate-limit response to a friendly typed error', async () => {
    const { client, auth } = createFakeAuth()
    auth.signInWithOtp.mockResolvedValueOnce({ data: {}, error: { status: 429, code: 'over_email_send_rate_limit', message: 'x' } })
    expect(await kindOf(requestMagicLink(client, 'a@b.co'))).toBe('rate_limited')
  })
  it('maps a thrown network error', async () => {
    const { client, auth } = createFakeAuth()
    auth.signInWithOtp.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(await kindOf(requestMagicLink(client, 'a@b.co'))).toBe('network')
  })
})

describe('startGoogleSignIn', () => {
  const redirectResponse = () => ({ type: 'opaqueredirect', status: 0 }) as Response
  const errorResponse = (status: number, body: unknown) => ({ type: 'cors', status, json: async () => body }) as unknown as Response

  it('requests the URL without auto-redirect, probes it and navigates when the provider works', async () => {
    const { client, auth } = createFakeAuth()
    const fetchFn = vi.fn(async () => redirectResponse())
    const navigate = vi.fn()
    await startGoogleSignIn(client, { origin: 'https://hub.test', fetchFn: fetchFn as never, navigate })
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'https://hub.test/auth/callback', skipBrowserRedirect: true },
    })
    expect(fetchFn).toHaveBeenCalledWith('https://auth.test/authorize?provider=google', {
      redirect: 'manual',
      credentials: 'omit',
      signal: expect.any(AbortSignal),
    })
    expect(navigate).toHaveBeenCalledWith('https://auth.test/authorize?provider=google')
  })
  it('turns a provider-disabled answer into a typed error and does not navigate', async () => {
    const { client } = createFakeAuth()
    const fetchFn = vi.fn(async () =>
      errorResponse(400, { code: 400, error_code: 'validation_failed', msg: 'Unsupported provider: provider is not enabled' }),
    )
    const navigate = vi.fn()
    expect(await kindOf(startGoogleSignIn(client, { fetchFn: fetchFn as never, navigate }))).toBe('provider_disabled')
    expect(navigate).not.toHaveBeenCalled()
  })
  it('navigates anyway when the probe cannot run (network/CORS)', async () => {
    const { client } = createFakeAuth()
    const navigate = vi.fn()
    const failing = async () => {
      throw new TypeError('Failed to fetch')
    }
    await startGoogleSignIn(client, { fetchFn: failing as never, navigate })
    expect(navigate).toHaveBeenCalledOnce()
  })
  it('navigates anyway when the probe times out, aborting the request', async () => {
    const { client } = createFakeAuth()
    const navigate = vi.fn()
    let aborted = false
    const hanging = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          aborted = true
          reject(new DOMException('aborted', 'AbortError'))
        })
      })
    await startGoogleSignIn(client, { fetchFn: hanging as never, navigate, probeTimeoutMs: 20 })
    expect(aborted).toBe(true)
    expect(navigate).toHaveBeenCalledOnce()
  })
  it('maps a 429 probe to the OAuth rate-limit error and never to invalid_email on 422', async () => {
    const { client } = createFakeAuth()
    const navigate = vi.fn()
    const f = (status: number) => (async () => errorResponse(status, { msg: 'x' })) as never
    expect(await kindOf(startGoogleSignIn(client, { fetchFn: f(429), navigate }))).toBe('oauth_rate_limited')
    expect(await kindOf(startGoogleSignIn(client, { fetchFn: f(422), navigate }))).toBe('unknown')
    expect(navigate).not.toHaveBeenCalled()
  })
  it('refuses a non-http(s) authorize URL', async () => {
    const { client, auth } = createFakeAuth()
    auth.signInWithOAuth.mockResolvedValueOnce({ data: { url: 'javascript:alert(1)' }, error: null })
    const navigate = vi.fn()
    expect(await kindOf(startGoogleSignIn(client, { navigate }))).toBe('unknown')
    expect(navigate).not.toHaveBeenCalled()
  })
  it('maps an error returned by signInWithOAuth', async () => {
    const { client, auth } = createFakeAuth()
    auth.signInWithOAuth.mockResolvedValueOnce({ data: { url: null }, error: { message: 'provider is not enabled' } })
    expect(await kindOf(startGoogleSignIn(client))).toBe('provider_disabled')
  })
})
