import { Link } from 'react-router'
import type { CampaignWithRole } from '../data'
import { parseLogoUrl } from '../campaign/branding'
import { BrandMark } from '../components/BrandMark'
import { ROLE_LABEL } from './roles'

/** Presentational list of the user's campaigns: subtitle small on top, the name large in the middle. */
export function CampaignList({ campaigns, canCreate = false }: { campaigns: CampaignWithRole[]; canCreate?: boolean }) {
  if (campaigns.length === 0) {
    return <p className="text-sm text-txt-secondary">Todavía no sos parte de ninguna campaña. {canCreate ? 'Creá una' : 'Solicitá una'} o unite con un código.</p>
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {campaigns.map((campaign) => {
        const logo = parseLogoUrl(campaign.branding?.logo_url)
        const tagline = typeof campaign.branding?.tagline === 'string' ? campaign.branding.tagline.trim() : ''
        return (
          <li key={campaign.id}>
            <Link
              to={`/c/${campaign.slug}`}
              className="flex items-center gap-4 min-h-[128px] bg-bg-card border border-border-base p-5 hover:border-accent-dim transition-colors"
            >
              {logo ? (
                <img src={logo} alt="" referrerPolicy="no-referrer" className="w-12 h-12 object-cover rounded shrink-0" />
              ) : (
                <BrandMark size={44} className="shrink-0" />
              )}
              <span className="flex-1 min-w-0 flex flex-col gap-1.5">
                {tagline && (
                  <span className="block font-exo text-[10px] tracking-[0.25em] uppercase text-txt-muted truncate">{tagline}</span>
                )}
                <span className="block font-exo text-xl font-bold tracking-[0.06em] uppercase text-txt-primary break-words">
                  {campaign.name}
                </span>
                <span className="font-exo text-[10px] tracking-[0.15em] uppercase text-txt-secondary">{ROLE_LABEL[campaign.role]}</span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
