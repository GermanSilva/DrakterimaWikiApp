import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Menu } from 'lucide-react'
import type { CampaignWithRole } from '../data'
import DragonIcon from '../svgs/dragonIcon'
import { CampaignSwitcher } from './CampaignSwitcher'

export interface CampaignHeaderProps {
  name: string
  /** Validated https URL or null (see parseLogoUrl). */
  logoUrl: string | null
  currentSlug: string
  campaigns: CampaignWithRole[]
  menuOpen: boolean
  onToggleMenu: () => void
  /** Rendered at the right edge (the connected UserMenu). */
  userMenu: ReactNode
}

export function CampaignHeader({ name, logoUrl, currentSlug, campaigns, menuOpen, onToggleMenu, userMenu }: CampaignHeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 h-[60px] bg-bg-mid border-b border-border-base flex items-center px-6 z-[100] gap-4">
      <button
        type="button"
        className="md:hidden bg-transparent border-none text-txt-secondary cursor-pointer p-1 hover:text-txt-primary"
        onClick={onToggleMenu}
        aria-label="Menú"
        aria-expanded={menuOpen}
        aria-controls="campaign-nav"
      >
        <Menu size={20} />
      </button>
      <Link to={`/c/${currentSlug}`} className="flex items-center gap-2.5 leading-none min-w-0" aria-label={`${name}: panel`}>
        {logoUrl ? (
          <img src={logoUrl} alt="" referrerPolicy="no-referrer" className="w-7 h-7 object-contain shrink-0" />
        ) : (
          <DragonIcon width={28} height={28} className="text-accent shrink-0" />
        )}
        <span className="font-exo text-[17px] font-bold text-accent-bright tracking-[0.08em] uppercase truncate">{name}</span>
      </Link>
      <div className="ml-auto flex items-center gap-4">
        <CampaignSwitcher campaigns={campaigns} currentSlug={currentSlug} />
        {userMenu}
      </div>
    </header>
  )
}
