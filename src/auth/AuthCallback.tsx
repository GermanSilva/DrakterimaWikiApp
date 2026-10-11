import { useEffect, useRef, useState } from 'react'
import { btnSecondary } from '../constants'
import { getSupabase, type Db } from '../data'
import { CALLBACK_GENERIC, completeAuthCallback } from './completeAuthCallback'
import { clearNext, consumeNext } from './postLoginRedirect'

/** How long to wait for the code exchange before showing the error state with a way out. */
export const CALLBACK_TIMEOUT_MS = 15000
export const CALLBACK_TIMEOUT_MESSAGE = 'Está tardando más de lo normal. Pedí un link nuevo o volvé a intentar en unos minutos.'

export interface AuthCallbackProps {
  /**
   * Called after a successful sign-in with the path to show next: the one-shot destination the
   * login page stored (postLoginRedirect, re-validated, 30 min TTL) or '/'. No URL parameter of
   * the callback is ever read, so the callback cannot become an open redirect. Called with '/'
   * when the user dismisses an error.
   */
  onDone: (path: string) => void
  /** Defaults to the shared client. */
  client?: Db
}

/** Mounted at /auth/callback by the router (H6). Safe under React StrictMode (single execution). */
export function AuthCallback({ onDone, client }: AuthCallbackProps) {
  const [error, setError] = useState<string | null>(null)
  // The exchange succeeded only after the timeout error was shown.
  const [lateSuccess, setLateSuccess] = useState(false)
  const started = useRef(false)
  const mounted = useRef(false)
  const settled = useRef(false)
  const doneCalled = useRef(false)
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  /**
   * onDone fires at most once, whichever path (success or the back button) gets there first. After
   * a success the destination is the one-shot value the login page stored (else '/'); a dismissed
   * error discards it.
   */
  const finish = (signedIn: boolean) => {
    if (doneCalled.current) return
    doneCalled.current = true
    if (!signedIn) clearNext()
    onDoneRef.current(signedIn ? consumeNext() : '/')
  }

  useEffect(() => {
    mounted.current = true
    // The code/token can be used once: a StrictMode remount must not run the exchange again.
    if (!started.current) {
      started.current = true
      completeAuthCallback(client ?? getSupabase()).then(
        (result) => {
          if (!mounted.current) return
          // After the timeout error is shown there is no automatic navigation: a late success
          // swaps the error for a "you are signed in" state with an explicit button.
          if (settled.current) {
            if (result.ok) setLateSuccess(true)
            return
          }
          settled.current = true
          if (result.ok) finish(true)
          else setError(result.message)
        },
        () => {
          if (mounted.current && !settled.current) {
            settled.current = true
            setError(CALLBACK_GENERIC)
          }
        },
      )
    }
    return () => {
      mounted.current = false
    }
  }, [client])

  // Separate effect so it is recreated (not lost) by a StrictMode remount.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (settled.current) return
      settled.current = true
      setError(CALLBACK_TIMEOUT_MESSAGE)
    }, CALLBACK_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [])

  if (lateSuccess) {
    return (
      <div role="status" className="max-w-sm mx-auto mt-24 px-4 text-center">
        <p className="text-sm text-txt-secondary mb-4">Ya iniciaste sesión.</p>
        <button type="button" className={btnSecondary} onClick={() => finish(true)}>
          Continuar
        </button>
      </div>
    )
  }
  if (error) {
    return (
      <div role="alert" className="max-w-sm mx-auto mt-24 px-4 text-center">
        <p className="text-sm text-txt-secondary mb-4">{error}</p>
        <button type="button" className={btnSecondary} onClick={() => finish(false)}>
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
