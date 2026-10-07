import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '../auth'
import { LoadingScreen } from './RouteStatus'
import { loginPathFor } from './safeNext'

/** Layout route: renders the child routes only for an explicit 'signed_in'; otherwise → /login?next=. */
export function RequireAuthRoute() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <LoadingScreen />
  if (status !== 'signed_in') return <Navigate to={loginPathFor(location)} replace />
  return <Outlet />
}
