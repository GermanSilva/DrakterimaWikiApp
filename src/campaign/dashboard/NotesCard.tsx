import type { DmNotesRow, PlayerNote } from '../../data'
import { entityPath } from '../navigation'
import { CardLink, DashCard, StatusText } from './DashCard'
import type { SourceStatus } from './useDashboardSources'

const noteCls = 'mt-2.5 border-l-2 border-border-light py-0.5 pl-3 text-[13px] leading-relaxed text-txt-primary'
const noteTargetCls = 'block text-[11px] text-txt-muted'

export interface NotesCardProps {
  slug: string
  isDM: boolean
  myNotes: PlayerNote[]
  hooks: DmNotesRow[]
  titleOf: (table: string, id: number) => string
  status: SourceStatus
}

/** Player: their latest notes. DM: the open hooks they left in their private notes. */
export function NotesCard({ slug, isDM, myNotes, hooks, titleOf, status }: NotesCardProps) {
  const rows = isDM
    ? hooks.map((h) => ({ key: `${h.entity_type}-${h.entity_id}`, target: titleOf(h.entity_type, h.entity_id), text: h.ganchos }))
    : myNotes.map((n) => ({ key: `${n.entity_type}-${n.entity_id}`, target: `sobre ${titleOf(n.entity_type, n.entity_id)}`, text: n.text }))
  return (
    <DashCard id="panel-notes" title={isDM ? 'Ganchos abiertos' : 'Mis últimas notas'} action={<CardLink to={entityPath(slug, 'notas')}>Notas →</CardLink>}>
      {rows.length === 0 ? (
        <StatusText status={status} empty={isDM ? 'No hay ganchos abiertos.' : 'Todavía no escribiste notas.'} />
      ) : (
        rows.map((r) => (
          <p key={r.key} className={noteCls}>
            <small className={noteTargetCls}>{r.target}</small>
            {r.text}
          </p>
        ))
      )}
    </DashCard>
  )
}
