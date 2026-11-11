import { useContext, useEffect, useState } from 'react'
import type { PublicInvitePreview } from '../data'
import { DataContext } from '../app/DataContext'
import { safeNextPath } from '../app/safeNext'
import { isGoogleEnabled } from './authConfig'
import { DevEmailLogin } from './DevEmailLogin'
import { LoginPage } from './LoginPage'
import { rememberNext } from './postLoginRedirect'
import { useAuth } from './useAuth'

/** The invite code of a validated `next` (`/invite/:code`), or null. */
export function inviteCodeFromNext(next: string | null | undefined): string | null {
  if (!next) return null
  const safe = safeNextPath(next, '')
  const match = /^\/invite\/([^/?#]+)/.exec(safe)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

/**
 * Loads the public invitation preview once per code. Loading and failure both yield undefined
 * (generic login): the invite errors are shown by InvitePage after sign-in. Without a HubData
 * provider nothing is loaded.
 */
function useInvitePreview(code: string | null): PublicInvitePreview | undefined {
  const data = useContext(DataContext)
  const [state, setState] = useState<{ code: string; preview: PublicInvitePreview } | null>(null)
  useEffect(() => {
    if (!code || !data) return
    let live = true
    data.previewInvitePublic(code).then(
      (preview) => live && setState({ code, preview }),
      () => {},
    )
    return () => {
      live = false
    }
    // `data` is stable for the provider's lifetime; the preview is fetched once per code.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])
  return state && state.code === code ? state.preview : undefined
}

/**
 * LoginPage wired to the auth context. `next` (the login URL's `?next=`, validated again by
 * rememberNext) is persisted before ANY sign-in starts so the callback can return the user there;
 * without a valid `next` the stored value is cleared.
 *
 * Production login is Google only. The magic-link form is a development aid: `devEmailLogin`
 * is ANDed with import.meta.env.DEV directly in the JSX condition (single key, never the whole object);
 * Vite replaces it with `false` in production builds so DevEmailLogin is tree-shaken out (a default
 * parameter would hide the constant from the bundler).
 */
export function ConnectedLoginPage({
  next,
  devEmailLogin = true,
}: {
  next?: string | null
  devEmailLogin?: boolean
}) {
  const { signInWithEmail, signInWithGoogle } = useAuth()
  const preview = useInvitePreview(inviteCodeFromNext(next))
  return (
    <LoginPage
      invite={preview ? { status: 'ready', preview } : undefined}
      devLogin={
        import.meta.env.DEV && devEmailLogin ? (
          <DevEmailLogin
            onSubmit={(email) => {
              rememberNext(next)
              return signInWithEmail(email)
            }}
          />
        ) : undefined
      }
      onGoogle={() => {
        rememberNext(next)
        return signInWithGoogle()
      }}
      googleEnabled={isGoogleEnabled()}
    />
  )
}
