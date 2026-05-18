import { useApp } from '../AppContext'
import { NotebookPen } from 'lucide-react'

const TYPE_LABELS = {
  sesiones:  'Sesión',
  pjs:       'PJ',
  pnjs:      'PNJ',
  lugares:   'Lugar',
  facciones: 'Facción',
  lore:      'Lore',
  items:     'Ítem',
}

function entityName(db, type, entity_id) {
  const e = (db[type] || []).find(x => x.id === entity_id)
  if (!e) return `#${entity_id}`
  return e.nombre || e.titulo || (e.numero != null ? `Sesión ${e.numero}` : null) || `#${entity_id}`
}

function NoteCard({ note, db, goToDetail }) {
  const name = entityName(db, note.type, note.entity_id)
  const label = TYPE_LABELS[note.type] || note.type
  return (
    <div
      className="bg-bg-card border border-border-base px-5 py-4 cursor-pointer transition-colors hover:border-accent-dim hover:bg-bg-card-hover"
      onClick={() => goToDetail(note.type, note.entity_id)}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="font-exo text-[13px] font-semibold text-txt-primary tracking-[0.03em]">
          {name}
        </span>
        <span className="font-exo text-[10px] tracking-[0.15em] uppercase text-txt-muted bg-border-light px-1.5 py-0.5 rounded-sm">
          {label}
        </span>
      </div>
      <div className="text-[13px] text-txt-secondary leading-[1.65] line-clamp-3">
        {note.text}
      </div>
    </div>
  )
}

function PageHeader() {
  return (
    <div className="mb-7 pb-5 border-b border-border-base">
      <div className="font-exo text-[10px] tracking-[0.3em] text-txt-muted uppercase mb-1 font-medium">
        Registro
      </div>
      <div className="font-exo text-[26px] font-bold text-txt-primary tracking-[0.04em] uppercase">
        Notas
      </div>
    </div>
  )
}

export default function Notas() {
  const { db, isDM, currentPlayer, goToDetail } = useApp()

  const activeNotes = (db.player_notes || []).filter(n => n.text?.trim())

  if (!isDM && !currentPlayer) {
    return (
      <div>
        <PageHeader />
        <div className="text-txt-muted text-[13px] italic mt-8">
          Accedé para ver tus notas.
        </div>
      </div>
    )
  }

  if (isDM) {
    const grouped = (db.pjs || [])
      .map(pj => ({ pj, notes: activeNotes.filter(n => n.pj_id === pj.id) }))
      .filter(g => g.notes.length > 0)

    return (
      <div>
        <PageHeader />
        {grouped.length === 0 ? (
          <div className="text-txt-muted text-[13px] italic mt-8">
            No hay notas de jugadores todavía.
          </div>
        ) : (
          grouped.map(({ pj, notes }) => (
            <div key={pj.id} className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <NotebookPen size={13} className="text-txt-muted" />
                <span className="font-exo text-[11px] font-semibold tracking-[0.2em] text-txt-muted uppercase">
                  {pj.nombre}{pj.jugador ? ` · ${pj.jugador}` : ''}
                </span>
              </div>
              <div className="flex flex-col gap-2.5">
                {notes.map(note => (
                  <NoteCard key={note.id} note={note} db={db} goToDetail={goToDetail} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    )
  }

  const myNotes = activeNotes.filter(n => n.pj_id === currentPlayer.id)

  return (
    <div>
      <PageHeader />
      {myNotes.length === 0 ? (
        <div className="text-txt-muted text-[13px] italic mt-8">
          Todavía no tenés notas guardadas.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {myNotes.map(note => (
            <NoteCard key={note.id} note={note} db={db} goToDetail={goToDetail} />
          ))}
        </div>
      )}
    </div>
  )
}
