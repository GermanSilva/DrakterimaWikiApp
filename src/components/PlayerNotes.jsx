import { useState } from 'react'
import { usePlayerNotesPort } from '../ports'
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
  const port = usePlayerNotesPort()

  if (port.role === 'none' || port.loading) return null

  if (port.role === 'dm') {
    const notes = port.entriesFor(entityType, entityId)
    if (notes.length === 0) return null
    return (
      <div className="mt-7 pt-5 border-t border-border-base">
        <div className="flex items-center gap-1.5 text-[10px] tracking-[0.12em] uppercase text-txt-muted font-exo mb-3">
          <NotebookPen size={12} />
          Notas de jugadores
        </div>
        {notes.map(note => (
          <PlayerNoteEditor
            key={note.key}
            label={note.label}
            initialText={note.text}
            onSave={text => port.save(entityType, entityId, text, note.key)}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="mt-7 pt-5 border-t border-border-base">
      <div className="flex items-center gap-1.5 text-[10px] tracking-[0.12em] uppercase text-txt-muted font-exo mb-3">
        <NotebookPen size={12} />
        Mis notas
      </div>
      <PlayerNoteEditor
        label={null}
        initialText={port.mine(entityType, entityId)}
        onSave={text => port.save(entityType, entityId, text)}
      />
    </div>
  )
}
