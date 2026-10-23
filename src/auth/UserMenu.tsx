import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import type { Profile } from '../data'

export interface UserMenuProps {
  profile: Profile | null
  /** Fallback label while the profile loads. */
  email?: string | null
  onSignOut: () => Promise<void>
  onEditProfile: () => void
  onMyCampaigns: () => void
}

const ITEM =
  'block w-full text-left px-4 py-2.5 text-xs font-exo tracking-[0.1em] uppercase text-txt-secondary bg-transparent border-none cursor-pointer hover:bg-bg-card-hover hover:text-txt-primary focus-visible:bg-bg-card-hover focus-visible:text-txt-primary disabled:opacity-60 disabled:cursor-default'

/** Header account control: the user's name and avatar open a floating menu (profile, campaigns, sign out). */
export function UserMenu({ profile, email, onSignOut, onEditProfile, onMyCampaigns }: UserMenuProps) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const name = profile?.display_name || email || 'Usuario'

  useEffect(() => {
    if (!open) return
    const onPress = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPress)
    return () => document.removeEventListener('mousedown', onPress)
  }, [open])

  function close(refocus = false) {
    setOpen(false)
    if (refocus) trigger.current?.focus()
  }

  function choose(action: () => void) {
    close()
    action()
  }

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

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      close(true)
      return
    }
    if (event.key === 'Tab') {
      close()
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)'))
    const at = items.indexOf(document.activeElement as HTMLElement)
    const next = event.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length
    items[next]?.focus()
  }

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2.5 bg-transparent border-none cursor-pointer text-txt-primary p-0"
      >
        <span className="text-sm max-md:hidden">{name}</span>
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full object-cover" />
        ) : (
          <span aria-hidden="true" className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-exo font-semibold">
            {name.charAt(0).toUpperCase()}
          </span>
        )}
        <ChevronDown size={14} aria-hidden="true" className="text-txt-muted" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Cuenta"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-full mt-2 min-w-[200px] bg-bg-card border border-border-light shadow-lg z-[300] py-1"
        >
          <button type="button" role="menuitem" className={ITEM} onClick={() => choose(onEditProfile)}>
            Editar perfil
          </button>
          <button type="button" role="menuitem" className={ITEM} onClick={() => choose(onMyCampaigns)}>
            Ver mis campañas
          </button>
          <button type="button" role="menuitem" className={ITEM} onClick={signOut} disabled={pending}>
            Cerrar sesión
          </button>
          {error && (
            <p role="alert" className="px-4 py-2 text-xs text-accent-bright">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
