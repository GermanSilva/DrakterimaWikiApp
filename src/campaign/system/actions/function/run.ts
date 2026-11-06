/**
 * Runs the function of an action against a character (S22): pure, nothing is written. The result is the patch the caller
 * may store, what each effect applied (for the session undo) and the warnings the DM must confirm. A step that cannot run
 * (bad parameter, formula that fails, row not found) applies nothing and says so; a step that would pass a limit still
 * computes and warns, so the UI decides whether to force. Later steps see the effects of the earlier ones.
 */
import { resolveSheetItems, sheetEvaluator, type FormulaOutcome } from '../../sheet/resolveSheet'
import type { Sheet } from '../../sheet/sheetModel'
import { findTable, isRowTable, resolveFieldTarget } from './lookup'
import type { ActionFunction, EffectStep, ParamStep } from './model'
import { findRow, patchOf, readTarget, startWorking, writeTarget, type AppliedTarget, type Patch } from './working'

export type ParamValue = number | boolean | string

export interface RunInput {
  sheet: Sheet
  pj: Record<string, unknown>
  /** The link of the action itself; `state` holds its character-scope columns. */
  link: { state: Record<string, unknown> }
  /** What the DM answered, by parameter key. An options parameter is the hidden value of the chosen option; a missing checkbox is false. */
  params: Record<string, ParamValue>
}

/** What one effect did. `label` names it for the user, `min` is the floor an undo respects (none: unbounded). */
export interface Applied {
  step: number
  label: string
  target: AppliedTarget
  before: number
  after: number
  delta: number
  min?: number
}

export type RunWarningKind = 'exhausted' | 'missing_row' | 'formula_error' | 'invalid_param' | 'invalid_value'
export interface RunWarning {
  step: number
  kind: RunWarningKind
  /** Spanish, for the user. */
  message: string
  /** The formula engine's own message, when there is one. */
  detail?: string
}

export interface RunResult {
  patch: Patch
  applied: Applied[]
  warnings: RunWarning[]
}

const own = (record: Record<string, unknown>, key: string): unknown => (Object.hasOwn(record, key) ? record[key] : undefined)
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

