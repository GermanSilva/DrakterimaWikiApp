/**
 * Validates the function of an action against the sheet it runs on (S22). Like validateSheet it rebuilds a normalised
 * function (only known properties survive, labels trimmed) or reports every problem with its path (`steps[1].target.key`).
 * `tableKey` is the Habilidad table of the action: `state` targets and state references need it.
 */
import { formulaUses, parseFormula } from '../../formula/formula'
import { sheetKeys } from '../../sheet/roles'
import type { Column, Sheet } from '../../sheet/sheetModel'
import { cleanLabel } from '../../systemProfile'
import { findTable, isRowTable, isStoredNumber, numericColumns, resolveFieldTarget } from './lookup'
import { EFFECT_OPS, FUNCTION_LIMITS, type ActionFunction, type EffectOp, type EffectStep, type EffectTarget, type FunctionError, type FunctionResult, type ParamInput, type ParamOption, type ParamStep, type Step } from './model'

const KEY = /^[a-z][a-z0-9_]{0,39}$/
const PROTOTYPE_KEYS: ReadonlySet<string> = new Set(['constructor', 'prototype', '__proto__'])

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

export function validateActionFunction(raw: unknown, sheet: Sheet, tableKey?: string): FunctionResult {
  const errors: FunctionError[] = []
  const fail = (path: string, message: string) => void errors.push({ path, message })
  if (!isRecord(raw) || !Array.isArray(raw.steps) || raw.steps.length < 1 || raw.steps.length > FUNCTION_LIMITS.steps) {
    return { ok: false, errors: [{ path: 'steps', message: `a function needs 1 to ${FUNCTION_LIMITS.steps} steps` }] }
  }
  const steps: unknown[] = raw.steps

  const known = sheetKeys(sheet)
  known.add('nivel')
  const action = tableKey === undefined ? undefined : findTable(sheet, tableKey)
  const stateLocals = new Set(action?.type === 'habilidad' ? numericColumns(action.columns.filter((c) => c.scope === 'character')).map((c) => c.key) : [])
  // the first step that declares each parameter key
  const declaredAt = new Map<string, number>()
  steps.forEach((step, index) => {
    if (isRecord(step) && step.kind === 'param' && typeof step.key === 'string' && !declaredAt.has(step.key)) declaredAt.set(step.key, index)
  })

  /** Checks a formula at the step `index`: it parses, and every reference is a parameter declared before, a local, or a sheet name. */
  const formulaOf = (value: unknown, path: string, index: number, locals: ReadonlySet<string> = new Set()): string | undefined => {
    const parsed = typeof value === 'string' ? parseFormula(value) : null
    if (!parsed || !parsed.ok) {
      fail(path, 'invalid formula')
      return undefined
    }
    let ok = true
    const reject = (message: string) => {
      ok = false
      fail(path, message)
    }
    for (const ref of formulaUses(parsed.ast).plain) {
      const at = declaredAt.get(ref)
      if (at !== undefined && !ref.includes('.')) {
        if (at >= index) reject(`parameter {${ref}} is declared by a later step`)
      } else if (locals.has(ref) || stateLocals.has(ref)) continue
      else if (!known.has(ref.split('.')[0])) reject(`unknown reference {${ref}}`)
      else if (findTable(sheet, ref)) reject(`{${ref}} is a table, use it inside a table function`)
    }
    for (const { table, columns } of formulaUses(parsed.ast).tables) {
      const source = findTable(sheet, table)
      const names = source?.type === 'monedas' ? ['key', 'label', 'value'] : isRowTable(source) ? source.columns.map((c) => c.key) : null
      if (!names) reject(`{${table}} is not a table that functions can read`)
      else for (const column of columns) if (!names.includes(column)) reject(`{${table}} has no column ${column}`)
    }
    return ok ? (value as string) : undefined
  }

  const bound = (value: unknown, path: string, index: number): number | string | undefined => {
    if (value === undefined) return undefined
    if (typeof value === 'string') return formulaOf(value, path, index)
    if (isFiniteNumber(value)) return value
    fail(path, 'a bound is a number or a formula')
    return undefined
  }

  const inputOf = (raw: unknown, path: string, index: number): ParamInput => {
    const src = isRecord(raw) ? raw : {}
    if (src.type === 'checkbox') return { type: 'checkbox' }
    if (src.type === 'number') {
      const min = bound(src.min, `${path}.min`, index)
      const max = bound(src.max, `${path}.max`, index)
      if (typeof min === 'number' && typeof max === 'number' && min > max) fail(path, 'min is above max')
      return { type: 'number', ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) }
    }
    if (src.type !== 'options') {
      fail(`${path}.type`, 'the input is number, checkbox or options')
      return { type: 'checkbox' }
    }
    const list = Array.isArray(src.options) ? src.options : []
    if (list.length < 1 || list.length > FUNCTION_LIMITS.options) fail(`${path}.options`, `options need 1 to ${FUNCTION_LIMITS.options} entries`)
    const seen = new Set<unknown>()
    const options: ParamOption[] = []
    list.slice(0, FUNCTION_LIMITS.options).forEach((option, at) => {
      const here = `${path}.options[${at}]`
      const src = isRecord(option) ? option : {}
      const label = cleanLabel(src.label)
      if (label === null) fail(`${here}.label`, 'invalid label')
      const value = src.value
      const usable = isFiniteNumber(value) || (typeof value === 'string' && value !== '' && Array.from(value).length <= FUNCTION_LIMITS.optionValueText)
      if (!usable) fail(`${here}.value`, 'a value is a finite number or a short text')
      else if (seen.has(value)) fail(`${here}.value`, 'repeated value')
      else seen.add(value)
      options.push({ label: label ?? '', value: usable ? (value as number | string) : '' })
    })
    return { type: 'options', options }
  }

  const paramOf = (src: Record<string, unknown>, path: string, index: number): ParamStep => {
    const key = src.key
    if (typeof key !== 'string' || !KEY.test(key) || PROTOTYPE_KEYS.has(key)) fail(`${path}.key`, 'invalid key')
    else if (declaredAt.get(key) !== index) fail(`${path}.key`, 'repeated key')
    const label = cleanLabel(src.label)
    if (label === null) fail(`${path}.label`, 'invalid label')
    return { kind: 'param', key: typeof key === 'string' ? key : '', label: label ?? '', input: inputOf(src.input, `${path}.input`, index) }
  }

  /** The columns of the matched row a formula of a `row` target may read. */
  let rowLocals: ReadonlySet<string> = new Set()

  const targetOf = (raw: unknown, path: string, index: number): EffectTarget => {
    const src = isRecord(raw) ? raw : {}
    rowLocals = new Set()
    if (src.type === 'field') {
      const resolved = typeof src.key === 'string' ? resolveFieldTarget(sheet, src.key) : { ok: false as const, reason: 'a field target needs a key' }
      if (!resolved.ok) fail(`${path}.key`, resolved.reason)
      return { type: 'field', key: typeof src.key === 'string' ? src.key : '' }
    }
    if (src.type === 'state') {
      const column = action?.type === 'habilidad' ? action.columns.find((c) => c.key === src.column) : undefined
      if (action?.type !== 'habilidad') fail(path, 'a state target needs the Habilidad table of the action')
      else if (!column || column.scope !== 'character' || !isStoredNumber(column)) fail(`${path}.column`, 'the column must be a stored number column of character scope')
      return { type: 'state', column: typeof src.column === 'string' ? src.column : '' }
    }
    if (src.type !== 'row') {
      fail(`${path}.type`, 'the target is field, row or state')
      return { type: 'state', column: '' }
    }
    const table = typeof src.table === 'string' ? findTable(sheet, src.table) : undefined
    const columns: Column[] = table?.type === 'libre' ? table.columns : []
    if (table?.type !== 'libre') fail(`${path}.table`, 'the table must be a Libre table of the sheet')
    else rowLocals = new Set(numericColumns(columns).map((c) => c.key))
    const matchSrc = isRecord(src.match) ? src.match : {}
    const matchColumn = columns.find((c) => c.key === matchSrc.column)
    if (table?.type === 'libre' && (!matchColumn || matchColumn.type !== 'number')) fail(`${path}.match.column`, 'the match column must be a number column of the table')
    const column = columns.find((c) => c.key === src.column)
    if (table?.type === 'libre' && (!column || !isStoredNumber(column))) fail(`${path}.column`, 'the column must be a stored number column of the table')
    // the value is read before any row is known: no row columns
    const value = formulaOf(matchSrc.value, `${path}.match.value`, index)
    return {
      type: 'row',
      table: typeof src.table === 'string' ? src.table : '',
      match: { column: typeof matchSrc.column === 'string' ? matchSrc.column : '', value: value ?? '' },
      column: typeof src.column === 'string' ? src.column : '',
    }
  }

  const effectOf = (src: Record<string, unknown>, path: string, index: number): EffectStep => {
    const label = src.label === undefined ? undefined : cleanLabel(src.label)
    if (label === null) fail(`${path}.label`, 'invalid label')
    const target = targetOf(src.target, `${path}.target`, index)
    if (!(EFFECT_OPS as readonly unknown[]).includes(src.op)) fail(`${path}.op`, 'the operation is set, add or subtract')
    const value = formulaOf(src.value, `${path}.value`, index, rowLocals)
    const max = src.max === undefined ? undefined : formulaOf(src.max, `${path}.max`, index, rowLocals)
    return {
      kind: 'effect',
      ...(label ? { label } : {}),
      target,
      op: src.op as EffectOp,
      value: value ?? '',
      ...(max !== undefined ? { max } : {}),
    }
  }

  const built: Step[] = []
  steps.forEach((step, index) => {
    const path = `steps[${index}]`
    if (!isRecord(step)) return void fail(path, 'a step is an object')
    if (step.kind === 'param') built.push(paramOf(step, path, index))
    else if (step.kind === 'effect') built.push(effectOf(step, path, index))
    else fail(`${path}.kind`, 'a step is param or effect')
  })

  const fn: ActionFunction = { steps: built }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, fn }
}
