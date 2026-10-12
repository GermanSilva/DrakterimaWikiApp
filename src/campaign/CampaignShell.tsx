import { useState, type ReactNode } from 'react'
import { Outlet, useParams } from 'react-router'
import { ConnectedUserMenu } from '../app/ConnectedUserMenu'
import { formatTitle, useDocumentTitle } from '../app/documentTitle'
import type { CampaignWithRole } from '../data'
import { PRESENCE_NOTICE } from '../hub/campaignSlug'
import { accentStyle, parseLogoUrl } from './branding'
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
  const { section } = useParams()
  const current = findSection(section)
  useDocumentTitle(formatTitle(current && (!current.dmOnly || isDM) && current.label, campaign.name))
  const fullBleed =!!findSection(section)?.fullBleed && (isDM || !findSection(section)?.dmOnly)
  return (
    <div style={accentStyle(campaign.branding)} className="min-h-screen bg-bg-deep">
      <CampaignHeader
        name={campaign.name}
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
        onNavigate={() => setMenuOpen(false)}
        notice={isDM ? undefined : PRESENCE_NOTICE}
      />
      {menuOpen && <div className="fixed inset-0 z-[150] bg-black/50 md:hidden" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
      <main id="main-content" tabIndex={-1} className="md:ml-[240px] pt-[60px] min-w-0 outline-none">
        <div className={fullBleed ? 'py-8' : 'py-8 px-10 max-md:p-5 max-w-[1100px]'}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
