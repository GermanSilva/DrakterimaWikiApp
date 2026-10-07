import { useId, useState, type FormEvent } from 'react'
import { btnPrimary, btnSecondary, inputCls, labelCls } from '../constants'
import { AuthFlowError } from './authErrors'

export interface LoginPageProps {
  onEmailSubmit: (email: string) => Promise<void>
  onGoogle: () => Promise<void>
  /** Hides the Google button (see isGoogleEnabled). */
  googleEnabled?: boolean
}

type Phase = { name: 'idle' } | { name: 'sending' } | { name: 'sent'; email: string } | { name: 'error'; message: string }

// Only our own typed errors carry user-presentable text; anything else gets a generic message.
const messageOf = (e: unknown) => (e instanceof AuthFlowError ? e.message : 'No pudimos iniciar sesión. Volvé a intentar.')

/** Presentational: all behavior comes in through props. */
export function LoginPage({ onEmailSubmit, onGoogle, googleEnabled = true }: LoginPageProps) {
  const emailId = useId()
  const [email, setEmail] = useState('')
  const [phase, setPhase] = useState<Phase>({ name: 'idle' })
  const busy = phase.name === 'sending'

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setPhase({ name: 'sending' })
    try {
      await onEmailSubmit(email)
      setPhase({ name: 'sent', email: email.trim().toLowerCase() })
    } catch (err) {
      setPhase({ name: 'error', message: messageOf(err) })
    }
  }

  async function google() {
    if (busy) return
    setPhase({ name: 'sending' })
    try {
      await onGoogle()
      // The browser is navigating to Google; keep the busy state until the page unloads.
    } catch (err) {
      setPhase({ name: 'error', message: messageOf(err) })
    }
  }

  if (phase.name === 'sent') {
    return (
      <div className="max-w-sm mx-auto mt-24 px-4 text-center">
        <h1 className="font-exo text-lg font-semibold tracking-[0.15em] uppercase text-txt-primary mb-3">Revisá tu email</h1>
        <p role="status" className="text-sm text-txt-secondary mb-5">
          Te enviamos un link a <strong>{phase.email}</strong>. Abrilo en este mismo navegador para entrar; puede tardar un minuto en llegar.
        </p>
        <button type="button" className={btnSecondary} onClick={() => setPhase({ name: 'idle' })}>
          Usar otro email
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-sm mx-auto mt-24 px-4">
      <h1 className="font-exo text-lg font-semibold tracking-[0.15em] uppercase text-txt-primary mb-5 text-center">
        Ingresar
      </h1>
      <form onSubmit={submit} noValidate>
        <label htmlFor={emailId} className={labelCls}>
          Email
        </label>
        <input
          id={emailId}
          type="email"
          autoComplete="email"
          inputMode="email"
          className={inputCls}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
          aria-invalid={phase.name === 'error'}
          required
        />
        <button type="submit" className={`${btnPrimary} w-full justify-center mt-3`} disabled={busy}>
          {busy ? 'Enviando…' : 'Enviar link mágico'}
        </button>
      </form>
      {googleEnabled && (
        <button type="button" className={`${btnSecondary} w-full justify-center mt-3`} onClick={google} disabled={busy}>
          Continuar con Google
        </button>
      )}
      {phase.name === 'error' && (
        <p role="alert" className="mt-4 text-sm text-accent-bright">
          {phase.message}
        </p>
      )}
    </div>
  )
}
