import { afterEach, describe, expect, it, vi } from 'vitest'
import { toDataError, unwrap, unwrapWrite } from './errors'
import { createFakeClient } from './testing/fakeClient'
import { getSupabase, setSupabaseClient } from './supabaseClient'

afterEach(() => {
  setSupabaseClient(null)
  vi.unstubAllEnvs()
})

describe('supabase client', () => {
  it('importing is safe without env; getSupabase throws a clear error when it is missing', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    expect(() => getSupabase()).toThrow(/VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY/)
  })

  it('creates the client lazily from env and reuses it', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-test-key')
    expect(getSupabase()).toBe(getSupabase())
  })

  it('allows injecting a client', () => {
    const fake = createFakeClient()
    setSupabaseClient(fake.db)
    expect(getSupabase()).toBe(fake.db)
  })
})

describe('errors', () => {
  it('maps SQLSTATE / PostgREST codes to kinds', () => {
    const kind = (code?: string) => toDataError({ message: 'm', code }).kind
    expect(kind('42501')).toBe('permission')
    expect(kind('PGRST116')).toBe('not_found')
    expect(kind('23505')).toBe('conflict')
    expect(kind('23503')).toBe('validation')
    expect(kind('22023')).toBe('validation')
    expect(kind('P0001')).toBe('business')
    expect(kind('28000')).toBe('auth')
    expect(kind('XX000')).toBe('unknown')
    expect(kind(undefined)).toBe('unknown')
  })

  it('unwrap returns data and throws on error', () => {
    expect(unwrap({ data: 5, error: null })).toBe(5)
    expect(() => unwrap({ data: null, error: { message: 'x', code: '42501' } })).toThrow('x')
  })
})

describe('error reasons', () => {
  it('sets reason only for whitelisted codes, whatever the SQLSTATE, and keeps kind honest', () => {
    expect(toDataError({ message: 'not_a_member', code: '42501' })).toMatchObject({ kind: 'permission', reason: 'not_a_member' })
    expect(toDataError({ message: 'not_your_character', code: '42501' }).reason).toBe('not_your_character')
    expect(toDataError({ message: 'dm_only', code: '42501' }).reason).toBe('dm_only')
    expect(toDataError({ message: 'character_already_has_pending_invite', code: '23514' })).toMatchObject({
      kind: 'validation',
      reason: 'character_already_has_pending_invite',
    })
    expect(toDataError({ message: 'already_played_today', code: 'P0001' })).toMatchObject({ kind: 'business', reason: 'already_played_today' })
    // unknown text or a non-reason SQLSTATE never gets a reason
    expect(toDataError({ message: 'something else', code: 'P0001' }).reason).toBeUndefined()
    expect(toDataError({ message: 'dm_only', code: '23505' }).reason).toBeUndefined()
  })

  it('unwrapWrite classifies PGRST116 as written_not_visible, other errors as unwrap does', () => {
    expect(() => unwrapWrite({ data: null, error: { message: 'no rows', code: 'PGRST116' } })).toThrow(
      expect.objectContaining({ kind: 'written_not_visible' }),
    )
    expect(() => unwrapWrite({ data: null, error: { message: 'x', code: '42501' } })).toThrow(
      expect.objectContaining({ kind: 'permission' }),
    )
    expect(unwrapWrite({ data: 1, error: null })).toBe(1)
  })
})
