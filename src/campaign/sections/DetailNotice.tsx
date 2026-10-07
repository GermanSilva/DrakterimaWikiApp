import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { btnSecondary } from '../../constants'

/** Heading + message + "← Volver" for the states of a detail URL that have no entity to show. */
export function DetailNotice({
  title,
  to,
  alert = false,
  children,
  action,
}: {
  title: string
  to: string
  /** Announce it right away (load failures); a plain "not found" is just content. */
  alert?: boolean
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div>
      <h1 className="font-exo text-xl font-semibold tracking-[0.15em] uppercase text-txt-primary mb-3">{title}</h1>
      <p role={alert ? 'alert' : undefined} className="text-sm text-txt-secondary mb-5">
        {children}
      </p>
      <div className="flex gap-3">
        <Link to={to} className={btnSecondary}>
          ← Volver
        </Link>
        {action}
      </div>
    </div>
  )
}

export function Loading() {
  return (
    <p role="status" className="text-sm text-txt-muted">
      Cargando…
    </p>
  )
}
