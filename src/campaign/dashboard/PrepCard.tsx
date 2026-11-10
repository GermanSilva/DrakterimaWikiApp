import { Link } from 'react-router'
import { entityPath } from '../navigation'
import { DashCard, StatusText } from './DashCard'
import { linkFocus } from './uiHelpers'
import type { PrepItem } from './dashboardData'
import type { SourceStatus } from './useDashboardSources'

const SECTION_OF: Record<PrepItem['key'], string> = { disponibilidad: 'calendario', sesiones: 'sesiones', pnjs: 'pnjs' }

/** DM only: what is pending before the next session. */
export function PrepCard({ slug, items, status }: { slug: string; items: PrepItem[]; status: SourceStatus }) {
  return (
    <DashCard id="panel-prep" title="Para preparar">
      {items.length === 0 ? (
        <StatusText status={status} empty="Nada pendiente." />
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.key} className="border-t border-border-base first:border-t-0">
              <Link to={entityPath(slug, SECTION_OF[item.key])} className={`flex items-center gap-3 py-2.5 text-[13px] hover:text-accent-bright ${linkFocus}`}>
                <b className="min-w-[22px] text-right font-exo text-base text-accent-bright">{item.count}</b>
                {item.label}
                <em className="ml-auto text-xs not-italic text-txt-secondary">{item.detail}</em>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashCard>
  )
}
