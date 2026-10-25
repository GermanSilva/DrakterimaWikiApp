import { useState, type ReactNode } from 'react'
import { Outlet, useParams } from 'react-router'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { ConnectedUserMenu } from '../app/ConnectedUserMenu'
import { formatTitle, useDocumentTitle } from '../app/documentTitle'
import type { CampaignWithRole } from '../data'
import { PRESENCE_NOTICE } from '../hub/campaignSlug'
import { accentStyle, parseLogoUrl, topbarTagline } from './branding'
import { CampaignHeader } from './CampaignHeader'
import { CampaignSidebar } from './CampaignSidebar'
import { findSection, sectionsFor } from './sections'
import type { CampaignContextValue } from './CampaignContext'

export interface CampaignShellProps {
  campaign: CampaignContextValue['campaign']
  isDM: boolean
  campaigns: CampaignWithRole[]
  /** Defaults to the connected user menu; tests/storybook-style callers can replace it. */
  userMenu?: ReactNode
}

/** Header + sidebar + main frame with the campaign's branding applied to its subtree only. */
export function CampaignShell({ campaign, isDM, campaigns, userMenu }: CampaignShellProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const { section } = useParams()
  const current = findSection(section)
  useDocumentTitle(formatTitle(current && (!current.dmOnly || isDM) && current.label, campaign.name))
  const fullBleed =!!findSection(section)?.fullBleed && (isDM || !findSection(section)?.dmOnly)
  return (
    <div style={accentStyle(campaign.branding)} className="min-h-screen bg-bg-deep">
      <CampaignHeader
        name={campaign.name}
        tagline={topbarTagline(campaign.branding)}
        logoUrl={parseLogoUrl(campaign.branding?.logo_url)}
        currentSlug={campaign.slug}
        campaigns={campaigns}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((open) => !open)}
        userMenu={userMenu ?? <ConnectedUserMenu />}
      />
      <CampaignSidebar
        slug={campaign.slug}
        sections={sectionsFor(isDM)}
        open={menuOpen}
        collapsed={collapsed}
        onNavigate={() => setMenuOpen(false)}
        notice={isDM ? undefined : PRESENCE_NOTICE}
      />
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        aria-label={collapsed ? 'Mostrar menú lateral' : 'Ocultar menú lateral'}
        aria-expanded={!collapsed}
        aria-controls="campaign-nav"
        className={[
          'max-md:hidden fixed top-[72px] z-[210] flex h-8 w-8 items-center justify-center',
          'bg-bg-card border border-border-base text-txt-secondary cursor-pointer shadow-lg',
          'transition-[left] duration-[250ms] ease-in-out hover:text-txt-primary hover:border-accent-dim',
          collapsed ? 'left-2' : 'left-[248px]',
        ].join(' ')}
      >
        {collapsed ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
      </button>
      {menuOpen && <div className="fixed inset-0 z-[150] bg-black/50 md:hidden" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
      <main id="main-content" tabIndex={-1} className={['pt-[60px] min-w-0 outline-none transition-[margin] duration-[250ms]', collapsed ? 'md:ml-0' : 'md:ml-[240px]'].join(' ')}>
        <div className={fullBleed ? 'py-8' : 'py-8 px-10 max-md:p-5 max-w-[1100px]'}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
