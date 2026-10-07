import type { ReactNode } from 'react'
import { ConnectedLoginPage } from './ConnectedLoginPage'
import { useAuth } from './useAuth'

export interface RequireAuthProps {
  children: ReactNode
  /** Shown when signed out. Defaults to the login page. */
  fallback?: ReactNode
  /** Shown while the session is being restored. */
  loading?: ReactNode
}

/** Renders children only for a signed-in user. No router dependency (H6 decides where it mounts). */
export function RequireAuth({ children, fallback, loading }: RequireAuthProps) {
  const { status } = useAuth()
  if (status === 'loading') {
    return (
      <>
        {loading ?? (
          <p role="status" className="text-center text-sm text-txt-muted mt-24">
            Cargando…
          </p>
        )}
      </>
    )
  }
  if (status === 'signed_out') return <>{fallback ?? <ConnectedLoginPage />}</>
  return <>{children}</>
}
