import { describe, expect, it, vi } from 'vitest'
import { createHandler } from './handler'

const ORIGIN = 'https://app.example.test'

function makeDeps(over: Record<string, unknown> = {}) {
  return {
    insertReport: vi.fn(async () => ({ id: 7 })),
    countRecent: vi.fn(async () => 0),
    countSince: vi.fn(async () => 0),
    markEmailed: vi.fn(async () => {}),
    sendEmail: vi.fn(async () => {}),
    hashIp: vi.fn(async (ip: string) => `hash:${ip}`),
    now: () => new Date('2026-11-12T15:00:00Z'),
    allowedOrigins: [ORIGIN],
    log: vi.fn(),
    ...over,
  }
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://x.test/report-login-failure', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-forwarded-for': '1.2.3.4, 5.6.7.8', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const valid = { kind: 'google_error', errorKind: 'access_denied', message: 'No puedo entrar', contact: 'a@b.co', path: '/login' }

describe('report-login-failure handler', () => {
  it('stores, emails and marks emailed on a valid report', async () => {
    const deps = makeDeps()
    const res = await createHandler(deps)(post(valid, { 'user-agent': 'UA/1' }))
    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({ ok: true })
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(deps.hashIp).toHaveBeenCalledWith('1.2.3.4')
    expect(deps.insertReport).toHaveBeenCalledTimes(1)
    expect(deps.insertReport.mock.calls[0][0]).toMatchObject({
      kind: 'google_error', error_kind: 'access_denied', message: 'No puedo entrar', contact: 'a@b.co',
      path: '/login', user_agent: 'UA/1', ip_hash: 'hash:1.2.3.4',
    })
    expect(deps.sendEmail).toHaveBeenCalledTimes(1)
    const mail = deps.sendEmail.mock.calls[0][0] as { subject: string; text: string; replyTo?: string }
    expect(mail.subject).toBe('[RPG Quester] Falla de ingreso con Google')
    expect(mail.text).toContain('access_denied')
    expect(mail.text).toContain('No puedo entrar')
    expect(mail.text).toContain('12/11/2026')
    expect(mail.replyTo).toBe('a@b.co')
    expect(deps.markEmailed).toHaveBeenCalledWith(7)
  })

  it('accepts a minimal report', async () => {
    const deps = makeDeps()
    const res = await createHandler(deps)(post({ kind: 'google_disabled' }))
    expect(res.status).toBe(202)
    expect(deps.insertReport).toHaveBeenCalledTimes(1)
  })

  it('ignores unknown keys', async () => {
    const deps = makeDeps()
    const res = await createHandler(deps)(post({ kind: 'google_disabled', extra: 1 }))
    expect(res.status).toBe(202)
    expect(deps.insertReport.mock.calls[0][0]).not.toHaveProperty('extra')
  })

  it('honeypot returns 202 without storing or emailing', async () => {
    const deps = makeDeps()
    const res = await createHandler(deps)(post({ ...valid, website: 'http://spam' }))
    expect(res.status).toBe(202)
    expect(deps.insertReport).not.toHaveBeenCalled()
    expect(deps.sendEmail).not.toHaveBeenCalled()
  })

  it.each([
    ['invalid kind', { ...valid, kind: 'nope' }],
    ['missing kind', { message: 'x' }],
    ['invalid errorKind', { ...valid, errorKind: 'Bad-Kind' }],
    ['long errorKind', { ...valid, errorKind: 'a'.repeat(65) }],
    ['invalid contact', { ...valid, contact: 'not-an-email' }],
    ['path without slash', { ...valid, path: 'login' }],
    ['protocol-relative path', { ...valid, path: '//evil.test' }],
    ['long path', { ...valid, path: '/' + 'a'.repeat(200) }],
    ['oversized message', { ...valid, message: 'x'.repeat(1001) }],
    ['non-string message', { ...valid, message: 5 }],
    ['array body', [1]],
  ])('rejects %s with 400 and no insert', async (_n, body) => {
    const deps = makeDeps()
    const res = await createHandler(deps)(post(body))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_input' })
    expect(deps.insertReport).not.toHaveBeenCalled()
  })

  it('rejects malformed JSON with 400', async () => {
    const deps = makeDeps()
    const res = await createHandler(deps)(post('{nope'))
    expect(res.status).toBe(400)
    expect(deps.insertReport).not.toHaveBeenCalled()
  })

  it('does not echo user input in errors', async () => {
    const res = await createHandler(makeDeps())(post({ ...valid, contact: 'LEAKED-INPUT' }))
    expect(await res.text()).not.toContain('LEAKED-INPUT')
  })

  it('429 when the IP limit (3/hour) is reached', async () => {
    const deps = makeDeps({ countRecent: vi.fn(async () => 3) })
    const res = await createHandler(deps)(post(valid))
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'rate_limited' })
    expect(deps.countRecent).toHaveBeenCalledWith('hash:1.2.3.4', '2026-11-12T14:00:00.000Z')
    expect(deps.insertReport).not.toHaveBeenCalled()
  })

  it('429 when the daily limit (30) is reached', async () => {
    const deps = makeDeps({ countSince: vi.fn(async () => 30) })
    const res = await createHandler(deps)(post(valid))
    expect(res.status).toBe(429)
    expect(deps.countSince).toHaveBeenCalledWith('2026-11-11T15:00:00.000Z')
    expect(deps.insertReport).not.toHaveBeenCalled()
  })

  it('still answers 202 when the email fails, without markEmailed', async () => {
    const deps = makeDeps({ sendEmail: vi.fn(async () => { throw new Error('resend down') }) })
    const res = await createHandler(deps)(post(valid))
    expect(res.status).toBe(202)
    expect(deps.insertReport).toHaveBeenCalledTimes(1)
    expect(deps.markEmailed).not.toHaveBeenCalled()
    expect(deps.log).toHaveBeenCalled()
  })

  it('500 unavailable when storing fails', async () => {
    const deps = makeDeps({ insertReport: vi.fn(async () => { throw new Error('db') }) })
    const res = await createHandler(deps)(post(valid))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'unavailable' })
    expect(deps.sendEmail).not.toHaveBeenCalled()
  })

  it('405 for GET', async () => {
    const res = await createHandler(makeDeps())(new Request('https://x.test/', { method: 'GET', headers: { origin: ORIGIN } }))
    expect(res.status).toBe(405)
  })

  it('OPTIONS from an allowed origin gets CORS headers', async () => {
    const res = await createHandler(makeDeps())(new Request('https://x.test/', { method: 'OPTIONS', headers: { origin: ORIGIN } }))
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(res.headers.get('access-control-allow-methods')).toContain('POST')
  })

  it('OPTIONS from a disallowed origin gets no CORS headers', async () => {
    const res = await createHandler(makeDeps())(new Request('https://x.test/', { method: 'OPTIONS', headers: { origin: 'https://evil.test' } }))
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('omits CORS header on POST from a disallowed origin', async () => {
    const res = await createHandler(makeDeps())(post(valid, { origin: 'https://evil.test' }))
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('strips control and bidi characters from the message', async () => {
    const deps = makeDeps()
    await createHandler(deps)(post({ ...valid, message: 'a\u0000b‮c​d\ne' }))
    expect((deps.insertReport.mock.calls[0][0] as { message: string }).message).toBe('abcd\ne')
  })

  it('falls back to "unknown" when there is no x-forwarded-for', async () => {
    const deps = makeDeps()
    const req = new Request('https://x.test/', { method: 'POST', headers: { origin: ORIGIN }, body: JSON.stringify(valid) })
    await createHandler(deps)(req)
    expect(deps.hashIp).toHaveBeenCalledWith('unknown')
  })
})
