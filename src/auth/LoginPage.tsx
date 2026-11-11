import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { accentStyle, parseBannerUrl, parseLogoUrl } from '../campaign/branding'
import { BrandMark } from '../components/BrandMark'
import type { PublicInvitePreview } from '../data'
import { AuthFlowError } from './authErrors'
import { LoginBusyContext } from './loginBusy'

export interface LoginPageProps {
  onGoogle: () => Promise<void>
  /** Hides the Google button (see isGoogleEnabled). */
  googleEnabled?: boolean
  /** Invitation preview (from `?next=/invite/:code`). Absent while loading, on failure, or without an invitation: generic login. */
  invite?: { status: 'ready'; preview: PublicInvitePreview }
  /** Clock for the expiry text (tests). */
  now?: Date
  /** Development aid slot (DevEmailLogin), rendered inside the card after the note. Absent in production. */
  devLogin?: ReactNode
}

type Phase = { name: 'idle' } | { name: 'redirecting'; handedOff: boolean } | { name: 'error'; message: string }

/** If the page is still here this long after handing off to Google, let the user try again. */
export const REDIRECT_RESET_MS = 10000

// Only our own typed errors carry user-presentable text; anything else gets a generic message.
const messageOf = (e: unknown) => (e instanceof AuthFlowError ? e.message : 'No pudimos iniciar sesión. Volvé a intentar.')

const DAY_MS = 86_400_000

/** «Invitación válida N días más» / «1 día más» / «Vence hoy»; null when the invite never expires. */
export function expiryText(expiresAt: string | null, now: Date): string | null {
  if (!expiresAt) return null
  const end = new Date(expiresAt)
  if (Number.isNaN(end.getTime())) return null
  const diff = end.getTime() - now.getTime()
  if (diff <= 0 || end.toDateString() === now.toDateString()) return 'Vence hoy'
  const days = Math.ceil(diff / DAY_MS)
  return days === 1 ? 'Invitación válida 1 día más' : `Invitación válida ${days} días más`
}

