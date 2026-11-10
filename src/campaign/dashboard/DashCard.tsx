import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { linkFocus } from './uiHelpers'
import type { SourceStatus } from './useDashboardSources'

/** A panel card: labelled by its title, with an optional action (a link or a button) at the right of the title. */
export function DashCard({ id, title, action, className = '', children }: { id: string; title: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={`bg-bg-card border border-border-base p-5 ${className}`}>
      <div className="flex items-baseline justify-between gap-2 mb-3.5 font-exo text-[9px] tracking-[0.25em] uppercase text-txt-muted">
        <h2 id={id} className="font-medium">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function CardLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={`tracking-[0.15em] text-txt-secondary hover:text-accent-bright ${linkFocus}`}>
      {children}
    </Link>
  )
}

/** What a card shows instead of its content while its data is loading or failed (never invented zeros). */
export function StatusText({ status, empty }: { status: SourceStatus; empty: string }) {
  if (status === 'loading') return <p className="text-[13px] text-txt-muted">—</p>
  return <p className={`text-[13px] ${status === 'error' ? 'text-txt-secondary' : 'text-txt-muted italic'}`}>{status === 'error' ? 'No se pudo cargar.' : empty}</p>
}

/** Read / unread marker of a news row. */
export function Dot({ unread }: { unread: boolean }) {
  return (
    <span
      role="img"
      aria-label={unread ? 'No leído' : 'Leído'}
      className={`mt-1.5 h-2 w-2 rounded-full ${unread ? 'bg-accent-bright shadow-[0_0_6px_rgb(var(--accent-bright-rgb)/0.65)]' : 'border border-border-light'}`}
    />
  )
}
