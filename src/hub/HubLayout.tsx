import { Link, Outlet } from 'react-router'
import { ConnectedUserMenu } from '../app/ConnectedUserMenu'
import { accentStyle } from '../campaign/branding'
import { BrandMark } from '../components/BrandMark'

// Hub screens take the brand colour as their accent; a campaign overrides it with its own on entry.
const HUB_ACCENT = accentStyle({ accent_color: '#4a32ac' })

/** Frame for the pages that live outside a campaign: home, invites, profile. */
export function HubLayout() {
  return (
    <div className="hub-surface min-h-screen bg-bg-deep" style={HUB_ACCENT}>
      <header className="h-[64px] bg-bg-mid border-b border-border-base flex items-center px-6 gap-4">
        <Link to="/" className="flex items-center gap-3 text-txt-primary" aria-label="RPG Quester: inicio">
          <BrandMark size={36} />
          <span className="flex flex-col leading-none" aria-hidden="true">
            <span className="font-exo text-[10px] font-semibold tracking-[0.4em] uppercase text-txt-secondary">RPG</span>
            <span className="brand-gradient-text font-exo text-[24px] font-extrabold tracking-[0.14em] uppercase">QUESTER</span>
          </span>
        </Link>
        <nav aria-label="Cuenta" className="ml-auto flex items-center">
          <ConnectedUserMenu />
        </nav>
      </header>
      <main id="main-content" tabIndex={-1} className="max-w-5xl mx-auto px-4 py-8 outline-none">
        <Outlet />
      </main>
    </div>
  )
}
