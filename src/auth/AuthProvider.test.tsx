import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Db } from '../data'
import { AuthProvider } from './AuthProvider'
import { NEXT_STORAGE_KEY, rememberNext } from './postLoginRedirect'
import { createFakeAuth, fakeSession, profileRow } from './testing/fakeAuth'
import { useAuth } from './useAuth'

function setup(initial = null as ReturnType<typeof fakeSession> | null, getProfile = vi.fn(async (id: string) => profileRow(id))) {
  const fake = createFakeAuth(initial)
  const profiles = { get: getProfile }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthProvider client={fake.client} profiles={profiles}>
      {children}
    </AuthProvider>
  )
  const hook = renderHook(() => useAuth(), { wrapper })
  return { ...fake, profiles, getProfile, ...hook }
}

describe('AuthProvider', () => {
  it('starts loading, then signed_out without a stored session', async () => {
    const { result } = setup()
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('signed_out'))
    expect(result.current.user).toBeNull()
    expect(result.current.profile).toBeNull()
  })

  it('restores a stored session and loads the profile', async () => {
    const { result, getProfile } = setup(fakeSession('u1'))
    await waitFor(() => expect(result.current.status).toBe('signed_in'))
    await waitFor(() => expect(result.current.profile?.display_name).toBe('Ana'))
    expect(getProfile).toHaveBeenCalledWith('u1')
    expect(result.current.user?.id).toBe('u1')
  })

  it('follows onAuthStateChange sign-in and sign-out', async () => {
    const { result, emit } = setup()
    await waitFor(() => expect(result.current.status).toBe('signed_out'))
    act(() => emit('SIGNED_IN', fakeSession('u2')))
    await waitFor(() => expect(result.current.profile?.id).toBe('u2'))
    expect(result.current.status).toBe('signed_in')
    act(() => emit('SIGNED_OUT', null))
    expect(result.current.status).toBe('signed_out')
    expect(result.current.profile).toBeNull()
  })

  it('does not reload the profile on token refresh of the same user', async () => {
    const { result, emit, getProfile } = setup(fakeSession('u1'))
    await waitFor(() => expect(result.current.profile).not.toBeNull())
    act(() => emit('TOKEN_REFRESHED', fakeSession('u1')))
    expect(getProfile).toHaveBeenCalledTimes(1)
  })

  it('subscribes once and unsubscribes on unmount', async () => {
    const { auth, unsubscribe, unmount, result } = setup()
    await waitFor(() => expect(result.current.status).toBe('signed_out'))
    expect(auth.onAuthStateChange).toHaveBeenCalledTimes(1)
    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('an auth event wins over a slower getSession result', async () => {
    const fake = createFakeAuth(null)
    let release: (v: { data: { session: null }; error: null }) => void = () => {}
    fake.auth.getSession.mockImplementationOnce(() => new Promise((r) => (release = r)) as never)
    const profiles = { get: vi.fn(async (id: string) => profileRow(id)) }
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <AuthProvider client={fake.client} profiles={profiles}>
          {children}
        </AuthProvider>
      ),
    })
    act(() => fake.emit('SIGNED_IN', fakeSession('u1')))
    await act(async () => release({ data: { session: null }, error: null }))
    expect(result.current.status).toBe('signed_in')
  })

  it('drops a stale profile response after sign-out (rapid sign-in/out race)', async () => {
    let resolveProfile: (p: ReturnType<typeof profileRow>) => void = () => {}
    const getProfile = vi.fn(() => new Promise<ReturnType<typeof profileRow>>((r) => (resolveProfile = r)))
    const { result, emit } = setup(null, getProfile as never)
    await waitFor(() => expect(result.current.status).toBe('signed_out'))
    act(() => emit('SIGNED_IN', fakeSession('u1')))
    act(() => emit('SIGNED_OUT', null))
    await act(async () => resolveProfile(profileRow('u1')))
    expect(result.current.profile).toBeNull()
    // Signing in as another user never shows the previous user's profile.
    act(() => emit('SIGNED_IN', fakeSession('u2')))
    expect(result.current.profile).toBeNull()
  })

  it('reports a profile load failure without losing the session', async () => {
    const { result } = setup(fakeSession('u1'), vi.fn(async () => { throw new Error('rls') }) as never)
    await waitFor(() => expect(result.current.profileError?.message).toBe('rls'))
    expect(result.current.status).toBe('signed_in')
    expect(result.current.profile).toBeNull()
  })

  it('refreshProfile re-reads the profile', async () => {
    const getProfile = vi
      .fn()
      .mockResolvedValueOnce(profileRow('u1', 'Ana'))
      .mockResolvedValueOnce(profileRow('u1', 'Ana B'))
    const { result } = setup(fakeSession('u1'), getProfile as never)
    await waitFor(() => expect(result.current.profile?.display_name).toBe('Ana'))
    await act(async () => result.current.refreshProfile())
    expect(result.current.profile?.display_name).toBe('Ana B')
  })

  it('refreshProfile never rejects: a failure sets profileError and keeps the last profile', async () => {
    const getProfile = vi.fn().mockResolvedValueOnce(profileRow('u1', 'Ana')).mockRejectedValueOnce(new Error('offline'))
    const { result } = setup(fakeSession('u1'), getProfile as never)
    await waitFor(() => expect(result.current.profileStatus).toBe('loaded'))
    await act(async () => {
      await expect(result.current.refreshProfile()).resolves.toBeUndefined()
    })
    expect(result.current.profileStatus).toBe('error')
    expect(result.current.profileError?.message).toBe('offline')
    expect(result.current.profile?.display_name).toBe('Ana')
  })

  it('exposes profileStatus idle, loading, loaded', async () => {
    let resolveProfile: (p: ReturnType<typeof profileRow>) => void = () => {}
    const getProfile = vi.fn(() => new Promise<ReturnType<typeof profileRow>>((r) => (resolveProfile = r)))
    const { result, emit } = setup(null, getProfile as never)
    await waitFor(() => expect(result.current.status).toBe('signed_out'))
    expect(result.current.profileStatus).toBe('idle')
    act(() => emit('SIGNED_IN', fakeSession('u1')))
    expect(result.current.profileStatus).toBe('loading')
    await act(async () => resolveProfile(profileRow('u1')))
    expect(result.current.profileStatus).toBe('loaded')
  })

  it('clears the cached profile on sign-out so a same-user re-login does not flash stale data', async () => {
    let resolveSecond: (p: ReturnType<typeof profileRow>) => void = () => {}
    const getProfile = vi
      .fn()
      .mockResolvedValueOnce(profileRow('u1', 'Ana'))
      .mockImplementationOnce(() => new Promise((r) => (resolveSecond = r)))
    const { result, emit } = setup(fakeSession('u1'), getProfile as never)
    await waitFor(() => expect(result.current.profile?.display_name).toBe('Ana'))
    act(() => emit('SIGNED_OUT', null))
    act(() => emit('SIGNED_IN', fakeSession('u1')))
    expect(result.current.profile).toBeNull()
    expect(result.current.profileStatus).toBe('loading')
    await act(async () => resolveSecond(profileRow('u1', 'Ana')))
    expect(result.current.profile?.display_name).toBe('Ana')
  })

  it('signOut discards a remembered post-login destination', async () => {
    const { result, auth } = setup(fakeSession('u1'))
    await waitFor(() => expect(result.current.status).toBe('signed_in'))
    rememberNext('/invite/abc')
    await act(async () => result.current.signOut())
    expect(window.localStorage.getItem(NEXT_STORAGE_KEY)).toBeNull()
    expect(auth.signOut).toHaveBeenCalledTimes(1)
  })

  it('signOut calls the client and surfaces its error', async () => {
    const { result, auth } = setup(fakeSession('u1'))
    await waitFor(() => expect(result.current.status).toBe('signed_in'))
    await act(async () => result.current.signOut())
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    await waitFor(() => expect(result.current.status).toBe('signed_out'))
    auth.signOut.mockResolvedValueOnce({ error: new Error('nope') })
    await expect(result.current.signOut()).rejects.toThrow('nope')
  })

  it('signInWithEmail goes through validation and the client', async () => {
    const { result, auth } = setup()
    await waitFor(() => expect(result.current.status).toBe('signed_out'))
    await expect(result.current.signInWithEmail('bad')).rejects.toMatchObject({ kind: 'invalid_email' })
    await result.current.signInWithEmail('A@b.co')
    expect(auth.signInWithOtp).toHaveBeenCalledWith(expect.objectContaining({ email: 'a@b.co' }))
    await result.current.signInWithEmail('A@b.co', 'tok-1')
    expect(auth.signInWithOtp).toHaveBeenLastCalledWith(
      expect.objectContaining({ options: expect.objectContaining({ captchaToken: 'tok-1' }) }),
    )
  })

  it('useAuth outside the provider throws', () => {
    const Probe = () => {
      useAuth()
      return null
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/AuthProvider/)
    spy.mockRestore()
  })

  it('renders children', async () => {
    const fake = createFakeAuth()
    render(
      <AuthProvider client={fake.client as Db} profiles={{ get: async () => null }}>
        <p>hola</p>
      </AuthProvider>,
    )
    expect(screen.getByText('hola')).toBeInTheDocument()
    await waitFor(() => expect(fake.auth.getSession).toHaveBeenCalled())
  })
})
