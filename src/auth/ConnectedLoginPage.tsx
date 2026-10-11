import { isGoogleEnabled, turnstileSiteKey } from './authConfig'
import { LoginPage } from './LoginPage'
import { useAuth } from './useAuth'

/** LoginPage wired to the auth context. */
export function ConnectedLoginPage() {
  const { signInWithEmail, signInWithGoogle } = useAuth()
  return <LoginPage onEmailSubmit={signInWithEmail} onGoogle={signInWithGoogle} googleEnabled={isGoogleEnabled()}
      turnstileSiteKey={turnstileSiteKey()}
    />
}
