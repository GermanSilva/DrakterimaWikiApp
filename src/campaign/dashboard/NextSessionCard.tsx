import { Link } from 'react-router'
import { entityPath } from '../navigation'
import { DashCard, StatusText } from './DashCard'
import { linkFocus } from './uiHelpers'
import type { NextSession } from './useDashboardModel'
import type { SourceStatus } from './useDashboardSources'

const actionCls = `inline-flex min-h-9 items-center border border-border-light bg-bg-deep px-3.5 font-exo text-[11px] uppercase tracking-[0.12em] text-txt-primary hover:border-accent-dim ${linkFocus}`

export interface NextSessionCardProps {
  slug: string
  isDM: boolean
  next: NextSession | null
  status: SourceStatus
}

export function NextSessionCard({ slug, isDM, next, status }: NextSessionCardProps) {
  if (!next) {
    return (
      <DashCard id="panel-next" title="Próxima sesión">
        <StatusText status={status} empty="No hay una próxima sesión agendada." />
      </DashCard>
    )
  }
  const calendar = entityPath(slug, 'calendario')
  const { availability } = next
  return (
    <section aria-labelledby="panel-next" className="grid grid-cols-[auto_1fr] items-center gap-5 border border-l-[3px] border-border-base border-l-accent bg-bg-card p-5 max-sm:grid-cols-1">
      <time dateTime={next.day} className="w-[84px] border border-accent-dim bg-accent-subtle/50 text-center">
        <span className="block bg-accent-dim py-1 font-exo text-[10px] uppercase tracking-[0.2em]">{next.parts.month}</span>
        <b className="block font-exo text-[34px] leading-[1.3]">{next.parts.day}</b>
        <small className="block pb-1.5 text-[11px] text-txt-secondary">{next.parts.weekday}</small>
      </time>
      <div className="min-w-0">
        <p className="mb-1.5 font-exo text-[9px] uppercase tracking-[0.25em] text-txt-muted">{`Próxima sesión · ${next.until}`}</p>
        <h2 id="panel-next" className="font-exo text-lg font-bold uppercase tracking-[0.03em] text-txt-primary">{`Sesión ${next.number}`}</h2>
        <p className="mt-1 flex flex-wrap gap-x-2 text-[13px] text-txt-secondary">
          {next.time && <span>{next.time}</span>}
          {availability && <span>{`${availability.available} de ${availability.total} jugadores disponibles`}</span>}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {isDM ? (
            <>
              <Link to={entityPath(slug, 'sesion-en-vivo')} className={actionCls}>Abrir sesión en vivo</Link>
              <Link to={calendar} className={actionCls}>Ver calendario</Link>
            </>
          ) : (
            <Link to={calendar} className={actionCls}>Marcar mi disponibilidad</Link>
          )}
        </div>
      </div>
    </section>
  )
}
