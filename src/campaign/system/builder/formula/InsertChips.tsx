import type { RefObject } from 'react'
import type { EditorHandle } from './FormulaEditor'

/** What each chip puts in the formula and where it leaves the caret (S42 c). */
const CHIPS: { label: string; snippet: string; caret: number }[] = [
  { label: '{ referencia }', snippet: '{}', caret: 1 },
  { label: 'floor()', snippet: 'floor()', caret: 6 },
  { label: 'si(cond, sí, no)', snippet: 'si(, , )', caret: 3 },
  { label: 'signo()', snippet: 'signo()', caret: 6 },
  { label: 'suma(tabla, col)', snippet: 'suma({}, "")', caret: 6 },
  { label: '& texto', snippet: ' & "" ', caret: 4 },
]

const chipCls =
  'font-mono text-[12px] px-2 py-0.5 border border-border-light bg-bg-mid text-txt-secondary cursor-pointer hover:text-txt-primary hover:border-accent-dim focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent-dim motion-reduce:transition-none'

/** Buttons that insert a reference or a common function at the caret of the editor. */
export function InsertChips({ editor }: { editor: RefObject<EditorHandle> }) {
  return (
    <div role="group" aria-label="Insertar" className="flex flex-wrap items-center gap-1.5 px-3.5 py-2.5">
      <span className="mr-1 font-exo text-[10px] font-medium tracking-[0.2em] uppercase text-txt-muted">Insertar</span>
      {CHIPS.map((chip) => (
        <button key={chip.label} type="button" className={chipCls} onClick={() => editor.current?.insert(chip.snippet, chip.caret)}>
          {chip.label}
        </button>
      ))}
    </div>
  )
}
