import { useState, useEffect } from 'react'
import { useApp } from '../AppContext'
import { NotebookPen, Trash2, Search, X } from 'lucide-react'
import { btnDanger, btnSecondary, btnPrimary } from '../constants'

const TYPE_LABELS = {
  sesiones:  'Sesión',
  pjs:       'PJ',
  pnjs:      'PNJ',
  lugares:   'Lugar',
  facciones: 'Facción',
  lore:      'Lore',
  items:     'Ítem',
}

const CHIP_VALUE = {
  sesiones:  'sesion',
  pjs:       'pj',
  pnjs:      'pnj',
  lugares:   'lugar',
  facciones: 'faccion',
  lore:      'lore',
  items:     'item',
}

function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function parseQuery(q) {
  const match = q.match(/\[([^\]]+)\]/)
  const sectionFilter = match ? match[1].trim() : null
  const textFilter = q.replace(/\[[^\]]*\]/, '').trim()
  return { sectionFilter, textFilter }
}

function entityName(db, type, entity_id) {
  const e = (db[type] || []).find(x => x.id === entity_id)
  if (!e) return `#${entity_id}`
  return e.nombre || e.titulo || (e.numero != null ? `Sesión ${e.numero}` : null) || `#${entity_id}`
}

function filterNotes(notes, parsed, db) {
  const { sectionFilter, textFilter } = parsed
  return notes.filter(note => {
    if (sectionFilter) {
      const sf = normalize(sectionFilter)
      const label = normalize(TYPE_LABELS[note.type] || note.type)
      const key = normalize(note.type)
      if (!label.includes(sf) && !key.includes(sf)) return false
    }
    if (textFilter) {
      const tf = normalize(textFilter)
      const title = normalize(entityName(db, note.type, note.entity_id))
      const text = normalize(note.text)
      const label = sectionFilter ? '' : normalize(TYPE_LABELS[note.type] || note.type)
      if (!title.includes(tf) && !text.includes(tf) && !label.includes(tf)) return false
    }
    return true
  })
}

