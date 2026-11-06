/** Small form pieces shared by the builder editors. Copy is Spanish; the look matches the rest of Ajustes. */
import { useId, type ReactNode } from 'react'
import { btnSecondary, inputCls } from '../../../constants'
import { useBuilder } from './builderContext'
import type { Path } from './draft'

export const smallBtn = `${btnSecondary} !px-2 !py-1 disabled:opacity-40 disabled:cursor-not-allowed`
const labelCls = 'block font-exo text-[10px] font-medium tracking-[0.2em] uppercase text-txt-muted mb-1.5'

export function TextInput({ label, value, onChange, readOnly = false, inputMode }: { label: string; value: string; onChange?: (value: string) => void; readOnly?: boolean; inputMode?: 'decimal' | 'numeric' }) {
  const id = useId()
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        className={`${inputCls}${readOnly ? ' opacity-70' : ''}`}
      />
    </div>
  )
}

export function SelectInput({ label, value, onChange, options, disabled = false }: { label: string; value: string; onChange: (value: string) => void; options: readonly { value: string; label: string }[]; disabled?: boolean }) {
  const id = useId()
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={`${inputCls}${disabled ? ' opacity-70' : ''}`}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function CheckInput({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-[13px] text-txt-secondary cursor-pointer">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="accent-accent" />
      {label}
    </label>
  )
}

interface ReorderProps {
  /** "categoría", "sección", "ítem"...: the noun in the button names ("Subir sección"). */
  noun: string
  index: number
  count: number
  onMove: (delta: -1 | 1) => void
  onRemove: () => void
}

/** Accessible reordering: up/down buttons (disabled at the ends) and remove. */
export function ReorderButtons({ noun, index, count, onMove, onRemove }: ReorderProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={smallBtn} disabled={index === 0} onClick={() => onMove(-1)}>
        {`Subir ${noun}`}
      </button>
      <button type="button" className={smallBtn} disabled={index === count - 1} onClick={() => onMove(1)}>
        {`Bajar ${noun}`}
      </button>
      <button type="button" className={smallBtn} onClick={onRemove}>
        {`Quitar ${noun}`}
      </button>
    </div>
  )
}

/** The errors of the part at `path`, listed where the DM is editing it. */
export function PanelErrors({ path }: { path: Path }) {
  const { errorsFor } = useBuilder()
  const errors = errorsFor(path)
  if (errors.length === 0) return null
  return (
    <ul aria-label="Errores de este elemento" className="text-[13px] text-red-400 list-disc pl-5">
      {errors.map((e, i) => (
        <li key={i}>{e.field !== '' ? `${e.field}: ${e.text}` : e.text}</li>
      ))}
    </ul>
  )
}

export function Panel({ name, path, children }: { name: string; path: Path; children: ReactNode }) {
  return (
    <div role="group" aria-label={name} className="border border-border-base px-3 py-3 flex flex-col gap-3">
      <PanelErrors path={path} />
      {children}
    </div>
  )
}