/** Presentational: all behavior comes in through props. */
export function LoginPage({ onGoogle, googleEnabled = true, invite, now, devLogin }: LoginPageProps) {
  // The dev form (separate module) reports a magic-link send in flight through this ref.
  const devBusy = useRef(false)
  const setDevBusy = useMemo(() => (b: boolean) => void (devBusy.current = b), [])
  const [phase, setPhase] = useState<Phase>({ name: 'idle' })
  const busy = phase.name === 'redirecting'

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

  async function google() {
    if (busy || inFlight.current || devBusy.current) return
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
        // failure, unless the user already moved on (e.g. is sending a dev magic link).
        setPhase((p) => (p.name === 'idle' && !devBusy.current ? error : p))
      }
    }
  }

  const preview = invite?.preview
  const accent = preview ? accentStyle({ accent_color: preview.accent_color } as Parameters<typeof accentStyle>[0]) : undefined
  const banner = parseBannerUrl(preview?.banner_url)
  const logo = parseLogoUrl(preview?.logo_url)
  const expiry = preview ? expiryText(preview.expires_at, now ?? new Date()) : null
  const meta = [preview?.tagline, expiry].filter(Boolean).join(' · ')

  return (
    <LoginBusyContext.Provider value={{ googleBusy: busy, setDevBusy }}>
      <div className="min-h-screen flex flex-col bg-bg-deep text-txt-primary">
        <header className="px-4 sm:px-7 py-5 border-b border-border-base flex items-center gap-3">
          <BrandMark size={24} />
          <span className="brand-gradient-text font-exo font-bold text-xs tracking-[0.3em] uppercase">RPG Quester</span>
        </header>
        <div className="relative flex-1 grid place-items-center px-4 py-10 overflow-hidden bg-bg-mid">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 brand-gradient-bg opacity-[0.22]" />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(ellipse 70% 60% at 30% 100%, rgba(6,6,6,.95) 0%, transparent 70%)' }}
          />
          <BrandMark size={460} className="pointer-events-none absolute -right-16 top-10 opacity-[0.18] hidden sm:block" />
          <section
            aria-labelledby="login-title"
            style={accent}
            className="relative z-10 w-full max-w-[440px] bg-bg-card border border-border-base"
          >
            {preview ? (
              <div className="relative overflow-hidden flex items-center gap-4 px-5 sm:px-7 pt-7 pb-6 border-b border-border-base border-t-[3px] border-t-accent">
                {banner && (
                  <>
                    <img
                      src={banner}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.35]"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0"
                      style={{ background: 'linear-gradient(90deg, rgba(17,17,17,.92) 0%, rgba(17,17,17,.7) 55%, rgba(17,17,17,.35) 100%)' }}
                    />
                  </>
                )}
                {logo ? (
                  <img src={logo} alt="" referrerPolicy="no-referrer" className="relative h-14 w-14 flex-none object-cover border border-accent-dim" />
                ) : (
                  <div
                    aria-hidden="true"
                    className="relative grid h-14 w-14 flex-none place-items-center border border-accent-dim bg-accent-subtle font-cinzel text-[26px] text-accent-bright"
                  >
                    {Array.from(preview.campaign_name.trim())[0]?.toUpperCase() ?? '?'}
                  </div>
                )}
                <div className="relative min-w-0">
                  <p className="font-exo text-[10px] tracking-[0.2em] uppercase text-txt-secondary mb-1">Te invitaron a</p>
                  <p className="font-cinzel text-[22px] leading-tight break-words">{preview.campaign_name}</p>
                  {meta && <p className={`mt-1 text-[13px] ${banner ? 'text-[#b0b0b0]' : 'text-txt-secondary'}`}>{meta}</p>}
                </div>
              </div>
            ) : (
              <div aria-hidden="true" className="h-[3px] bg-[color:var(--brand-2)]" />
            )}
            <div className="px-5 sm:px-7 pt-6 pb-7">
              <h1 id="login-title" className="font-exo text-base font-semibold tracking-[0.15em] uppercase mb-2">
                {preview ? 'Ingresá para unirte' : 'Ingresar'}
              </h1>
              <p className="text-sm leading-normal text-txt-secondary mb-5">
                {preview
                  ? 'Entrá con Google y volvés directo a la invitación para confirmar.'
                  : 'Entrá con tu cuenta de Google para ver tus campañas.'}
              </p>
              {googleEnabled ? (
                <button
                  type="button"
                  onClick={google}
                  disabled={busy}
                  aria-busy={redirecting}
                  className={`flex w-full min-h-12 items-center justify-center gap-3 px-4 font-exo text-xs font-semibold uppercase tracking-[0.1em] text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-txt-primary disabled:cursor-progress disabled:opacity-80 ${
                    preview ? 'bg-accent hover:bg-accent-bright' : 'brand-gradient-bg hover:brightness-110'
                  }`}
                >
                  <span aria-hidden="true" className="grid h-7 w-7 flex-none place-items-center bg-white">
                    {redirecting ? (
                      <span className="h-4 w-4 rounded-full border-2 border-[#ddd] border-t-[color:var(--brand-2)] motion-safe:animate-spin" />
                    ) : (
                      <GoogleG />
                    )}
                  </span>
                  <span>{redirecting ? 'Redirigiendo a Google…' : phase.name === 'error' ? 'Intentar de nuevo' : 'Continuar con Google'}</span>
                </button>
              ) : (
                !devLogin && <p className="text-sm text-txt-secondary">El ingreso con Google no está disponible en este entorno.</p>
              )}
              {phase.name === 'error' && (
                <p role="alert" className="mt-4 border border-accent-dim bg-accent-subtle px-3.5 py-3 text-[13px] leading-normal">
                  <strong className="block text-accent-bright mb-0.5">No pudimos iniciar sesión.</strong>
                  {phase.message}
                  {preview && ` No perdiste la invitación: volvé a intentar y te llevamos de nuevo a ${preview.campaign_name}.`}
                </p>
              )}
              {preview && (
                <ol aria-label="Qué pasa después" className="mt-5 grid gap-2 text-[13px] leading-snug text-txt-secondary">
                  {['Elegís tu cuenta de Google.', 'Volvés acá y confirmás «Unirme».', 'El DM te asigna tu personaje.'].map((step, i) => (
                    <li key={step} className="flex gap-2.5">
                      <span aria-hidden="true" className="grid h-5 w-5 flex-none place-items-center border border-border-light font-exo text-[11px] text-txt-primary">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              )}
              <p className="mt-5 text-xs leading-relaxed text-txt-secondary">
                Solo usamos tu nombre, email y foto de Google. Nada se publica en tu cuenta.
              </p>
              {devLogin}
            </div>
          </section>
        </div>
      </div>
    </LoginBusyContext.Provider>
  )
}

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}
