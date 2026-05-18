import { useState } from 'react'
import { useApp } from '../AppContext'
import { NotebookPen } from 'lucide-react'

function PlayerNoteEditor({ label, initialText, onSave }) {
  const [text, setText] = useState(initialText)
  const [dirty, setDirty] = useState(false)
  return (
    <div className="mb-3.5">
      {label && (
        <div className="text-[12px] text-txt-secondary font-semibold mb-1.5">{label}</div>
      )}
      <textarea
        className="w-full bg-bg-mid border border-border-base rounded-lg text-txt-primary text-[13px] font-[inherit] px-3 py-2.5 resize-y outline-none transition-colors focus:border-accent-dim box-border"
        value={text}
        placeholder="Escribe tus notas aquí…"
        rows={3}
        onChange={e => { setText(e.target.value); setDirty(true) }}
      />
      {dirty && (
        <button
          className="mt-1.5 inline-flex items-center gap-1.5 font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-3.5 py-1.5 cursor-pointer transition-all bg-accent text-white hover:bg-accent-bright"
          onClick={() => { onSave(text); setDirty(false) }}
        >
          Guardar nota
        </button>
      )}
    </div>
  )
}

export default function PlayerNotes({ entityType, entityId }) {
  const { db, isDM, currentPlayer, savePlayerNote } = useApp()

  if (!isDM && !currentPlayer) return null

  if (isDM) {
    const notes = (db.player_notes || []).filter(
      n => n.type === entityType && n.entity_id === entityId
    )
    if (notes.length === 0) return null
    return (
      <div className="mt-7 pt-5 border-t border-border-base">
        <div className="flex items-center gap-1.5 text-[10px] tracking-[0.12em] uppercase text-txt-muted font-exo mb-3">
          <NotebookPen size={12} />
          Notas de jugadores
        </div>
        {notes.map(note => {
          const pj = (db.pjs || []).find(p => p.id === note.pj_id)
          return (
            <PlayerNoteEditor
              key={note.pj_id}
              label={pj?.nombre || 'Jugador'}
              initialText={note.text}
              onSave={text => savePlayerNote(note.pj_id, entityType, entityId, text)}
            />
          )
        })}
      </div>
    )
  }

  const note = (db.player_notes || []).find(
    n => n.pj_id === currentPlayer.id && n.type === entityType && n.entity_id === entityId
  )
  return (
    <div className="mt-7 pt-5 border-t border-border-base">
      <div className="flex items-center gap-1.5 text-[10px] tracking-[0.12em] uppercase text-txt-muted font-exo mb-3">
        <NotebookPen size={12} />
        Mis notas
      </div>
      <PlayerNoteEditor
        label={null}
        initialText={note?.text || ''}
        onSave={text => savePlayerNote(currentPlayer.id, entityType, entityId, text)}
      />
    </div>
  )
}
