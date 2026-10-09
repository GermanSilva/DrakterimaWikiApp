import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { btnPrimary, btnSecondary } from '../constants'
import { useHubData } from '../app/DataContext'
import { parseLogoUrl } from '../campaign/branding'
import type { InvitePreview } from '../data'
import {
  acceptInviteErrorMessage,
  INVITE_MESSAGES,
  isFinalInviteError,
  normalizeInviteCode,
  PRESENCE_NOTICE,
  previewInviteErrorMessage,
} from './campaignSlug'

type LandingState =
  | { status: 'loading' }
  | { status: 'ready'; preview: InvitePreview }
  | { status: 'error'; message: string; retryable: boolean }

function Title() {
  return <h1 className="font-exo text-xl font-semibold tracking-[0.15em] uppercase text-txt-primary mb-5">Invitación</h1>
}

function BackHome() {
  return (
    <Link to="/" className={btnSecondary}>
      Volver al inicio
    </Link>
  )
}

function InviteLanding({ code }: { code: string | null }) {
  const data = useHubData()
  const navigate = useNavigate()
  const [state, setState] = useState<LandingState>(
    code ? { status: 'loading' } : { status: 'error', message: INVITE_MESSAGES.invite_not_found, retryable: false },
  )
  const [attempt, setAttempt] = useState(0)
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  // Joining consumes a use of the invite: one request per click, even for a fast double click (state would lag).
  const joinStarted = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // Opening the page only PREVIEWS the invite (read-only); nothing is consumed until the user confirms.
  useEffect(() => {
    if (!code) return undefined
    let cancelled = false
    data.previewInvite(code).then(
      (preview) => {
        if (!cancelled) setState({ status: 'ready', preview })
      },
      (error) => {
        if (!cancelled) setState({ status: 'error', message: previewInviteErrorMessage(error), retryable: !isFinalInviteError(error) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [code, data, attempt])

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  function join() {
    if (!code || joinStarted.current) return
    joinStarted.current = true
    setJoining(true)
    setJoinError(null)
    data.acceptInvite(code).then(
      (result) => {
        if (!mounted.current) return
        navigate(`/c/${result.slug}`, { replace: true })
      },
      (error) => {
        joinStarted.current = false // the attempt failed without consuming the invite: the user may retry
        if (!mounted.current) return
        setJoining(false)
        const message = acceptInviteErrorMessage(error)
        // a definitive answer (expired, used up, character taken meanwhile) ends the landing; anything else may be retried
        if (isFinalInviteError(error)) setState({ status: 'error', message, retryable: false })
        else setJoinError(message)
      },
    )
  }

  if (state.status === 'loading') {
    return (
      <>
        <Title />
        <p role="status" className="text-sm text-txt-muted">
          Cargando la invitación…
        </p>
      </>
    )
  }

  if (state.status === 'error') {
    return (
      <>
        <Title />
        <div role="alert">
          <p className="text-sm text-accent-bright mb-4">{state.message}</p>
          <div className="flex gap-3">
            {state.retryable && (
              <button type="button" className={btnSecondary} onClick={retry}>
                Reintentar
              </button>
            )}
            <BackHome />
          </div>
        </div>
      </>
    )
  }

  const { preview } = state
  const logo = parseLogoUrl(preview.logo_url)
  const isDm = preview.role === 'dm'

  return (
    <>
      <Title />
      <section aria-labelledby="invite-campaign" className="bg-bg-card border border-border-base px-5 py-5">
        <div className="flex items-center gap-4 mb-4">
          {logo && <img src={logo} alt="" referrerPolicy="no-referrer" className="w-14 h-14 object-cover rounded" />}
          <div>
            <p className="font-exo text-[10px] tracking-[0.2em] uppercase text-txt-muted">Te invitaron a la campaña</p>
            <h2 id="invite-campaign" className="font-exo text-lg font-semibold text-txt-primary">
              {preview.campaign_name}
            </h2>
          </div>
        </div>

        {preview.nothing_to_do ? (
          <>
            <p role="status" className="text-sm text-txt-secondary mb-4">
              Ya sos parte de esta campaña.
            </p>
            <Link to={`/c/${preview.campaign_slug}`} className={btnPrimary}>
              Ir a la campaña
            </Link>
          </>
        ) : (
          <>
            <dl className="text-sm text-txt-secondary grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 mb-4">
              <dt className="text-txt-muted">Rol</dt>
              <dd>{isDm ? 'DM (Dungeon Master)' : 'Jugador'}</dd>
              {preview.character_name && (
                <>
                  <dt className="text-txt-muted">Personaje</dt>
                  <dd>{preview.character_name}</dd>
                </>
              )}
            </dl>
            {isDm && (
              <p role="note" className="text-[13px] text-accent-bright border border-accent-dim px-3 py-2 mb-4">
                Esta invitación te da el rol de DM: vas a poder ver y editar todo el contenido de la campaña, incluidas las notas privadas, y administrar a
                sus integrantes.
              </p>
            )}
            {preview.is_member && (
              <p className="text-[13px] text-txt-secondary mb-4">Ya sos parte de la campaña. Al aceptar vas a reclamar el personaje de esta invitación.</p>
            )}
            <p className="text-[12px] text-txt-muted mb-4">{PRESENCE_NOTICE}</p>
            {joinError && (
              <p role="alert" className="text-sm text-accent-bright mb-4">
                {joinError}
              </p>
            )}
            <div className="flex gap-3 items-center">
              <button type="button" className={btnPrimary} onClick={join} disabled={joining} aria-busy={joining}>
                {joining ? 'Uniéndote…' : 'Unirme'}
              </button>
              <BackHome />
            </div>
          </>
        )}
      </section>
    </>
  )
}

export function InvitePage() {
  const { code } = useParams()
  const normalized = code ? normalizeInviteCode(code) : null
  // key: a different code is a different invitation, with its own preview and its own single join.
  return <InviteLanding key={normalized ?? 'invalid'} code={normalized} />
}
