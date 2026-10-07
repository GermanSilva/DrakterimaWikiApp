import { useNavigate } from 'react-router'
import { UserMenu, useAuth } from '../auth'

/** UserMenu wired to auth; after signing out the user is sent to /login. */
export function ConnectedUserMenu() {
  const { profile, user, signOut } = useAuth()
  const navigate = useNavigate()
  return (
    <UserMenu
      profile={profile}
      email={user?.email}
      // A failing signOut rejects here; UserMenu catches it and shows an inline error (no unhandled
      // rejection, no navigation). If the session ends anyway, RequireAuthRoute redirects to /login.
      onSignOut={async () => {
        await signOut()
        navigate('/login', { replace: true })
      }}
    />
  )
}
