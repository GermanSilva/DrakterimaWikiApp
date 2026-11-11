import { describe, expect, it, vi } from 'vitest'
import { reportLoginFailure } from './loginFailureReport'
import type { Db } from './types'

const clientWith = (invoke: (...args: unknown[]) => unknown) => ({ functions: { invoke } }) as unknown as Db
const httpError = (status: number) => ({ name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context: { status } })
const input = { kind: 'google_error' as const, errorKind: 'network', message: 'x', contact: 'a@b.co', path: '/login', website: '' }

describe('reportLoginFailure', () => {
  it('invokes the function with the body as given', async () => {
    const invoke = vi.fn(async () => ({ data: { ok: true }, error: null }))
    expect(await reportLoginFailure(clientWith(invoke), input)).toBe('ok')
    expect(invoke).toHaveBeenCalledWith('report-login-failure', { body: input })
  })

  it.each([
    [400, 'invalid_input'],
    [429, 'rate_limited'],
    [500, 'unavailable'],
    [405, 'unavailable'],
  ])('maps HTTP %i to %s', async (status, expected) => {
    const invoke = vi.fn(async () => ({ data: null, error: httpError(status) }))
    expect(await reportLoginFailure(clientWith(invoke), input)).toBe(expected)
  })

  it('maps a network error (no response) to unavailable', async () => {
    const invoke = vi.fn(async () => ({ data: null, error: { name: 'FunctionsFetchError', message: 'Failed to fetch' } }))
    expect(await reportLoginFailure(clientWith(invoke), input)).toBe('unavailable')
  })

  it('maps a thrown error to unavailable', async () => {
    const invoke = vi.fn(async () => {
      throw new Error('boom')
    })
    expect(await reportLoginFailure(clientWith(invoke), input)).toBe('unavailable')
  })
})
