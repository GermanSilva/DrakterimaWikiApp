import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { ChevronUp } from 'lucide-react'
import type { CampaignWithRole } from '../data'

export interface CampaignSwitcherProps {
  campaigns: CampaignWithRole[]
  currentSlug: string
  /** Called after a campaign (or "all my campaigns") is chosen, e.g. to close the mobile drawer. */
  onNavigate?: () => void
}

const ITEM =
  'block w-full text-left px-[18px] py-2.5 text-[11px] font-exo tracking-[0.06em] uppercase font-medium text-txt-secondary bg-transparent border-none cursor-pointer truncate hover:bg-bg-card-hover hover:text-txt-primary focus-visible:bg-bg-card-hover focus-visible:text-txt-primary'

/**
 * Campaign picker for the foot of the sidebar: the button shows the current campaign and opens a menu upward
 * (the sidebar footer sits at the bottom of the screen). Choosing an item is a plain link, so it navigates
 * like any other.
 */
export function CampaignSwitcher({ campaigns, currentSlug, onNavigate }: CampaignSwitcherProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const current = campaigns.find((c) => c.slug === currentSlug)

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

  function choose() {
    close()
    onNavigate?.()
  }

  /** On the wrapper, so it also hears the trigger: Escape closes, arrows walk the items, Tab out of the menu closes it. */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!open) return
    if (event.key === 'Escape') {
      event.stopPropagation()
      close(true)
      return
    }
    const inMenu = menu.current?.contains(event.target as Node) ?? false
    if (event.key === 'Tab') {
      if (inMenu) close()
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const items = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    const at = items.indexOf(document.activeElement as HTMLElement)
    const down = event.key === 'ArrowDown'
    const next = at === -1 ? (down ? 0 : items.length - 1) : (at + (down ? 1 : -1) + items.length) % items.length
    items[next]?.focus()
  }

  return (
    <div ref={root} onKeyDown={onKeyDown} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-label="Cambiar de campaña"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 px-[18px] py-3 bg-transparent border-none cursor-pointer text-left hover:bg-accent/[.06]"
      >
        <span className="min-w-0 truncate font-exo text-[11px] tracking-[0.06em] font-medium uppercase text-txt-primary">{current?.name ?? 'Campañas'}</span>
        <ChevronUp size={14} aria-hidden="true" className={`shrink-0 text-txt-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label="Campañas"
          className="absolute bottom-full left-0 right-0 max-h-[50vh] overflow-y-auto bg-bg-card border border-border-light shadow-lg z-[300] py-1"
        >
          {campaigns.map((c) => (
            <Link
              key={c.id}
              to={`/c/${c.slug}`}
              role="menuitem"
              aria-current={c.slug === currentSlug ? 'true' : undefined}
              onClick={choose}
              className={`${ITEM} ${c.slug === currentSlug ? '!text-accent-bright' : ''}`}
            >
              {c.name}
            </Link>
          ))}
          <Link to="/" role="menuitem" onClick={choose} className={`${ITEM} border-t border-border-base`}>
            Todas mis campañas
          </Link>
        </div>
      )}
    </div>
  )
}
