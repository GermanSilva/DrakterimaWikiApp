import { createClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { createCampaignRepository } from './campaignRepository'
import type { Db } from './types'

/**
 * preview_invite is STABLE, so PostgREST would also accept it as a GET with the code in the query string
 * (URLs end up in logs and history). supabase-js `rpc()` posts unless `get: true` is passed: these tests pin that
 * the invite RPCs always go out as POST with the code in the body.
 */
describe('invite RPCs are sent as POST with the code in the body', () => {
  function setup() {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const client = createClient('http://127.0.0.1:54321', 'anon-key', { auth: { persistSession: false }, global: { fetch: fetchSpy as unknown as typeof fetch } })
    return { fetchSpy, repo: createCampaignRepository(client as unknown as Db) }
  }

  it.each([
    ['previewInvite', 'preview_invite'],
    ['acceptInvite', 'accept_invite'],
  ] as const)('%s', async (method, fn) => {
    const { fetchSpy, repo } = setup()
    await repo[method]('secret-code-123')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [input, init] = fetchSpy.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit]
    const url = String(input instanceof Request ? input.url : input)
    expect(url).toContain(`/rpc/${fn}`)
    expect(url).not.toContain('secret-code-123')
    expect(new URL(url).search).toBe('')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ p_code: 'secret-code-123' })
  })
})
