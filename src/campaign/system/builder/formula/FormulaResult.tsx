import { useId } from 'react'
import { inputCls } from '../../../../constants'
import { formatNumber } from '../../sheet/resolveSheet'
import type { Outcome } from './useFormulaAnalysis'
import type { TestCharacter } from './testCharacters'

/** What the field the formula belongs to will hold, so the result can say how it is shown. */
export type Expects = 'number' | 'boolean' | 'text'

interface Props {
  outcome: Outcome
  /** The formula does not parse or is empty: nothing to show but a dash. */
  broken: boolean
  expects: Expects
  /** The owner's number format ("+3" for signed). */
  format?: 'signed'
  characters: readonly TestCharacter[]
  selectedId: string
  onSelect: (id: string) => void
}

function describe(outcome: Outcome, broken: boolean, expects: Expects, format?: 'signed'): { value: string; type: string; shown: string | null } {
  if (outcome.kind === 'ok') {
    const { value } = outcome
    if (typeof value === 'string') return { value, type: 'Texto', shown: value }
    if (expects === 'boolean') return { value: String(value), type: 'Sí/No', shown: value !== 0 ? 'Sí' : 'No' }
    return { value: String(Math.round(value * 100) / 100), type: 'Número', shown: formatNumber(value, expects === 'number' ? format : undefined) }
  }
  if (outcome.kind === 'no-rows') return { value: '—', type: 'Sin filas para probar', shown: null }
  if (outcome.kind === 'error') return { value: '—', type: `No se pudo calcular con este personaje: ${outcome.reason}`, shown: null }
  return { value: '—', type: broken ? 'La ficha mostrará «—» hasta corregirla' : 'Sin fórmula', shown: null }
}

/** The result line (S42 d): value, its type, how the sheet shows it, and the test character it was calculated for. */
export function FormulaResult({ outcome, broken, expects, format, characters, selectedId, onSelect }: Props) {
  const selectId = useId()
  const { value, type, shown } = describe(outcome, broken, expects, format)
  return (
    <div role="group" aria-label="Resultado" className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border-base px-3.5 py-3">
      <div>
        <p className="font-exo text-[10px] font-medium tracking-[0.2em] uppercase text-txt-muted">Resultado</p>
        <p className="font-mono text-[22px] font-semibold text-txt-primary">{value}</p>
      </div>
      <p className="min-w-0 flex-1 text-[12px] text-txt-secondary">
        {shown !== null ? (
          <>
            {type} · se muestra como <b className="text-txt-primary">{shown}</b>
          </>
        ) : (
          type
        )}
      </p>
      <div className="flex items-center gap-2 text-[12px] text-txt-secondary max-[719px]:w-full">
        <label htmlFor={selectId}>Probar con</label>
        <select id={selectId} value={selectedId} onChange={(e) => onSelect(e.target.value)} className={`${inputCls} !w-auto max-[719px]:!w-full`}>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
