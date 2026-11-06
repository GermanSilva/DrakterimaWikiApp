/** Helpers every item editor uses: read/patch one node of the draft, a number input and a formula input with live feedback. */
import { useId, useState } from 'react'
import { inputCls } from '../../../constants'
import { parseFormula } from '../formula/formula'
import { formulaErrorEs } from './messagesEs'

const labelCls = 'block font-exo text-[10px] font-medium tracking-[0.2em] uppercase text-txt-muted mb-1.5'

/** A number typed by the DM: empty removes it, text that is not a number is not committed (what was typed stays on screen until blur). */
export function NumberInput({ label, value, onChange }: { label: string; value: unknown; onChange: (value: number | undefined) => void }) {
  const id = useId()
  const [typed, setTyped] = useState<string | null>(null)
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={typed ?? (typeof value === 'number' ? String(value) : '')}
        onChange={(e) => {
          const raw = e.target.value
          setTyped(raw)
          const parsed = Number(raw.trim().replace(',', '.'))
          if (raw.trim() === '') onChange(undefined)
          else if (Number.isFinite(parsed)) onChange(parsed)
        }}
        onBlur={() => setTyped(null)}
        className={inputCls}
      />
    </div>
  )
}

/** A formula text with its live parse result (valid, or why not) under it. */
export function FormulaInput({ label, value, onChange, optional = false }: { label: string; value: string; onChange: (value: string) => void; optional?: boolean }) {
  const id = useId()
  const parsed = value.trim() === '' && optional ? null : parseFormula(value)
  const feedback = parsed === null ? null : parsed.ok ? 'Fórmula válida.' : `Fórmula no válida: ${formulaErrorEs(parsed.error)}`
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      <input id={id} type="text" value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={feedback ? `${id}-feedback` : undefined} aria-invalid={parsed && !parsed.ok ? true : undefined} className={`${inputCls} font-mono`} />
      {feedback && (
        <p id={`${id}-feedback`} role={parsed && !parsed.ok ? 'alert' : 'status'} className={`text-[12px] mt-1 ${parsed && !parsed.ok ? 'text-red-400' : 'text-txt-muted'}`}>
          {feedback}
        </p>
      )}
    </div>
  )
}
