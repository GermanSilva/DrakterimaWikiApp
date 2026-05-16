import { useState } from 'react'
import { useApp } from '../AppContext'

function PlayerNoteEditor({ label, initialText, onSave }) {
  const [text, setText] = useState(initialText)
  const [dirty, setDirty] = useState(false)
  return (
    <div className="player-note-editor">
      {label && <div className="player-note-label">{label}</div>}
      <textarea
        className="player-note-textarea"
        value={text}
        placeholder="Escribe tus notas aquí…"
        rows={3}
        onChange={e => { setText(e.target.value); setDirty(true) }}
      />
      {dirty && (
        <button
          className="btn btn-primary player-note-save"
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
      <div className="player-notes-dm">
        <div className="player-notes-dm-title">📝 Notas de jugadores</div>
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
    <div className="player-notes-mine">
      <div className="player-notes-mine-title">📝 Mis notas</div>
      <PlayerNoteEditor
        label={null}
        initialText={note?.text || ''}
        onSave={text => savePlayerNote(currentPlayer.id, entityType, entityId, text)}
      />
    </div>
  )
}
