/** The typed controls of the sheet editor, shared with the link panel of the action collection (S35-S37). */
import { inputCls } from '../../../constants'
import { LOCKED, numberText, textOf, toNumber } from './controlValues'
import type { Column } from './sheetModel'


export interface ControlSpec {
  label: string
  type: Column['type']
  editable: boolean
  value: unknown
  min?: number
  max?: number
  options?: { key: string; label: string }[]
  display?: 'select' | 'checkbox'
  default?: string | number | boolean
  id?: string
  /** Keeps an accessible name next to a visible <label htmlFor> (table rows, whose labels repeat). */
  name?: string
  onChange: (value: unknown) => void
  onFocus?: React.FocusEventHandler<HTMLTextAreaElement | HTMLInputElement>
  onBlur?: React.FocusEventHandler<HTMLTextAreaElement | HTMLInputElement>
}

/** One typed control by the type of its field or column; a locked one when the viewer cannot write it. */
export function Control({ label, type, editable, value, min, max, options = [], display, default: fallback, id, name, onChange, onFocus, onBlur }: ControlSpec) {
  if (type === 'number') {
    return <input id={id} aria-label={name ?? (id ? undefined : label)} className={`${inputCls} ${editable ? '' : LOCKED}`} type="number" min={min} max={max} value={numberText(value)} readOnly={!editable} onBlur={onBlur} onChange={(e) => onChange(toNumber(e.target.value))} />
  }
  if (type === 'boolean') {
    return <input id={id} aria-label={name ?? (id ? undefined : label)} type="checkbox" checked={typeof value === 'boolean' ? value : fallback === true} disabled={!editable} onChange={(e) => onChange(e.target.checked)} />
  }
  if (type === 'options') {
    const selected = typeof value === 'string' && options.some((o) => o.key === value) ? value : typeof fallback === 'string' ? fallback : ''
    if (display === 'checkbox' && options.length === 2) {
      return <input id={id} aria-label={name ?? (id ? undefined : label)} type="checkbox" checked={selected === options[1].key} disabled={!editable} onChange={(e) => onChange(e.target.checked ? options[1].key : options[0].key)} />
    }
    return (
      <select id={id} aria-label={name ?? (id ? undefined : label)} className={`${inputCls} ${editable ? '' : LOCKED}`} value={selected} disabled={!editable} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}>
        {selected === '' && <option value="">—</option>}
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    )
  }
  if (type === 'paragraph') {
    return <textarea id={id} aria-label={name ?? (id ? undefined : label)} className={`${inputCls} resize-y min-h-[70px] ${editable ? '' : LOCKED}`} rows={3} value={textOf(value)} readOnly={!editable} onFocus={onFocus} onBlur={onBlur} onChange={(e) => onChange(e.target.value)} />
  }
  return <input id={id} aria-label={name ?? (id ? undefined : label)} className={`${inputCls} ${editable ? '' : LOCKED}`} value={textOf(value)} readOnly={!editable} onBlur={onBlur} onChange={(e) => onChange(e.target.value)} />
}

/** A computed value (formula, calculation, option result): shown, never typed. */
export function Computed({ label, text, id, name, error = false }: { label: string; text: string; id?: string; name?: string; error?: boolean }) {
  return <input id={id} aria-label={name ?? (id ? undefined : label)} className={`${inputCls} ${LOCKED}`} readOnly value={error ? '—' : text} title={error ? 'No se pudo calcular' : 'Valor calculado'} />
}

