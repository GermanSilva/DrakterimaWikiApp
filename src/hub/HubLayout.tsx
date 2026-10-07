import { Link, Outlet } from 'react-router'
import { ConnectedUserMenu } from '../app/ConnectedUserMenu'
import DragonIcon from '../svgs/dragonIcon'

/** Frame for the pages that live outside a campaign: home, invites, profile. */
export function HubLayout() {
  return (
    <div className="min-h-screen bg-bg-deep">
      <header className="h-[60px] bg-bg-mid border-b border-border-base flex items-center px-6 gap-4">
        <Link to="/" className="flex items-center gap-2.5 text-txt-primary" aria-label="Inicio">
          <DragonIcon width={28} height={28} className="text-accent" />
          <span className="font-exo text-[15px] font-bold tracking-[0.08em] uppercase max-md:hidden">Campañas</span>
        </Link>
        <nav aria-label="Cuenta" className="ml-auto flex items-center gap-4">
          <Link to="/profile" className="text-xs font-exo tracking-[0.1em] uppercase text-txt-secondary hover:text-txt-primary">
            Mi perfil
          </Link>
          <ConnectedUserMenu />
        </nav>
      </header>
      <main id="main-content" tabIndex={-1} className="max-w-3xl mx-auto px-4 py-8 outline-none">
        <Outlet />
      </main>
    </div>
  )
}
