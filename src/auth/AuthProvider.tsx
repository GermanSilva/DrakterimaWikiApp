import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { createProfileRepository, getSupabase, type Db, type Profile, type ProfileRepository } from '../data'
import { requestMagicLink, startGoogleSignIn } from './authActions'
import { AuthContext, type AuthValue } from './AuthContext'

export interface AuthProviderProps {
  children: ReactNode
  /** Defaults to the shared client (getSupabase()). Must be referentially stable. */
  client?: Db
  /** Defaults to createProfileRepository(client). Must be referentially stable. */
  profiles?: Pick<ProfileRepository, 'get'>
}

interface LoadedProfile {
  userId: string
  profile: Profile | null
  error: Error | null
}

const asError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)))

export function AuthProvider({ children, client: clientProp, profiles: profilesProp }: AuthProviderProps) {
  const client = useMemo(() => clientProp ?? getSupabase(), [clientProp])
  const profiles = useMemo(() => profilesProp ?? createProfileRepository(client), [profilesProp, client])

  const [session, setSession] = useState<Session | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [loaded, setLoaded] = useState<LoadedProfile | null>(null)
  // Bumped on SIGNED_OUT and on a SIGNED_IN that changes who is signed in, so a batched
  // same-user SIGNED_OUT + SIGNED_IN (userId unchanged for React) still reloads the profile.
  // (supabase-js also emits SIGNED_IN for the same user on tab refocus: that must not refetch.)
  const [generation, setGeneration] = useState(0)
  const userId = session?.user.id ?? null
  const userIdRef = useRef(userId)
  const eventUserRef = useRef<string | null>(null)
  // Every profile read takes a ticket; only the latest ticket may write state, so an older read
  // (initial or refresh) can never override a newer one, and a late failure never beats a success.
  const readSeq = useRef(0)
  useEffect(() => {
    userIdRef.current = userId
  }, [userId])

  // One subscription for the provider's lifetime. The callback only sets state (supabase-js
  // can deadlock if auth calls are awaited inside it). INITIAL_SESSION reports the stored session;
  // getSession() is the explicit fallback, ignored once any event has been seen.
  useEffect(() => {
    let cancelled = false
    let sawEvent = false
    const { data } = client.auth.onAuthStateChange((event, next) => {
      sawEvent = true
      if (cancelled) return
      const nextId = next?.user.id ?? null
      if (event === 'SIGNED_OUT' || (event === 'SIGNED_IN' && nextId !== eventUserRef.current)) {
        setGeneration((g) => g + 1)
      }
      eventUserRef.current = nextId
      setSession(next)
      // Forget the cached profile on sign-out so a same-user re-login never flashes stale data.
      if (!next) setLoaded(null)
      setInitialized(true)
    })
    client.auth
      .getSession()
      .then(({ data: { session: current } }) => {
        if (cancelled || sawEvent) return
        eventUserRef.current = current?.user.id ?? null
        setSession(current)
        setInitialized(true)
      })
      .catch(() => {
        if (cancelled || sawEvent) return
        setSession(null)
        setInitialized(true)
      })
    return () => {
      cancelled = true
      data.subscription.unsubscribe()
    }
  }, [client])

  // Profile follows the user id and the sign-in generation. Cleanup invalidates the ticket, so a
  // response for a previous user/sign-in is dropped; the derived value below also ignores a
  // profile that belongs to another user.
  useEffect(() => {
    if (!userId) return
    const seq = readSeq
    const ticket = ++seq.current
    profiles.get(userId).then(
      (profile) => {
        if (seq.current === ticket) setLoaded({ userId, profile, error: null })
      },
      (e: unknown) => {
        if (seq.current === ticket) setLoaded({ userId, profile: null, error: asError(e) })
      },
    )
    return () => {
      seq.current++
    }
  }, [userId, generation, profiles])

  const refreshProfile = useCallback(async () => {
    const id = userIdRef.current
    if (!id) return
    const ticket = ++readSeq.current
    try {
      const profile = await profiles.get(id)
      if (readSeq.current === ticket && userIdRef.current === id) setLoaded({ userId: id, profile, error: null })
    } catch (e) {
      // Never rejects: callers fire-and-forget. Keep the last known profile, surface the error.
      if (readSeq.current === ticket && userIdRef.current === id) {
        setLoaded((prev) => ({ userId: id, profile: prev?.userId === id ? prev.profile : null, error: asError(e) }))
      }
    }
  }, [profiles])

  const signInWithEmail = useCallback(
    (email: string, captchaToken?: string) => requestMagicLink(client, email, captchaToken),
    [client],
  )
  const signInWithGoogle = useCallback(() => startGoogleSignIn(client), [client])
  const signOut = useCallback(async () => {
    const { error } = await client.auth.signOut({ scope: 'local' })
    if (error) throw error
  }, [client])

  const value = useMemo<AuthValue>(() => {
    const current = loaded && loaded.userId === userId ? loaded : null
    return {
      status: !initialized ? 'loading' : session ? 'signed_in' : 'signed_out',
      session,
      user: session?.user ?? null,
      profile: current?.profile ?? null,
      profileError: current?.error ?? null,
      profileStatus: !userId ? 'idle' : !current ? 'loading' : current.error ? 'error' : 'loaded',
      signInWithEmail,
      signInWithGoogle,
      signOut,
      refreshProfile,
    }
  }, [initialized, session, loaded, userId, signInWithEmail, signInWithGoogle, signOut, refreshProfile])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
