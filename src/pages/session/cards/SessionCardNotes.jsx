import { useState, useEffect, useRef } from 'react'
import { useSessionScreenPort } from '../../../ports'
import { labelCls, inputCls } from '../../../constants'
import SessionCardShell from './SessionCardShell'
import { consumeEcho, trackSent } from './inflightEchoes'

export const NOTES_DEBOUNCE_MS = 800
export const NOTES_MAX_LENGTH = 50000

// `entry` is this card's own object inside `layout.cards[]` (design contract:
// { id, tipo: 'notes', text }). Text lives on the card entry itself — not a
// separate top-level `notesText` field — so reorder/removal never desyncs it
// from its card. The text is saved a moment after the last keystroke (and on
// blur / unmount), through the host's `patchCard`, so typing never produces a
// write per key.
export default function SessionCardNotes({ entry, onRemove }) {
  const port = useSessionScreenPort()
  const [text, setText] = useState(entry?.text ?? '')
  const sent = useRef(entry?.text ?? '') // last text handed to the host
  const inflight = useRef([]) // texts handed to the host whose echo (the layout carrying them) has not been seen yet
  const latest = useRef(text)
  const timer = useRef(null)
  const portRef = useRef(port)
  const entryId = entry?.id
  useEffect(() => { portRef.current = port })

  // A text that arrives from outside (another device, a reload) replaces the draft; our own echo does not. While
  // there is unsent local text (typed, or refused by the host) the textarea is NEVER overwritten: the draft stays and
  // is written on top of whatever arrived.
  useEffect(() => {
    const incoming = entry?.text ?? ''
    // The echo of one of OUR flushes (possibly an older one, when two went out before the first came back) never
    // touches the textarea: it would roll a newer draft back to an older text.
    const { echo, rest } = consumeEcho(inflight.current, incoming)
    inflight.current = rest
    if (echo) return
    if (incoming === sent.current) return
    const hasDraft = latest.current !== sent.current
    sent.current = incoming
    inflight.current = []
    if (!hasDraft) {
      latest.current = incoming
      setText(incoming)
    }
  }, [entry?.text])

  function flush() {
    clearTimeout(timer.current)
    timer.current = null
    if (entryId == null || latest.current === sent.current) return
    // A refused write (host not ready, over the size limit) leaves the text unsent: a later blur retries it.
    if (portRef.current.patchCard(entryId, { text: latest.current }) !== false) {
      sent.current = latest.current
      inflight.current = trackSent(inflight.current, latest.current)
    }
  }

  // Unmounting (tab closed, card removed) must not drop the last keystrokes.
  useEffect(() => () => flush(), []) // eslint-disable-line react-hooks/exhaustive-deps

  function onChange(e) {
    const value = e.target.value
    latest.current = value
    setText(value)
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, NOTES_DEBOUNCE_MS)
  }

  return (
    <SessionCardShell title="Notas" onRemove={onRemove}>
      <label className={labelCls}>Texto libre</label>
      <textarea
        aria-label="Notas de la sesión"
        className={`${inputCls} min-h-[160px] resize-y`}
        value={text}
        maxLength={NOTES_MAX_LENGTH}
        onChange={onChange}
        onBlur={flush}
        placeholder="Notas de la sesión..."
      />
    </SessionCardShell>
  )
}
