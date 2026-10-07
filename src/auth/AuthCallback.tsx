import { useEffect, useRef, useState } from 'react'
import { btnSecondary } from '../constants'
import { getSupabase, type Db } from '../data'
import { completeAuthCallback } from './completeAuthCallback'

export interface AuthCallbackProps {
  /**
   * Called after a successful sign-in with the path to show next. Always '/' for now (no
   * caller-supplied `next`, so the callback can never become an open redirect); also called with
   * '/' when the user dismisses an error.
   */
  onDone: (path: string) => void
  /** Defaults to the shared client. */
  client?: Db
}

/** Mounted at /auth/callback by the router (H6). Safe under React StrictMode (single execution). */
export function AuthCallback({ onDone, client }: AuthCallbackProps) {
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)
  const mounted = useRef(false)
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    mounted.current = true
    // The code/token can be used once: a StrictMode remount must not run the exchange again.
    if (!started.current) {
      started.current = true
      completeAuthCallback(client ?? getSupabase()).then(
        (result) => {
          if (!mounted.current) return
          if (result.ok) onDoneRef.current('/')
          else setError(result.message)
        },
        () => {
          if (mounted.current) setError('No pudimos completar el inicio de sesión. Pedí un link nuevo.')
        },
      )
    }
    return () => {
      mounted.current = false
    }
  }, [client])

  if (error) {
    return (
      <div role="alert" className="max-w-sm mx-auto mt-24 px-4 text-center">
        <p className="text-sm text-txt-secondary mb-4">{error}</p>
        <button type="button" className={btnSecondary} onClick={() => onDone('/')}>
          Volver al inicio
        </button>
      </div>
    )
  }
  return (
    <p role="status" className="text-center text-sm text-txt-muted mt-24">
      Completando el inicio de sesión…
    </p>
  )
}
