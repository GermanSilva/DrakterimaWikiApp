import { useState } from 'react'
import { btnSecondary } from '../constants'
import type { Profile } from '../data'

export interface UserMenuProps {
  profile: Profile | null
  /** Fallback label while the profile loads. */
  email?: string | null
  onSignOut: () => Promise<void>
}

export function UserMenu({ profile, email, onSignOut }: UserMenuProps) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const name = profile?.display_name || email || 'Usuario'

  async function signOut() {
    setPending(true)
    setError(null)
    try {
      await onSignOut()
    } catch {
      setError('No pudimos cerrar la sesión. Volvé a intentar.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      {profile?.avatar_url ? (
        <img src={profile.avatar_url} alt="" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full object-cover" />
      ) : (
        <span aria-hidden="true" className="w-8 h-8 rounded-full bg-bg-mid text-txt-secondary flex items-center justify-center text-xs font-exo">
          {name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="text-sm text-txt-primary">{name}</span>
      <button type="button" className={btnSecondary} onClick={signOut} disabled={pending}>
        Cerrar sesión
      </button>
      {error && (
        <span role="alert" className="text-xs text-accent-bright">
          {error}
        </span>
      )}
    </div>
  )
}
