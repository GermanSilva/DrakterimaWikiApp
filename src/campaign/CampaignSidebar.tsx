import { NavLink } from 'react-router'
import { LayoutDashboard } from 'lucide-react'
import type { CampaignWithRole } from '../data'
import { CampaignSwitcher } from './CampaignSwitcher'
import { groupSections, type SectionDef } from './sections'

export interface CampaignSidebarProps {
  slug: string
  campaigns: CampaignWithRole[]
  /** Already filtered for the viewer's role (sectionsFor). */
  sections: SectionDef[]
  open: boolean
  /** Desktop only: the menu is slid out of view (the mobile drawer uses `open`). */
  collapsed?: boolean
  onNavigate: () => void
  /** A small standing note at the foot of the menu (shown to players: the DM sees their last connection). */
  notice?: string
}

const linkCls = ({ isActive }: { isActive: boolean }) =>
  [
    'flex items-center gap-2.5 px-[18px] py-[9px] transition-all border-l-2 text-[13px]',
    isActive
      ? 'bg-accent/[.1] text-accent-bright border-l-accent'
      : 'border-l-transparent text-txt-secondary hover:bg-accent/[.06] hover:text-txt-primary hover:border-l-accent-dim',
  ].join(' ')

const labelCls = 'font-exo text-[11px] tracking-[0.06em] font-medium uppercase'

/** Presentational: the campaign's section navigation (NavLinks give aria-current for free). */
export function CampaignSidebar({ slug, campaigns, sections, open, collapsed = false, onNavigate, notice }: CampaignSidebarProps) {
  return (
    <nav
      id="campaign-nav"
      aria-label="Secciones de la campaña"
      data-collapsed={collapsed}
      className={[
        'fixed left-0 top-[60px] w-[240px] h-[calc(100vh-60px)]',
        'bg-bg-mid border-r border-border-base z-[200] flex flex-col',
        'transition-[transform,visibility] duration-[250ms] ease-in-out',
        collapsed ? 'md:-translate-x-full md:invisible' : 'md:translate-x-0',
        open ? 'max-md:translate-x-0' : 'max-md:-translate-x-full',
      ].join(' ')}
    >
      <div data-testid="sidebar-scroll" className="flex-1 min-h-0 overflow-y-auto py-5">
      <NavLink to={`/c/${slug}`} end className={linkCls} onClick={onNavigate}>
        <LayoutDashboard size={15} className="w-5 flex-shrink-0" aria-hidden="true" />
        <span className={labelCls}>Panel</span>
      </NavLink>
      {groupSections(sections).map(({ group, items }) => (
        <div key={group} className="mt-5">
          <div className="font-exo text-[9px] tracking-[0.3em] text-txt-muted uppercase px-[18px] pb-2 font-semibold">{group}</div>
          {items.map((item) => {
            const Icon = item.icon
            return (
              <NavLink key={item.key} to={`/c/${slug}/${item.path}`} className={linkCls} onClick={onNavigate}>
                <Icon size={15} className="w-5 flex-shrink-0" aria-hidden="true" />
                <span className={labelCls}>{item.label}</span>
              </NavLink>
            )
          })}
        </div>
      ))}
      </div>
      <div className="shrink-0 border-t border-border-base">
        {notice && <p className="px-[18px] pt-3 text-[11px] leading-snug text-txt-muted">{notice}</p>}
        <CampaignSwitcher campaigns={campaigns} currentSlug={slug} onNavigate={onNavigate} />
      </div>
    </nav>
  )
}
