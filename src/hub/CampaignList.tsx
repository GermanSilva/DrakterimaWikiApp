import { Link } from 'react-router'
import type { CampaignWithRole } from '../data'
import { parseLogoUrl } from '../campaign/branding'
import { ROLE_LABEL } from './roles'
import DragonIcon from '../svgs/dragonIcon'

/** Presentational list of the user's campaigns. */
export function CampaignList({ campaigns }: { campaigns: CampaignWithRole[] }) {
  if (campaigns.length === 0) {
    return <p className="text-sm text-txt-secondary">Todavía no sos parte de ninguna campaña. Creá una o unite con un código.</p>
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {campaigns.map((campaign) => {
        const logo = parseLogoUrl(campaign.branding?.logo_url)
        return (
          <li key={campaign.id}>
            <Link
              to={`/c/${campaign.slug}`}
              className="flex items-center gap-3 bg-bg-card border border-border-base p-4 hover:border-accent-dim transition-colors"
            >
              {logo ? (
                <img src={logo} alt="" referrerPolicy="no-referrer" className="w-10 h-10 object-cover rounded" />
              ) : (
                <DragonIcon width={32} height={32} className="text-accent shrink-0" />
              )}
              <span className="flex-1 min-w-0">
                <span className="block font-exo text-sm font-semibold tracking-[0.08em] uppercase text-txt-primary truncate">
                  {campaign.name}
                </span>
                <span className="block text-xs text-txt-muted truncate">/{campaign.slug}</span>
              </span>
              <span className="font-exo text-[10px] tracking-[0.15em] uppercase px-2 py-0.5 border border-border-light text-txt-secondary">
                {ROLE_LABEL[campaign.role]}
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
