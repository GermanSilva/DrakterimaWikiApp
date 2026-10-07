import { Navigate, useSearchParams } from 'react-router'
import { ConnectedLoginPage, useAuth } from '../auth'
import { LoadingScreen } from './RouteStatus'
import { safeNextPath } from './safeNext'

export function LoginRoute() {
  const { status } = useAuth()
  const [params] = useSearchParams()
  if (status === 'loading') return <LoadingScreen />
  if (status === 'signed_in') return <Navigate to={safeNextPath(params.get('next'))} replace />
  return (
    <main id="main-content" tabIndex={-1}>
      <ConnectedLoginPage />
    </main>
  )
}
