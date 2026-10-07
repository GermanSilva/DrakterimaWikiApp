import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { Profile } from '../data'

export type AuthStatus = 'loading' | 'signed_out' | 'signed_in'

export interface AuthValue {
  status: AuthStatus
  session: Session | null
  user: User | null
  /**
   * Null while the first load runs, when signed out, or when the FIRST load failed. After a failed
   * refresh it keeps the last known profile while profileError / profileStatus report the failure.
   */
  profile: Profile | null
  profileError: Error | null
  /** idle: signed out; loading: first fetch for this user; loaded; error (profile may hold the last known value). */
  profileStatus: 'idle' | 'loading' | 'loaded' | 'error'
  /** Sends a magic link. Throws AuthFlowError (invalid_email, rate_limited, ...). */
  signInWithEmail: (email: string) => Promise<void>
  /** Starts the Google OAuth redirect. Throws AuthFlowError (provider_disabled, ...). */
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  /** Re-reads the signed-in user's profile (e.g. after editing it). Never rejects: failures set profileError. */
  refreshProfile: () => Promise<void>
}

export const AuthContext = createContext<AuthValue | null>(null)
