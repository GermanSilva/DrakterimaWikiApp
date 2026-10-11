import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { AuthCallback } from '../auth'
import { safeNextPath } from './safeNext'

export function AuthCallbackRoute() {
  const navigate = useNavigate()
  // The target comes from the one-shot destination the login page stored (never from this URL);
  // it is validated once more here as defence in depth.
  const onDone = useCallback((path: string) => navigate(safeNextPath(path), { replace: true }), [navigate])
  return (
    <main id="main-content" tabIndex={-1}>
      <h1 className="sr-only">Iniciando sesión</h1>
      <AuthCallback onDone={onDone} />
    </main>
  )
}
