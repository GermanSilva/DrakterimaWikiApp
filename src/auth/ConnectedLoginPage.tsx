import { isGoogleEnabled, turnstileSiteKey } from './authConfig'
import { LoginPage } from './LoginPage'
import { rememberNext } from './postLoginRedirect'
import { useAuth } from './useAuth'

/**
 * LoginPage wired to the auth context. `next` (the login URL's `?next=`, validated again by
 * rememberNext) is persisted before ANY sign-in starts so the callback can return the user there;
 * without a valid `next` the stored value is cleared.
 */
export function ConnectedLoginPage({ next }: { next?: string | null }) {
  const { signInWithEmail, signInWithGoogle } = useAuth()
  return (
    <LoginPage
      onEmailSubmit={(...args: Parameters<typeof signInWithEmail>) => {
        rememberNext(next)
        return signInWithEmail(...args)
      }}
      onGoogle={() => {
        rememberNext(next)
        return signInWithGoogle()
      }}
      googleEnabled={isGoogleEnabled()}
      turnstileSiteKey={turnstileSiteKey()}
    />
  )
}