export function runActionFunction(fn: ActionFunction, input: RunInput): RunResult {
  const { sheet } = input
  const work = startWorking(input.pj, input.link.state)
  const applied: Applied[] = []
  const warnings: RunWarning[] = []
  const params = new Map<string, ParamValue>()

  // the evaluator reads a snapshot of the character: rebuilt after every write
  let evaluator: ReturnType<typeof sheetEvaluator> | null = null
  const evaluate = (formula: string, rowValues?: ReadonlyMap<string, unknown>): FormulaOutcome => {
    evaluator ??= sheetEvaluator(sheet, work.pj)
    return evaluator(formula, (ref) => {
      if (params.has(ref)) return params.get(ref)
      if (rowValues?.has(ref)) return rowValues.get(ref)
      const state = own(work.state, ref)
      return typeof state === 'number' || typeof state === 'boolean' ? state : undefined
    })
  }
  const write = (target: AppliedTarget, value: number): boolean => {
    const done = writeTarget(work, target, value)
    if (done) evaluator = null
    return done
  }

  const warn = (step: number, kind: RunWarningKind, message: string, detail?: string) => void warnings.push({ step, kind, message, ...(detail !== undefined ? { detail } : {}) })
  const formulaFailed = (step: number, what: string, error: string) => warn(step, 'formula_error', `No se pudo calcular la fórmula de ${what}.`, error)

  const runParam = (step: ParamStep, index: number) => {
    const bad = (why: string) => warn(index, 'invalid_param', `Parámetro «${step.label}»: ${why}.`)
    const raw = own(input.params, step.key)
    const { input: kind } = step
    if (kind.type === 'checkbox') {
      if (raw === undefined || typeof raw === 'boolean') params.set(step.key, raw ?? false)
      else bad('debe ser sí o no')
      return
    }
    if (kind.type === 'options') {
      const option = kind.options.find((o) => o.value === raw)
      if (raw === undefined) bad('falta elegir una opción')
      else if (!option) bad('no es una opción válida')
      else params.set(step.key, option.value)
      return
    }
    if (raw === undefined) return bad('falta el valor')
    if (!isFiniteNumber(raw)) return bad('no es un número')
    for (const side of ['min', 'max'] as const) {
      const limit = kind[side]
      const resolved = typeof limit === 'string' ? evaluate(limit) : limit === undefined ? undefined : ({ ok: true, value: limit } as const)
      if (resolved && !resolved.ok) return formulaFailed(index, `${side === 'min' ? 'el mínimo' : 'el máximo'} de «${step.label}»`, resolved.error)
      if (resolved && (side === 'min' ? raw < resolved.value : raw > resolved.value)) return bad(`debe ser ${side === 'min' ? 'mayor o igual a' : 'menor o igual a'} ${resolved.value}`)
    }
    params.set(step.key, raw)
  }

  const runEffect = (step: EffectStep, index: number) => {
    let target: AppliedTarget
    let rowValues: Map<string, unknown> | undefined
    let name: string
    let min: number | undefined
    let fallback = 0
    if (step.target.type === 'field') {
      const resolved = resolveFieldTarget(sheet, step.target.key)
      if (!resolved.ok) return warn(index, 'formula_error', `El destino «${step.target.key}» no existe en esta hoja.`, resolved.reason)
      target = { type: 'field', key: resolved.key }
      name = resolved.field.label
      min = resolved.field.min
      if (isFiniteNumber(resolved.field.default)) fallback = resolved.field.default
    } else if (step.target.type === 'state') {
      target = { type: 'state', column: step.target.column }
      name = step.target.column
      min = 0
    } else {
      const spec = step.target
      const table = findTable(sheet, spec.table)
      if (!isRowTable(table)) return warn(index, 'formula_error', `La tabla «${spec.table}» no existe en esta hoja.`)
      const match = evaluate(spec.match.value)
      if (!match.ok) return formulaFailed(index, `la fila de «${table.label}»`, match.error)
      target = { type: 'row', table: table.key, match: { column: spec.match.column, value: match.value }, column: spec.column }
      const matchLabel = table.columns.find((c) => c.key === spec.match.column)?.label ?? spec.match.column
      name = `${table.label} (${matchLabel} ${match.value}) › ${table.columns.find((c) => c.key === spec.column)?.label ?? spec.column}`
      const found = readTarget(work, target)
      if (!found.found) return warn(index, 'missing_row', `No hay una fila de «${table.label}» con ${matchLabel} = ${match.value}.`)
      min = 0
      const column = table.columns.find((c) => c.key === spec.column)
      if (isFiniteNumber(column?.default)) fallback = column.default
      // the columns of the matched row (formula columns computed) are local values of this step
      const resolvedTable = resolveSheetItems(sheet, work.pj)[table.key]
      if (resolvedTable?.kind === 'rows') {
        const shown = resolvedTable.storedIndex.indexOf(findRow(work.pj, table.key, target.match.column, target.match.value))
        const row = resolvedTable.rows[shown] ?? {}
        rowValues = new Map(table.columns.flatMap((c) => (typeof row[c.key] === 'number' || typeof row[c.key] === 'boolean' ? [[c.key, row[c.key]] as const] : [])))
      }
    }
    const label = step.label ?? name

    const value = evaluate(step.value, rowValues)
    if (!value.ok) return formulaFailed(index, `«${label}»`, value.error)
    const limit = step.max === undefined ? undefined : evaluate(step.max, rowValues)
    if (limit && !limit.ok) return formulaFailed(index, `el máximo de «${label}»`, limit.error)

    const current = readTarget(work, target)
    if (current.found && current.invalid) return warn(index, 'invalid_value', `«${label}» guarda «${String(current.invalid.stored)}», que no es un número: corregilo en la ficha antes de usar la acción.`)
    const before = (current.found ? current.value : undefined) ?? fallback
    const after = step.op === 'set' ? value.value : step.op === 'add' ? before + value.value : before - value.value
    if (!Number.isFinite(after) || !write(target, after)) return formulaFailed(index, `«${label}»`, 'the result is not a finite number')
    applied.push({ step: index, label, target, before, after, delta: after - before, ...(min !== undefined ? { min } : {}) })
    if (limit && after > limit.value) warn(index, 'exhausted', `«${label}» supera el máximo (${after} de ${limit.value}).`)
    if (min !== undefined && after < min) warn(index, 'exhausted', `«${label}» queda por debajo del mínimo (${after}, mínimo ${min}).`)
  }

  fn.steps.forEach((step, index) => {
    if (step.kind === 'param') runParam(step, index)
    else if (step.kind === 'effect') runEffect(step, index)
  })
  return { patch: patchOf(work), applied, warnings }
}

