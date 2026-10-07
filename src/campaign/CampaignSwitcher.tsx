import { useId } from 'react'
import { useNavigate } from 'react-router'
import type { CampaignWithRole } from '../data'

const ALL = '/'

/** Dropdown of my campaigns. A native select keeps keyboard and screen-reader behaviour for free. */
export function CampaignSwitcher({ campaigns, currentSlug }: { campaigns: CampaignWithRole[]; currentSlug: string }) {
  const id = useId()
  const navigate = useNavigate()
  return (
    <div className="max-md:hidden">
      <label htmlFor={id} className="sr-only">
        Cambiar de campaña
      </label>
      <select
        id={id}
        value={currentSlug}
        onChange={(e) => navigate(e.target.value === ALL ? '/' : `/c/${e.target.value}`)}
        className="bg-bg-card border border-border-base text-txt-secondary text-xs font-exo px-2 py-1.5 max-w-[180px]"
      >
        {campaigns.map((c) => (
          <option key={c.id} value={c.slug}>
            {c.name}
          </option>
        ))}
        <option value={ALL}>Todas mis campañas…</option>
      </select>
    </div>
  )
}
