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
  const userId = session?.user.id ?? null
  const userIdRef = useRef(userId)
  useEffect(() => {
    userIdRef.current = userId
  }, [userId])

  // One subscription for the provider's lifetime. The callback only sets state (supabase-js
  // can deadlock if auth calls are awaited inside it). INITIAL_SESSION reports the stored session;
  // getSession() is the explicit fallback, ignored once any event has been seen.
  useEffect(() => {
    let cancelled = false
    let sawEvent = false
    const { data } = client.auth.onAuthStateChange((_event, next) => {
      sawEvent = true
      if (cancelled) return
      setSession(next)
      // Forget the cached profile on sign-out so a same-user re-login never flashes stale data.
      if (!next) setLoaded(null)
      setInitialized(true)
    })
    client.auth
      .getSession()
      .then(({ data: { session: current } }) => {
        if (cancelled || sawEvent) return
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

  // Profile follows the user id. A stale response (user switched or signed out meanwhile) is
  // dropped by the cancel flag; the derived value below also ignores a profile of another user.
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    profiles.get(userId).then(
      (profile) => {
        if (!cancelled) setLoaded({ userId, profile, error: null })
      },
      (e: unknown) => {
        if (!cancelled) setLoaded({ userId, profile: null, error: asError(e) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [userId, profiles])

  const refreshProfile = useCallback(async () => {
    const id = userIdRef.current
    if (!id) return
    try {
      const profile = await profiles.get(id)
      if (userIdRef.current === id) setLoaded({ userId: id, profile, error: null })
    } catch (e) {
      // Never rejects: callers fire-and-forget. Keep the last known profile, surface the error.
      if (userIdRef.current === id) {
        setLoaded((prev) => ({ userId: id, profile: prev?.userId === id ? prev.profile : null, error: asError(e) }))
      }
    }
  }, [profiles])

  const signInWithEmail = useCallback((email: string) => requestMagicLink(client, email), [client])
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
