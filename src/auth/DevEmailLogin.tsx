import { useEffect, useId, useState, type FormEvent } from 'react'
import { btnSecondary, inputCls, labelCls } from '../constants'
import { AuthFlowError } from './authErrors'
import { useLoginBusy } from './loginBusy'

type Phase = { name: 'idle' } | { name: 'sending' } | { name: 'sent'; email: string } | { name: 'error'; message: string }

// Only our own typed errors carry user-presentable text; anything else gets a generic message.
const messageOf = (e: unknown) => (e instanceof AuthFlowError ? e.message : 'No pudimos iniciar sesión. Volvé a intentar.')

/**
 * Development aid: magic-link form. Only ConnectedLoginPage references it, under import.meta.env.DEV,
 * so Vite drops this module (and its copy) from production builds. Rendered through LoginPage's `devLogin` slot.
 */
export function DevEmailLogin({ onSubmit }: { onSubmit: (email: string) => Promise<void> }) {
  const emailId = useId()
  const headingId = useId()
  const { googleBusy, setDevBusy } = useLoginBusy()
  const [email, setEmail] = useState('')
  const [phase, setPhase] = useState<Phase>({ name: 'idle' })
  const sending = phase.name === 'sending'
  const busy = sending || googleBusy

  useEffect(() => {
    setDevBusy(sending)
    return () => setDevBusy(false)
  }, [sending, setDevBusy])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setPhase({ name: 'sending' })
    try {
      await onSubmit(email)
      setPhase({ name: 'sent', email: email.trim().toLowerCase() })
    } catch (err) {
      setPhase({ name: 'error', message: messageOf(err) })
    }
  }

  return (
    <section aria-labelledby={headingId} className="mt-8 pt-5 border-t border-border-base">
      <h2 id={headingId} className="text-xs uppercase tracking-wider text-txt-secondary mb-3">
        Ingreso de desarrollo (solo local)
      </h2>
      {phase.name === 'sent' ? (
        <div>
          <h3 className="font-exo text-sm font-semibold tracking-[0.15em] uppercase text-txt-primary mb-2">Revisá tu email</h3>
          <p role="status" className="text-sm text-txt-secondary mb-3">
            Te enviamos un link a <strong>{phase.email}</strong>. Abrilo en este mismo navegador para entrar; puede tardar un minuto en llegar.
          </p>
          <button type="button" className={btnSecondary} onClick={() => setPhase({ name: 'idle' })}>
            Usar otro email
          </button>
        </div>
      ) : (
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
          <button type="submit" className={`${btnSecondary} w-full justify-center mt-3`} disabled={busy}>
            {sending ? 'Enviando…' : 'Enviar link mágico'}
          </button>
          {phase.name === 'error' && (
            <p role="alert" className="mt-3 text-sm text-accent-bright">
              {phase.message}
            </p>
          )}
        </form>
      )}
    </section>
  )
}
