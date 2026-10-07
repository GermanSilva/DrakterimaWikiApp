import { beforeEach, describe, expect, it, vi } from 'vitest'

const createClient = vi.hoisted(() => vi.fn(() => ({})))
vi.mock('@supabase/supabase-js', () => ({ createClient }))

import { createSupabaseClient } from './supabaseClient'

beforeEach(() => createClient.mockClear())

describe('createSupabaseClient options', () => {
  it('uses PKCE without URL detection', () => {
    createSupabaseClient('http://x.test', 'anon')
    expect(createClient).toHaveBeenCalledWith('http://x.test', 'anon', { auth: { flowType: 'pkce', detectSessionInUrl: false } })
  })

  it('lets callers tune other auth options but never downgrade the invariant keys', () => {
    const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
    createSupabaseClient('http://x.test', 'anon', { storage, autoRefreshToken: false, flowType: 'implicit', detectSessionInUrl: true })
    expect(createClient).toHaveBeenCalledWith('http://x.test', 'anon', {
      auth: { storage, autoRefreshToken: false, flowType: 'pkce', detectSessionInUrl: false },
    })
  })
})
