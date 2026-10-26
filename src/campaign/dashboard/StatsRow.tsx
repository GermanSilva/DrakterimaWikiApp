import { Link } from 'react-router'
import type { LucideIcon } from 'lucide-react'

export interface Stat {
  key: string
  label: string
  /** Section path (`/c/:slug/<path>`). */
  path: string
  Icon: LucideIcon
  /** null while the list is loading or failed to load. */
  value: number | null
}

/** One wrapping row of small count chips (at most two lines on a phone, one on a desktop). */
export function StatsRow({ slug, stats }: { slug: string; stats: Stat[] }) {
  return (
    <ul aria-label="Estadísticas" className="flex flex-wrap gap-2 mb-8">
      {stats.map(({ key, label, path, Icon, value }) => (
        <li key={key} className='flex-1 flex'>
          <Link
            to={`/c/${encodeURIComponent(slug)}/${path}`}
            className="flex-1 inline-flex items-center gap-2 bg-bg-card border border-border-base px-3 py-1.5 transition-colors hover:border-accent-dim hover:bg-bg-card-hover"
          >
            <Icon size={14} className="text-txt-muted" aria-hidden="true" />
            <span className="font-exo text-[18px] font-bold text-accent leading-none">{value ?? '—'}</span>
            <span className="font-exo text-[9px] font-medium tracking-[0.2em] text-txt-muted uppercase">{label}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
