/** The formula text box: a textarea over a coloured copy of its text (S42 a), with the `{` autocomplete (S42 b). */
import { forwardRef, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { SourceSpan } from '../../formula/formula'
import type { ScopeEntry } from '../../sheet/formulaScope'
import { applyCompletion, completionAt, groupLabel, matchEntries } from './completion'
import { CompletionList } from './CompletionList'
import { highlight, type TokenKind } from './highlight'

/** What the chips next to the editor can do to it. */
export interface EditorHandle {
  /** Puts `snippet` at the caret (replacing the selection) and leaves the caret `caretInSnippet` characters into it. */
  insert: (snippet: string, caretInSnippet: number) => void
}

interface Props {
  id: string
  value: string
  onChange: (value: string) => void
  /** References valid here, in the order they are listed. */
  entries: readonly ScopeEntry[]
  /** The shown value of a reference for the test character. */
  valueOf: (ref: string) => string
  /** The row is a Stat (its locals are one value, not columns). */
  rowIsStat: boolean
  /** References to underline as unknown. */
  unknown: ReadonlySet<string>
  /** Where the parser found a problem. */
  error: SourceSpan | null
  invalid: boolean
  describedBy?: string
}

const KIND_CLASS: Record<TokenKind, string> = { ref: 'fx-ref', fn: 'fx-fn', str: 'fx-str', num: 'fx-num', op: 'fx-op', text: '' }

export const FormulaEditor = forwardRef<EditorHandle, Props>(function FormulaEditor({ id, value, onChange, entries, valueOf, rowIsStat, unknown, error, invalid, describedBy }, handle) {
  const listId = useId()
  const area = useRef<HTMLTextAreaElement>(null)
  const layer = useRef<HTMLPreElement>(null)
  const pendingCaret = useRef<number | null>(null)
  const [caret, setCaret] = useState(0)
  const [closed, setClosed] = useState(false)
  const [active, setActive] = useState(0)

  const completion = useMemo(() => (closed ? null : completionAt(value, caret)), [closed, value, caret])
  const matches = useMemo(() => (completion ? matchEntries(entries, completion) : []), [completion, entries])
  // An open brace that matches nothing keeps the popup, with a note, so the writer sees why the list went away.
  const noMatch = completion !== null && matches.length === 0 && completion.query !== '' && entries.length > 0
  const open = matches.length > 0 || noMatch
  const current = Math.min(active, matches.length - 1)
  const optionId = (index: number) => `${listId}-o${index}`
  const segments = useMemo(() => highlight(value, unknown, error), [value, unknown, error])

  // No resize grip: the box grows with its text instead (the coloured copy sits over it, so both follow).
  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    if (el.scrollHeight > 0) el.style.height = `${el.scrollHeight + 2}px`
  }, [value])

  // After the text changes from code (a pick or a chip), the caret goes where the edit says.
  useLayoutEffect(() => {
    const at = pendingCaret.current
    if (at === null || !area.current) return
    pendingCaret.current = null
    area.current.setSelectionRange(at, at)
    setCaret(at)
  }, [value])

  const edit = (next: string, at: number) => {
    pendingCaret.current = at
    setClosed(false)
    setActive(0)
    onChange(next)
    area.current?.focus()
  }

  useImperativeHandle(handle, () => ({
    insert: (snippet, caretInSnippet) => {
      const el = area.current
      const from = el?.selectionStart ?? value.length
      const to = el?.selectionEnd ?? from
      edit(value.slice(0, from) + snippet + value.slice(to), from + caretInSnippet)
    },
  }))

  const pick = (entry: ScopeEntry) => {
    if (!completion) return
    const done = applyCompletion(value, completion, area.current?.selectionStart ?? caret, entry.ref)
    edit(done.text, done.caret)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // A formula is one line: Enter never inserts a newline (with the list open it picks).
    if (e.key === 'Enter' && matches.length === 0) e.preventDefault()
    if (!open) return
    if (matches.length === 0) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setClosed(true)
      }
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((current + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      pick(matches[current])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setClosed(true)
    }
  }

  const sync = () => setCaret(area.current?.selectionStart ?? 0)

  return (
    <div className="relative bg-bg-mid">
      <pre
        ref={layer}
        data-formula-highlight
        aria-hidden="true"
        className="fx-text pointer-events-none absolute inset-0 overflow-hidden border border-transparent text-txt-primary"
      >
        {segments.map((seg, i) => (
          <span
            key={i}
            data-token={seg.kind}
            {...(seg.unknown ? { 'data-formula-unknown': '' } : {})}
            {...(seg.error ? { 'data-formula-error': '' } : {})}
            className={`${KIND_CLASS[seg.kind]}${seg.unknown ? ' fx-unknown' : ''}${seg.error ? ' fx-error' : ''}`}
          >
            {seg.text}
          </span>
        ))}
        {'\n'}
      </pre>
      <textarea
        ref={area}
        id={id}
        value={value}
        rows={2}
        spellCheck={false}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={matches.length > 0 ? optionId(current) : undefined}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => {
          setCaret(e.target.selectionStart)
          setClosed(false)
          setActive(0)
          onChange(e.target.value.replace(/\r\n|[\r\n]/g, ' '))
        }}
        onSelect={sync}
        onClick={sync}
        onKeyDown={onKeyDown}
        onBlur={() => setClosed(true)}
        onFocus={sync}
        onScroll={(e) => {
          if (layer.current) layer.current.scrollTop = e.currentTarget.scrollTop
        }}
        className="fx-text relative block resize-none overflow-hidden border border-border-base bg-transparent text-transparent caret-[#ececec] outline-none focus:border-accent-dim focus-visible:ring-1 focus-visible:ring-accent-dim"
      />
      {open && completion && (
        <CompletionList id={listId} entries={matches} note={noMatch ? `Nada coincide con «${completion.query}». Las claves usan minúsculas y _.` : undefined} active={current} heading={(e) => groupLabel(e.group, rowIsStat)} valueOf={valueOf} optionId={optionId} onPick={pick} />
      )}
    </div>
  )
})
