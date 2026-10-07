import type { Session } from '@supabase/supabase-js'
import { vi } from 'vitest'
import type { Db } from '../../data'

type Listener = (event: string, session: Session | null) => void

export const fakeSession = (id = 'u1', email = 'a@b.co'): Session =>
  ({ access_token: 'access', refresh_token: 'refresh', user: { id, email } }) as unknown as Session

/** Minimal supabase auth fake: records calls, lets tests emit auth state changes. */
export function createFakeAuth(initial: Session | null = null) {
  let session = initial
  const listeners = new Set<Listener>()
  const unsubscribe = vi.fn()
  const emit = (event: string, next: Session | null) => {
    session = next
    listeners.forEach((l) => l(event, next))
  }
  const auth = {
    getSession: vi.fn(async () => ({ data: { session }, error: null })),
    onAuthStateChange: vi.fn((cb: Listener) => {
      listeners.add(cb)
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              unsubscribe()
              listeners.delete(cb)
            },
          },
        },
      }
    }),
    signInWithOtp: vi.fn<(args: unknown) => Promise<{ data: object; error: unknown }>>(async () => ({ data: {}, error: null })),
    signInWithOAuth: vi.fn<(args: unknown) => Promise<{ data: { url: string | null }; error: unknown }>>(async () => ({
      data: { provider: 'google', url: 'https://auth.test/authorize?provider=google' },
      error: null,
    })),
    signOut: vi.fn<(options?: { scope: string }) => Promise<{ error: unknown }>>(async () => {
      emit('SIGNED_OUT', null)
      return { error: null }
    }),
    exchangeCodeForSession: vi.fn<(code: string) => Promise<{ data: { session: unknown }; error: unknown }>>(async () => ({
      data: { session: fakeSession() },
      error: null,
    })),
    setSession: vi.fn<(tokens: unknown) => Promise<{ data: object; error: unknown }>>(async () => ({ data: {}, error: null })),
  }
  return { client: { auth } as unknown as Db, auth, emit, unsubscribe, listeners }
}

export const profileRow = (id = 'u1', display_name = 'Ana') => ({
  id,
  display_name,
  avatar_url: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
})