function HighlightText({ text, term }) {
  if (!term || !text) return <>{text}</>
  const normText = normalize(text)
  const normTerm = normalize(term)
  if (!normTerm) return <>{text}</>
  const parts = []
  let last = 0
  let idx = normText.indexOf(normTerm)
  while (idx !== -1) {
    if (idx > last) parts.push(text.slice(last, idx))
    parts.push(<span key={idx} className="bg-accent/25 rounded-[2px]">{text.slice(idx, idx + normTerm.length)}</span>)
    last = idx + normTerm.length
    idx = normText.indexOf(normTerm, last)
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

function NoteCard({ note, db, onOpen, onDelete, textFilter }) {
  const name = entityName(db, note.type, note.entity_id)
  const label = TYPE_LABELS[note.type] || note.type
  return (
    <div
      className="bg-bg-card border border-border-base px-5 py-4 cursor-pointer transition-colors hover:border-accent-dim hover:bg-bg-card-hover"
      onClick={onOpen}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="font-exo text-[13px] font-semibold text-txt-primary tracking-[0.03em]">
          <HighlightText text={name} term={textFilter} />
        </span>
        <span className="font-exo text-[10px] tracking-[0.15em] uppercase text-txt-muted bg-border-light px-1.5 py-0.5 rounded-sm">
          {label}
        </span>
        {onDelete && (
          <button
            aria-label="Eliminar nota"
            className="ml-auto p-0.5 text-txt-muted hover:text-red-400 transition-colors cursor-pointer"
            onClick={e => { e.stopPropagation(); onDelete() }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      <div className="text-[13px] text-txt-secondary leading-[1.65] line-clamp-3">
        <HighlightText text={note.text} term={textFilter} />
      </div>
    </div>
  )
}

function NoteDetailModal({ note, db, goToDetail, onClose }) {
  const name = entityName(db, note.type, note.entity_id)
  const label = TYPE_LABELS[note.type] || note.type

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-bg-card border border-border-base p-6 w-[min(520px,92vw)] max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <span className="font-exo text-[15px] font-bold text-txt-primary tracking-[0.03em]">{name}</span>
          <span className="font-exo text-[10px] tracking-[0.15em] uppercase text-txt-muted bg-border-light px-1.5 py-0.5 rounded-sm">
            {label}
          </span>
          <button
            aria-label="Cerrar"
            className="ml-auto text-txt-muted hover:text-txt-primary transition-colors cursor-pointer"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="text-[13px] text-txt-secondary leading-[1.65] whitespace-pre-wrap mb-5">
          {note.text}
        </div>
        <div className="flex justify-end">
          <button
            className={btnPrimary}
            onClick={() => { goToDetail(note.type, note.entity_id); onClose() }}
          >
            Ir al artículo
          </button>
        </div>
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

function ConfirmModal({ note, db, onConfirm, onCancel }) {
  const name = entityName(db, note.type, note.entity_id)
  const label = TYPE_LABELS[note.type] || note.type

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
      onClick={onCancel}
    >
      <div
        className="bg-bg-card border border-border-base p-6 w-[min(380px,90vw)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="font-exo text-[15px] font-bold text-txt-primary mb-1">
          ¿Eliminar esta nota?
        </div>
        <div className="text-[13px] text-txt-muted mb-5">
          {name}
          <span className="font-exo text-[10px] tracking-[0.15em] uppercase ml-2">{label}</span>
        </div>
        <div className="flex gap-2.5 justify-end">
          <button className={btnDanger} onClick={onConfirm}>Eliminar</button>
          <button className={btnSecondary} onClick={onCancel}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}

function SearchBar({ query, onChange, sectionTypes }) {
  const { sectionFilter } = parseQuery(query)
  const activeSection = sectionFilter ? normalize(sectionFilter) : null

  function toggleChip(type) {
    const val = CHIP_VALUE[type]
    if (activeSection != null && normalize(val) === activeSection) {
      onChange(query.replace(/\s*\[[^\]]*\]\s*/g, ' ').trim())
    } else {
      const withoutBracket = query.replace(/\s*\[[^\]]*\]\s*/g, ' ').trim()
      onChange(`[${val}]${withoutBracket ? ' ' + withoutBracket : ''}`)
    }
  }

  return (
    <div className="mb-6">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted pointer-events-none" />
        <input
          type="text"
          className="w-full bg-bg-mid border border-border-base text-txt-primary text-[13px] font-[inherit] pl-8 pr-3 py-2 outline-none transition-colors focus:border-accent-dim placeholder:text-txt-muted"
          placeholder="Buscar… o [sección] texto"
          value={query}
          onChange={e => onChange(e.target.value)}
        />
      </div>
      {sectionTypes.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {sectionTypes.map(type => {
            const val = CHIP_VALUE[type]
            const isActive = activeSection != null && normalize(val) === activeSection
            return (
              <button
                key={type}
                className={`font-exo text-[10px] tracking-[0.1em] uppercase px-2.5 py-1 border transition-colors cursor-pointer ${
                  isActive
                    ? 'border-accent bg-accent/10 text-txt-primary'
                    : 'border-border-base text-txt-muted hover:border-border-light hover:text-txt-secondary'
                }`}
                onClick={() => toggleChip(type)}
              >
                {TYPE_LABELS[type]}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function Notas() {
  const { db, isDM, currentPlayer, goToDetail, deletePlayerNote } = useApp()
  const [selectedPjId, setSelectedPjId] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [openNote, setOpenNote] = useState(null)
  const [query, setQuery] = useState('')

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
    const allGrouped = (db.pjs || [])
      .map(pj => ({ pj, notes: activeNotes.filter(n => n.pj_id === pj.id) }))
      .filter(g => g.notes.length > 0)

    const activePjIds = new Set(allGrouped.map(g => g.pj.id))
    const effectiveFilter = activePjIds.has(selectedPjId) ? selectedPjId : null

    const pjFilteredNotes = effectiveFilter != null
      ? activeNotes.filter(n => n.pj_id === effectiveFilter)
      : activeNotes

    const dmSectionTypes = [...new Set(pjFilteredNotes.map(n => n.type))]

    const parsed = parseQuery(query)
    const displayed = (db.pjs || [])
      .map(pj => ({ pj, notes: filterNotes(pjFilteredNotes.filter(n => n.pj_id === pj.id), parsed, db) }))
      .filter(g => g.notes.length > 0)

    return (
      <div>
        <PageHeader />
        {allGrouped.length === 0 ? (
          <div className="text-txt-muted text-[13px] italic mt-8">
            No hay notas de jugadores todavía.
          </div>
        ) : (
          <>
            <SearchBar query={query} onChange={setQuery} sectionTypes={dmSectionTypes} />
            <div className="flex flex-wrap gap-2 mb-6">
              <button
                className={`font-exo text-[10px] tracking-[0.1em] uppercase px-3 py-1.5 border transition-colors cursor-pointer ${
                  effectiveFilter === null
                    ? 'border-accent bg-accent/10 text-txt-primary'
                    : 'border-border-base text-txt-muted hover:border-border-light hover:text-txt-secondary'
                }`}
                onClick={() => setSelectedPjId(null)}
              >
                Todas
              </button>
              {allGrouped.map(({ pj }) => (
                <button
                  key={pj.id}
                  className={`font-exo text-[10px] tracking-[0.1em] uppercase px-3 py-1.5 border transition-colors cursor-pointer ${
                    effectiveFilter === pj.id
                      ? 'border-accent bg-accent/10 text-txt-primary'
                      : 'border-border-base text-txt-muted hover:border-border-light hover:text-txt-secondary'
                  }`}
                  onClick={() => setSelectedPjId(pj.id)}
                >
                  {pj.nombre}
                </button>
              ))}
            </div>
            {displayed.length === 0 ? (
              <div className="text-txt-muted text-[13px] italic mt-4">
                No hay notas que coincidan con «{query}».
              </div>
            ) : (
              displayed.map(({ pj, notes }) => (
                <div key={pj.id} className="mb-8">
                  <div className="flex items-center gap-2 mb-3">
                    <NotebookPen size={13} className="text-txt-muted" />
                    <span className="font-exo text-[11px] font-semibold tracking-[0.2em] text-txt-muted uppercase">
                      {pj.nombre}{pj.jugador ? ` · ${pj.jugador}` : ''}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {notes.map(note => (
                      <NoteCard key={note.id} note={note} db={db} onOpen={() => setOpenNote(note)} onDelete={() => setPendingDelete(note)} textFilter={parsed.textFilter} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </>
        )}
        {openNote && (
          <NoteDetailModal note={openNote} db={db} goToDetail={goToDetail} onClose={() => setOpenNote(null)} />
        )}
        {pendingDelete && (
          <ConfirmModal
            note={pendingDelete}
            db={db}
            onConfirm={() => { deletePlayerNote(pendingDelete.id); setPendingDelete(null) }}
            onCancel={() => setPendingDelete(null)}
          />
        )}
      </div>
    )
  }

  const rawNotes = activeNotes.filter(n => n.pj_id === currentPlayer.id)
  const playerSectionTypes = [...new Set(rawNotes.map(n => n.type))]
  const parsedPlayer = parseQuery(query)
  const myNotes = filterNotes(rawNotes, parsedPlayer, db)

  return (
    <div>
      <PageHeader />
      {rawNotes.length === 0 ? (
        <div className="text-txt-muted text-[13px] italic mt-8">
          Todavía no tenés notas guardadas.
        </div>
      ) : (
        <>
          <SearchBar query={query} onChange={setQuery} sectionTypes={playerSectionTypes} />
          {myNotes.length === 0 ? (
            <div className="text-txt-muted text-[13px] italic mt-4">
              No hay notas que coincidan con «{query}».
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {myNotes.map(note => (
                <NoteCard key={note.id} note={note} db={db} onOpen={() => setOpenNote(note)} onDelete={() => setPendingDelete(note)} textFilter={parsedPlayer.textFilter} />
              ))}
            </div>
          )}
        </>
      )}
      {openNote && (
        <NoteDetailModal note={openNote} db={db} goToDetail={goToDetail} onClose={() => setOpenNote(null)} />
      )}
      {pendingDelete && (
        <ConfirmModal
          note={pendingDelete}
          db={db}
          onConfirm={() => { deletePlayerNote(pendingDelete.id); setPendingDelete(null) }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}
