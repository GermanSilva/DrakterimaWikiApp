import type { ReactNode } from 'react'
import { accentStyle, parseAccentColor, parseHttpsUrl } from '../campaign/branding'
import { BrandMark } from '../components/BrandMark'
import type { CampaignRequest } from '../data'
import { DEFAULT_ACCENT } from './campaignBranding'

/**
 * A campaign request as a tile: the logo on the left (the brand mark when there is none), the pre-title small above the
 * name, the details below, the actions on the right, and a left border in the colour that was asked for (the brand
 * indigo when none). The logo is rendered only when it is an https URL.
 */
export function RequestTile({
  request,
  actions,
  children,
}: {
  request: Pick<CampaignRequest, 'name' | 'tagline' | 'accent_color' | 'logo_url'>
  actions?: ReactNode
  children?: ReactNode
}) {
  const logo = parseHttpsUrl(request.logo_url)
  const tagline = request.tagline?.trim() ?? ''
  const accent = parseAccentColor(request.accent_color) ?? DEFAULT_ACCENT

  return (
    <li
      data-testid="request-tile"
      style={accentStyle({ accent_color: accent })}
      className="flex items-center gap-4 bg-bg-card border border-border-base border-l-4 border-l-accent p-4"
    >
      {logo ? (
        <img src={logo} alt="" referrerPolicy="no-referrer" className="w-10 h-10 object-cover rounded shrink-0" />
      ) : (
        <BrandMark size={40} accent className="shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        {tagline && <p className="font-exo text-[10px] tracking-[0.25em] uppercase text-txt-muted truncate mb-1">{tagline}</p>}
        <p className="font-exo text-sm font-semibold tracking-[0.08em] uppercase text-txt-primary break-words">{request.name}</p>
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center justify-end gap-2 shrink-0 ml-auto">{actions}</div>}
    </li>
  )
}
