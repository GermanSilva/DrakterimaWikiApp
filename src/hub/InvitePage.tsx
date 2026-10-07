import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { btnSecondary } from '../constants'
import { useHubData } from '../app/DataContext'
import { acceptInviteErrorMessage, INVITE_MESSAGES, normalizeInviteCode } from './campaignSlug'

type InviteState = { status: 'pending' } | { status: 'joined' } | { status: 'error'; message: string }

function InviteAccept({ code }: { code: string | null }) {
  const data = useHubData()
  const navigate = useNavigate()
  const [state, setState] = useState<InviteState>(
    code ? { status: 'pending' } : { status: 'error', message: INVITE_MESSAGES.invite_not_found },
  )
  // Accepting consumes a use of the invite: exactly one call per mounted code, even under StrictMode's
  // mount → cleanup → mount. `mounted` is reset on every effect run so the surviving mount reports.
  const started = useRef(false)
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    if (code && !started.current) {
      started.current = true
      data.acceptInvite(code).then(
        (result) => {
          if (!mounted.current) return
          setState({ status: 'joined' })
          navigate(`/c/${result.slug}`, { replace: true })
        },
        (error) => {
          if (mounted.current) setState({ status: 'error', message: acceptInviteErrorMessage(error) })
        },
      )
    }
    return () => {
      mounted.current = false
    }
  }, [code, data, navigate])

  return (
    <>
      <h1 className="font-exo text-xl font-semibold tracking-[0.15em] uppercase text-txt-primary mb-5">Invitación</h1>
      {state.status === 'pending' && (
        <p role="status" className="text-sm text-txt-muted">
          Aceptando la invitación…
        </p>
      )}
      {state.status === 'joined' && (
        <p role="status" className="text-sm text-txt-secondary">
          Te uniste a la campaña. Entrando…
        </p>
      )}
      {state.status === 'error' && (
        <div role="alert">
          <p className="text-sm text-accent-bright mb-4">{state.message}</p>
          <Link to="/" className={btnSecondary}>
            Volver al inicio
          </Link>
        </div>
      )}
    </>
  )
}

export function InvitePage() {
  const { code } = useParams()
  const normalized = code ? normalizeInviteCode(code) : null
  // key: a different code is a different invitation, with its own single attempt.
  return <InviteAccept key={normalized ?? 'invalid'} code={normalized} />
}
