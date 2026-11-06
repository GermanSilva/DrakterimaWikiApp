/**
 * The editable shape of an action function: every value is a string the way a form holds it. `toRaw` turns it into the loose
 * object `validateActionFunction` checks (the validator, not the form, decides what is valid); `toDraft` reads a stored one.
 */
import { describeFunctionError } from '../../system/actions/function/describeErrors'
import type { ActionFunction, EffectOp, Step } from '../../system/actions/function/model'
import { validateActionFunction } from '../../system/actions/function/validate'
import type { Sheet } from '../../system/sheet/sheetModel'

export interface DraftOption {
  label: string
  value: string
}
export type DraftStep =
  | { kind: 'param'; key: string; label: string; input: 'number' | 'checkbox' | 'options'; min: string; max: string; options: DraftOption[] }
  | { kind: 'effect'; label: string; target: 'field' | 'row' | 'state'; field: string; table: string; matchColumn: string; matchValue: string; column: string; op: EffectOp; value: string; max: string }
export type Draft = DraftStep[]

export const newParam = (): DraftStep => ({ kind: 'param', key: '', label: '', input: 'number', min: '', max: '', options: [] })
export const newEffect = (): DraftStep => ({ kind: 'effect', label: '', target: 'field', field: '', table: '', matchColumn: '', matchValue: '', column: '', op: 'add', value: '', max: '' })

const NUMBER = /^-?\d+(\.\d+)?$/
/** A bound or an option value: a plain number when it reads as one, the text (a formula, a word) otherwise. */
const numberOrText = (text: string): number | string => (NUMBER.test(text.trim()) ? Number(text) : text)
const optional = (text: string): number | string | undefined => (text.trim() === '' ? undefined : numberOrText(text.trim()))
const text = (value: unknown): string => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '')

export function toRaw(draft: Draft): unknown {
  return {
    steps: draft.map((step) => {
      if (step.kind === 'param') {
        const input =
          step.input === 'checkbox'
            ? { type: 'checkbox' }
            : step.input === 'options'
              ? { type: 'options', options: step.options.map((o) => ({ label: o.label, value: numberOrText(o.value) })) }
              : { type: 'number', ...(optional(step.min) !== undefined ? { min: optional(step.min) } : {}), ...(optional(step.max) !== undefined ? { max: optional(step.max) } : {}) }
        return { kind: 'param', key: step.key, label: step.label, input }
      }
      const target =
        step.target === 'field'
          ? { type: 'field', key: step.field }
          : step.target === 'state'
            ? { type: 'state', column: step.column }
            : { type: 'row', table: step.table, match: { column: step.matchColumn, value: step.matchValue }, column: step.column }
      return { kind: 'effect', ...(step.label.trim() !== '' ? { label: step.label } : {}), target, op: step.op, value: step.value, ...(step.max.trim() !== '' ? { max: step.max } : {}) }
    }),
  }
}

function stepToDraft(step: Step): DraftStep {
  if (step.kind === 'param') {
    const { input } = step
    return {
      kind: 'param',
      key: step.key,
      label: step.label,
      input: input.type,
      min: input.type === 'number' ? text(input.min) : '',
      max: input.type === 'number' ? text(input.max) : '',
      options: input.type === 'options' ? input.options.map((o) => ({ label: o.label, value: text(o.value) })) : [],
    }
  }
  const { target } = step
  return {
    kind: 'effect',
    label: step.label ?? '',
    target: target.type,
    field: target.type === 'field' ? target.key : '',
    table: target.type === 'row' ? target.table : '',
    matchColumn: target.type === 'row' ? target.match.column : '',
    matchValue: target.type === 'row' ? target.match.value : '',
    column: target.type === 'row' || target.type === 'state' ? target.column : '',
    op: step.op,
    value: step.value,
    max: step.max ?? '',
  }
}

/** The draft of a stored function; null when the entry has none (or the stored value is not a function we can show). */
export function toDraft(stored: unknown): Draft | null {
  if (stored === null || stored === undefined) return null
  const steps = (stored as Partial<ActionFunction>).steps
  if (!Array.isArray(steps)) return null
  try {
    return steps.map(stepToDraft)
  } catch {
    return null // a stored step of an unknown shape: shown as no function, never rewritten unless the DM changes it
  }
}

/** The Spanish errors of a draft against the sheet; empty when it is valid. */
export function draftErrors(draft: Draft, sheet: Sheet, tableKey: string | undefined): string[] {
  const checked = validateActionFunction(toRaw(draft), sheet, tableKey)
  return checked.ok ? [] : checked.errors.map(describeFunctionError)
}
