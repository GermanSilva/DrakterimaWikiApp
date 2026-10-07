import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { AuthCallback } from '../auth'

export function AuthCallbackRoute() {
  const navigate = useNavigate()
  // AuthCallback always reports '/'; there is deliberately no caller-controlled target here.
  const onDone = useCallback(() => navigate('/', { replace: true }), [navigate])
  return (
    <main id="main-content" tabIndex={-1}>
      <h1 className="sr-only">Iniciando sesión</h1>
      <AuthCallback onDone={onDone} />
    </main>
  )
}
