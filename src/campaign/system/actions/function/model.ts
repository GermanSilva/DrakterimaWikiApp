/**
 * The function of an action (S22): a list of steps. A parameter step asks the DM for one value (a number, a flag or one option
 * of a list); an effect step changes one number with a formula that may read the parameters asked EARLIER. Formulas use the sheet
 * formula language; parameters are referenced as {key}. Pure data: nothing here runs or stores anything.
 */
export const FUNCTION_LIMITS = { steps: 20, options: 20, optionValueText: 40 } as const

export interface ParamOption {
  label: string
  /** Hidden from the DM, what the formulas read as {param}. */
  value: number | string
}
export type ParamInput =
  /** `min` and `max` are numbers or formulas (they may read the sheet, the state of the link and earlier parameters). */
  | { type: 'number'; min?: number | string; max?: number | string }
  | { type: 'checkbox' }
  | { type: 'options'; options: ParamOption[] }
export interface ParamStep {
  kind: 'param'
  key: string
  label: string
  input: ParamInput
}

export type EffectOp = 'set' | 'add' | 'subtract'
export const EFFECT_OPS: readonly EffectOp[] = ['set', 'add', 'subtract']
export type EffectTarget =
  /** `key` names a number field or a role (hp, hp_current...) bound in the sheet; a field key wins over a role name. */
  | { type: 'field'; key: string }
  /** The row of a Libre table whose `match.column` equals the value of the `match.value` formula; changes `column` of that row. */
  | { type: 'row'; table: string; match: { column: string; value: string }; column: string }
  /** A character-scope column of the link of the action itself. */
  | { type: 'state'; column: string }
export interface EffectStep {
  kind: 'effect'
  label?: string
  target: EffectTarget
  op: EffectOp
  value: string
  /** Exceeding it is a warning ('exhausted'), never an error. On a row target the formula can read the columns of the matched row. */
  max?: string
}
export type Step = ParamStep | EffectStep
export interface ActionFunction {
  steps: Step[]
}

export interface FunctionError {
  path: string
  message: string
}
export type FunctionResult = { ok: true; fn: ActionFunction } | { ok: false; errors: FunctionError[] }
