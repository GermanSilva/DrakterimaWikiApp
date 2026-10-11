import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { btnPrimary, btnSecondary, inputCls, labelCls } from '../constants'
import { AuthFlowError } from './authErrors'
import { useTurnstile, type TurnstileStatus } from './turnstile/useTurnstile'

export interface LoginPageProps {
  /** `captchaToken` is passed only when a Turnstile site key is configured. */
  onEmailSubmit: (email: string, captchaToken?: string) => Promise<void>
  onGoogle: () => Promise<void>
  /** Hides the Google button (see isGoogleEnabled). */
  googleEnabled?: boolean
  /** Public Turnstile site key. Absent/blank: no widget and no token (captcha not configured). */
  turnstileSiteKey?: string | null
}

type Phase =
  | { name: 'idle' }
  | { name: 'sending' }
  | { name: 'redirecting'; handedOff: boolean }
  | { name: 'sent'; email: string }
  | { name: 'error'; message: string }

/** If the page is still here this long after handing off to Google, let the user try again. */
export const REDIRECT_RESET_MS = 10000

// Only our own typed errors carry user-presentable text; anything else gets a generic message.
const messageOf = (e: unknown) => (e instanceof AuthFlowError ? e.message : 'No pudimos iniciar sesión. Volvé a intentar.')

const CAPTCHA_MESSAGES: Partial<Record<TurnstileStatus, string>> = {
  expired: 'La verificación de seguridad venció.',
  error: 'La verificación de seguridad falló.',
  load_failed:
    'No pudimos cargar la verificación de seguridad. Revisá tu conexión o desactivá el bloqueador de contenido y volvé a intentar.',
}

/** Presentational: all behavior comes in through props. */
export function LoginPage({ onEmailSubmit, onGoogle, googleEnabled = true, turnstileSiteKey }: LoginPageProps) {
  const emailId = useId()
  const [email, setEmail] = useState('')
  const [phase, setPhase] = useState<Phase>({ name: 'idle' })
  const busy = phase.name === 'sending' || phase.name === 'redirecting'
  const { attach: attachCaptcha, token: captchaToken, status: captchaStatus, reset: resetCaptcha } = useTurnstile({
    siteKey: turnstileSiteKey,
  })
  const captchaRequired = captchaStatus !== 'disabled'
  // With a site key configured, the magic link needs a token; never fall back to sending without one.
  const awaitingCaptcha = captchaRequired && !captchaToken
  const captchaMessage = CAPTCHA_MESSAGES[captchaStatus]

  // While handing off to Google: leave the busy state when the page is restored from the
  // back/forward cache (pageshow, persisted) or if navigation never happened (timeout).
  // The timer only starts once onGoogle resolved (the probe itself can take a few seconds).
  const redirecting = phase.name === 'redirecting'
  const handedOff = phase.name === 'redirecting' && phase.handedOff
  // inFlight: set from the first Google click until the attempt fails or the page is reset, so a
  // second click (even before React re-renders) never starts a second OAuth flow. attempt: a late
  // rejection from an earlier attempt must not override a newer phase.
  const inFlight = useRef(false)
  const attempt = useRef(0)
  // lastStarted: the newest attempt started by a click (resets bump `attempt` but not this one), so a
  // late failure of an attempt abandoned by a reset can still be shown when nothing newer started.
  const lastStarted = useRef(0)
  useEffect(() => {
    if (!redirecting) return
    const reset = () => {
      attempt.current++ // anything the abandoned attempt reports later is stale
      inFlight.current = false
      setPhase({ name: 'idle' })
    }
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) reset()
    }
    window.addEventListener('pageshow', onPageShow)
    const timer = handedOff ? setTimeout(reset, REDIRECT_RESET_MS) : undefined
    return () => {
      window.removeEventListener('pageshow', onPageShow)
      clearTimeout(timer)
    }
  }, [redirecting, handedOff])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy || awaitingCaptcha) return
    setPhase({ name: 'sending' })
    try {
      // Without a site key the call is exactly the pre-captcha one (no second argument).
      if (captchaToken) await onEmailSubmit(email, captchaToken)
      else await onEmailSubmit(email)
      setPhase({ name: 'sent', email: email.trim().toLowerCase() })
    } catch (err) {
      setPhase({ name: 'error', message: messageOf(err) })
    } finally {
      // Tokens are single-use: whatever the outcome, the next attempt needs a fresh one.
      if (captchaRequired) resetCaptcha()
    }
  }

  async function google() {
    if (busy || inFlight.current) return
    inFlight.current = true
    const mine = ++attempt.current
    lastStarted.current = mine
    setPhase({ name: 'redirecting', handedOff: false })
    try {
      await onGoogle()
      // The browser is navigating to Google; stay in 'redirecting' until the page unloads
      // (or the effect above resets it). A late resolve after a reset is ignored.
      if (attempt.current === mine) setPhase({ name: 'redirecting', handedOff: true })
    } catch (err) {
      if (lastStarted.current !== mine) return // stale: a newer attempt owns the state
      inFlight.current = false
      const error: Phase = { name: 'error', message: messageOf(err) }
      if (attempt.current === mine) {
        setPhase(error)
      } else {
        // Abandoned by a reset (timeout / bfcache) but nothing newer started: still surface the
        // failure, unless the user already moved on (e.g. is sending a magic link).
        setPhase((p) => (p.name === 'idle' ? error : p))
      }
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
      {googleEnabled && (
        <>
          <button type="button" className={`${btnPrimary} w-full justify-center`} onClick={google} disabled={busy}>
            {phase.name === 'redirecting' ? 'Redirigiendo a Google…' : 'Continuar con Google'}
          </button>
          <div className="flex items-center gap-3 my-5 text-xs text-txt-muted" role="separator">
            <span className="flex-1 border-t border-border-base" />
            <span>o con tu email</span>
            <span className="flex-1 border-t border-border-base" />
          </div>
        </>
      )}
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
        {captchaRequired && (
          <div className="mt-3">
            <div ref={attachCaptcha} data-testid="turnstile-container" />
            {captchaMessage ? (
              <p role="alert" className="text-sm text-accent-bright">
                {captchaMessage}{' '}
                <button type="button" className="underline" onClick={() => resetCaptcha()}>
                  Reintentar
                </button>
              </p>
            ) : (
              awaitingCaptcha && (
                <p role="status" className="text-xs text-txt-secondary">
                  Verificando que no seas un robot…
                </p>
              )
            )}
          </div>
        )}
        <button type="submit" className={`${googleEnabled ? btnSecondary : btnPrimary} w-full justify-center mt-3`} disabled={busy || awaitingCaptcha}>
          {phase.name === 'sending' ? 'Enviando…' : 'Enviar link mágico'}
        </button>
        {googleEnabled && (
          <p className="mt-3 text-xs text-txt-muted">
            El email puede llegar a la carpeta de spam y tardar un minuto. Si no lo ves, revisá ahí.
          </p>
        )}
      </form>
      {phase.name === 'error' && (
        <p role="alert" className="mt-4 text-sm text-accent-bright">
          {phase.message}
        </p>
      )}
    </div>
  )
}
