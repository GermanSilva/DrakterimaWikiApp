import { isGoogleEnabled } from './authConfig'
import { LoginPage } from './LoginPage'
import { rememberNext } from './postLoginRedirect'
import { useAuth } from './useAuth'

/**
 * LoginPage wired to the auth context. `next` (the login URL's `?next=`, validated again by
 * rememberNext) is persisted before ANY sign-in starts so the callback can return the user there;
 * without a valid `next` the stored value is cleared.
 *
 * Production login is Google only. The magic-link form is a development aid: `devEmailLogin`
 * defaults to import.meta.env.DEV (single key, never the whole object), which Vite replaces with
 * `false` in production builds so the form is dropped.
 */
export function ConnectedLoginPage({
  next,
  devEmailLogin = import.meta.env.DEV,
}: {
  next?: string | null
  devEmailLogin?: boolean
}) {
  const { signInWithEmail, signInWithGoogle } = useAuth()
  return (
    <LoginPage
      onDevEmailSubmit={
        devEmailLogin
          ? (email) => {
              rememberNext(next)
              return signInWithEmail(email)
            }
          : undefined
      }
      onGoogle={() => {
        rememberNext(next)
        return signInWithGoogle()
      }}
      googleEnabled={isGoogleEnabled()}
    />
  )
}
