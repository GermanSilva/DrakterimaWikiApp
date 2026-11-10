import { Link } from 'react-router'
import { entityPath } from '../navigation'
import { DashCard, Dot, StatusText } from './DashCard'
import { linkFocus, shortDate } from './uiHelpers'
import type { NewsEntry, NewsTable, NoteFeedEntry, SheetChange } from './dashboardData'
import type { SourceStatus } from './useDashboardSources'

const KIND: Record<NewsTable, string> = { sesiones: 'Sesión', pnjs: 'PNJ', lugares: 'Lugar', facciones: 'Facción', lore: 'Lore', items: 'Ítem' }

const rowCls = `grid grid-cols-[12px_1fr_auto] items-baseline gap-2.5 border-t border-border-base py-2.5 group-first:border-t-0 hover:[&_b]:text-accent-bright ${linkFocus}`
const MarkRead = ({ onClick }: { onClick: () => void }) => (
  <button type="button" onClick={onClick} className={`font-exo tracking-[0.15em] text-txt-secondary uppercase hover:text-accent-bright ${linkFocus}`}>
    Marcar leído
  </button>
)

function Row({ to, unread, title, detail, at }: { to: string; unread: boolean; title: string; detail: string; at: string }) {
  return (
    <li className="group list-none">
      <Link to={to} className={rowCls}>
        <Dot unread={unread} />
        <span className="min-w-0">
          <b className="text-[13px] font-semibold text-txt-primary">{title}</b>
          <small className="block text-[11.5px] leading-normal text-txt-secondary">{detail}</small>
        </span>
        <time className="whitespace-nowrap text-[11px] text-txt-muted">{shortDate(at)}</time>
      </Link>
    </li>
  )
}

/** Player: what changed in the world since their last visit. */
export function PlayerNewsCard({ slug, entries, status, onMarkRead }: { slug: string; entries: NewsEntry[]; status: SourceStatus; onMarkRead: () => void }) {
  return (
    <DashCard id="panel-news" title="Desde tu última visita" action={<MarkRead onClick={onMarkRead} />}>
      {entries.length === 0 ? (
        <StatusText status={status} empty="Nada nuevo todavía." />
      ) : (
        <ul>
          {entries.map((e) => (
            <Row key={`${e.table}-${e.entity.id}`} to={entityPath(slug, e.table, e.entity.id)} unread={e.unread} title={e.title} detail={`${KIND[e.table]} ${e.fresh ? 'nuevo' : 'actualizado'}`} at={e.at} />
          ))}
        </ul>
      )}
    </DashCard>
  )
}

const joinSections = (names: string[]): string => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`)

function Group({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-3 first:mt-0">
      <h3 id={id} className="mb-1 font-exo text-[10px] font-semibold uppercase tracking-[0.15em] text-txt-secondary">
        {title}
      </h3>
      {children}
    </section>
  )
}

export interface DmNewsCardProps {
  slug: string
  notes: NoteFeedEntry[]
  notesStatus: SourceStatus
  changes: SheetChange[]
  changesStatus: SourceStatus
  onMarkRead: () => void
}

/** DM: what the players wrote and which sheets changed since their last visit. */
export function DmNewsCard({ slug, notes, notesStatus, changes, changesStatus, onMarkRead }: DmNewsCardProps) {
  return (
    <DashCard id="panel-news" title="Desde tu última visita" action={<MarkRead onClick={onMarkRead} />}>
      <Group id="panel-news-notes" title="Notas de jugadores">
        {notes.length === 0 ? (
          <StatusText status={notesStatus} empty="Sin notas de jugadores." />
        ) : (
          <ul>
            {notes.map((n) => (
              <Row key={`${n.note.user_id}-${n.note.entity_type}-${n.note.entity_id}`} to={entityPath(slug, n.note.entity_type, n.note.entity_id)} unread={n.unread} title={n.heading} detail={`“${n.excerpt}”`} at={n.note.updated_at} />
            ))}
          </ul>
        )}
      </Group>
      <Group id="panel-news-sheets" title="Cambios en fichas">
        {changes.length === 0 ? (
          <StatusText status={changesStatus} empty="Sin cambios en fichas." />
        ) : (
          <ul>
            {changes.map((c) => (
              <Row key={c.pj.id} to={entityPath(slug, 'pjs', c.pj.id)} unread={c.unread} title={c.heading} detail={`Cambios en ${joinSections(c.sections)}`} at={new Date(c.at).toISOString()} />
            ))}
          </ul>
        )}
      </Group>
    </DashCard>
  )
}
