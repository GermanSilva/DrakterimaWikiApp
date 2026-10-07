import { Link } from 'react-router'
import { useCampaign } from './CampaignContext'
import { ROLE_LABEL as ROLE } from '../hub/roles'
import { sectionsFor } from './sections'

/** Placeholder landing page of a campaign (the real dashboard is ported later). */
export function CampaignDashboard() {
  const { campaign, role, isDM } = useCampaign()
  return (
    <>
      <h1 className="font-exo text-xl font-semibold tracking-[0.15em] uppercase text-txt-primary mb-1">{campaign.name}</h1>
      <p className="text-sm text-txt-secondary mb-6">
        Tu rol: <strong className="text-txt-primary">{ROLE[role]}</strong>
      </p>
      <h2 className="font-exo text-[13px] font-semibold tracking-[0.2em] uppercase text-accent-bright mb-3">Secciones</h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {sectionsFor(isDM).map((section) => (
          <li key={section.key}>
            <Link
              to={`/c/${campaign.slug}/${section.path}`}
              className="block bg-bg-card border border-border-base px-4 py-3 text-sm text-txt-secondary hover:border-accent-dim hover:text-txt-primary transition-colors"
            >
              {section.label}
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
