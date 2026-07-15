import { useState, useEffect } from 'react'
import { useApp } from '../../../AppContext'
import { labelCls, inputCls } from '../../../constants'
import SessionCardShell from './SessionCardShell'

// `entry` is this card's own object inside `layout.cards[]` (design contract:
// { id, tipo: 'notes', text }). Text lives on the card entry itself — not a
// separate top-level `notesText` field — so reorder/removal never desyncs it
// from its card. `layout` (the full `game_config/session_screen` doc) is
// needed to reconstruct `cards[]` with only this entry's text updated.
export default function SessionCardNotes({ layout, entry, onRemove }) {
  const { saveSessionScreen } = useApp()
  const [text, setText] = useState(entry?.text ?? '')

  useEffect(() => { setText(entry?.text ?? '') }, [entry?.text])

  function persist() {
    if (!layout || !entry) return
    if (text === (entry.text ?? '')) return
    const cards = (layout.cards ?? []).map(c => (c.id === entry.id ? { ...c, text } : c))
    saveSessionScreen({ ...layout, cards })
  }

  return (
    <SessionCardShell title="Notas" onRemove={onRemove}>
      <label className={labelCls}>Texto libre</label>
      <textarea
        className={`${inputCls} min-h-[160px] resize-y`}
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={persist}
        placeholder="Notas de la sesión..."
      />
    </SessionCardShell>
  )
}
