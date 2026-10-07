import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthProvider'
import { createFakeAuth, fakeSession, profileRow } from './testing/fakeAuth'
import { useAuth } from './useAuth'
import { deferred } from './testing/deferred'

type Row = ReturnType<typeof profileRow>

function setup(initial: ReturnType<typeof fakeSession> | null, get: (id: string) => Promise<Row | null>) {
  const fake = createFakeAuth(initial)
  const profiles = { get: vi.fn(get) }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthProvider client={fake.client} profiles={profiles}>
      {children}
    </AuthProvider>
  )
  return { ...fake, profiles, ...renderHook(() => useAuth(), { wrapper }) }
}

describe('AuthProvider profile read ordering', () => {
  it('only the latest read wins: a late failing refresh cannot override a newer success', async () => {
    const first = deferred<Row | null>() // initial load
    const second = deferred<Row | null>() // refresh 1 (slow, will fail)
    const third = deferred<Row | null>() // refresh 2 (newer, succeeds first)
    const queue = [first, second, third]
    const { result, profiles } = setup(fakeSession('u1'), () => queue.shift()!.promise)
    await waitFor(() => expect(profiles.get).toHaveBeenCalledTimes(1))
    await act(async () => first.resolve(profileRow('u1', 'Ana')))
    await waitFor(() => expect(result.current.profile?.display_name).toBe('Ana'))

    let r1!: Promise<void>
    let r2!: Promise<void>
    act(() => {
      r1 = result.current.refreshProfile()
      r2 = result.current.refreshProfile()
    })
    await act(async () => {
      third.resolve(profileRow('u1', 'Ana C'))
      await r2
    })
    expect(result.current.profile?.display_name).toBe('Ana C')
    await act(async () => {
      second.reject(new Error('late failure'))
      await r1
    })
    expect(result.current.profile?.display_name).toBe('Ana C')
    expect(result.current.profileStatus).toBe('loaded')
    expect(result.current.profileError).toBeNull()
  })

  it('an older success cannot overwrite a newer refresh either', async () => {
    const first = deferred<Row | null>()
    const second = deferred<Row | null>()
    const queue = [first, second]
    const { result, profiles } = setup(fakeSession('u1'), () => queue.shift()!.promise)
    await waitFor(() => expect(profiles.get).toHaveBeenCalledTimes(1))
    let refresh!: Promise<void>
    act(() => {
      refresh = result.current.refreshProfile()
    })
    await act(async () => {
      second.resolve(profileRow('u1', 'new'))
      await refresh
    })
    await act(async () => first.resolve(profileRow('u1', 'old')))
    expect(result.current.profile?.display_name).toBe('new')
  })

  it('a batched same-user SIGNED_OUT + SIGNED_IN reloads the profile', async () => {
    const { result, emit, profiles } = setup(fakeSession('u1'), async (id) => profileRow(id, 'Ana'))
    await waitFor(() => expect(result.current.profileStatus).toBe('loaded'))
    expect(profiles.get).toHaveBeenCalledTimes(1)
    act(() => {
      emit('SIGNED_OUT', null)
      emit('SIGNED_IN', fakeSession('u1'))
    })
    await waitFor(() => expect(profiles.get).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.profileStatus).toBe('loaded'))
  })

  it('a SIGNED_IN for the same, already signed-in user (tab refocus) does not refetch', async () => {
    const { result, emit, profiles } = setup(fakeSession('u1'), async (id) => profileRow(id))
    await waitFor(() => expect(result.current.profileStatus).toBe('loaded'))
    act(() => emit('SIGNED_IN', fakeSession('u1')))
    expect(profiles.get).toHaveBeenCalledTimes(1)
  })

  it('a rejected getSession() ends as signed_out', async () => {
    const fake = createFakeAuth(null)
    fake.auth.getSession.mockRejectedValueOnce(new Error('storage unavailable'))
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <AuthProvider client={fake.client} profiles={{ get: async () => null }}>
          {children}
        </AuthProvider>
      ),
    })
    await waitFor(() => expect(result.current.status).toBe('signed_out'))
    expect(result.current.profileStatus).toBe('idle')
  })
})
