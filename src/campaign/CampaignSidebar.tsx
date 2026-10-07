import { Link, NavLink } from 'react-router'
import { LayoutDashboard } from 'lucide-react'
import { groupSections, type SectionDef } from './sections'

export interface CampaignSidebarProps {
  slug: string
  /** Already filtered for the viewer's role (sectionsFor). */
  sections: SectionDef[]
  open: boolean
  onNavigate: () => void
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
export function CampaignSidebar({ slug, sections, open, onNavigate }: CampaignSidebarProps) {
  return (
    <nav
      id="campaign-nav"
      aria-label="Secciones de la campaña"
      className={[
        'fixed left-0 top-[60px] w-[240px] h-[calc(100vh-60px)]',
        'bg-bg-mid border-r border-border-base py-5 z-[200] overflow-y-auto flex flex-col',
        'transition-transform duration-[250ms] ease-in-out md:translate-x-0',
        open ? 'max-md:translate-x-0' : 'max-md:-translate-x-full',
      ].join(' ')}
    >
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
      <div className="mt-auto pt-4 border-t border-border-base">
        <Link to="/" className={linkCls({ isActive: false })} onClick={onNavigate}>
          <span className={labelCls}>Mis campañas</span>
        </Link>
      </div>
    </nav>
  )
}
