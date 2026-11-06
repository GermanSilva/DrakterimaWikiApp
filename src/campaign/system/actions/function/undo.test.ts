import { describe, expect, it } from 'vitest'
import { BENDICION, FUNCTION_SHEET, IMPONER_MANOS, LANZAR_HECHIZO } from './fixture'
import type { ActionFunction } from './model'
import { runActionFunction, type Applied } from './run'
import { planUndo, undoEntry } from './undo'
import { validateActionFunction } from './validate'

type Loose = Record<string, unknown>
const fnOf = (raw: unknown): ActionFunction => {
  const result = validateActionFunction(raw, FUNCTION_SHEET, 'rasgos')
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.fn
}
const SLOTS = [{ nivel: 1, total: 4, gastados: 1 }, { nivel: 2, total: 3, gastados: 2 }]
const start = { hp: 30, hp_current: 20, espacios_conjuro: SLOTS }

/** Runs a function and applies its patch, as the session screen would. */
function runAndApply(raw: unknown, params: Loose, pj: Loose = start, state: Loose = {}) {
  const result = runActionFunction(fnOf(raw), { sheet: FUNCTION_SHEET, pj, link: { state }, params: params as never })
  return {
    result,
    pj: { ...pj, ...result.patch.pj },
    state: { ...state, ...result.patch.linkState },
  }
}
const effect = (target: Loose, value: string, extra: Loose = {}) => ({ kind: 'effect', target, op: 'add', value, ...extra })
const field = (key: string) => ({ type: 'field', key })

describe('undoEntry', () => {
  it('keeps what the action applied and is a copy', () => {
    const { result } = runAndApply(LANZAR_HECHIZO, { nivel: 1 })
    const entry = undoEntry(result.applied)
    expect(entry.effects).toEqual(result.applied)
    ;(result.applied as Applied[])[0].after = 99
    expect(entry.effects[0].after).toBe(2)
  })
})

describe('planUndo', () => {
  it('restores the values the action changed when nothing changed since', () => {
    const { result, pj } = runAndApply(LANZAR_HECHIZO, { nivel: 1 })
    const plan = planUndo(undoEntry(result.applied), pj, { state: {} })
    expect(plan.warnings).toEqual([])
    expect({ ...pj, ...plan.patch.pj }).toEqual(start)
  })

  it('undoes a state and a field effect together', () => {
    const { result, pj, state } = runAndApply(IMPONER_MANOS, { puntos: 3 }, start, { reserva: 5 })
    const plan = planUndo(undoEntry(result.applied), pj, { state })
    expect(plan.warnings).toEqual([])
    expect(plan.patch).toEqual({ pj: { hp_current: 20 }, linkState: { reserva: 5 } })
  })

  it('warns changed_since when the DM reset the value, and floors at 0 (spell slots example)', () => {
    const { result, pj } = runAndApply(LANZAR_HECHIZO, { nivel: 1 })
    const reset = { ...pj, espacios_conjuro: [{ nivel: 1, total: 4, gastados: 0 }, SLOTS[1]] }
    const plan = planUndo(undoEntry(result.applied), reset, { state: {} })
    expect(plan.warnings).toHaveLength(1)
    expect(plan.warnings[0]).toMatchObject({ step: 1, kind: 'changed_since' })
    expect(plan.warnings[0].message).toMatch(/cambió/)
    expect(plan.patch.pj).toEqual({ espacios_conjuro: [{ nivel: 1, total: 4, gastados: 0 }, SLOTS[1]] })
  })

  it('still subtracts the delta from a value that changed, with the warning', () => {
    const { result, pj } = runAndApply(LANZAR_HECHIZO, { nivel: 1 })
    const edited = { ...pj, espacios_conjuro: [{ nivel: 1, total: 4, gastados: 3 }, SLOTS[1]] } // the DM added one more after the action (2 -> 3)
    const plan = planUndo(undoEntry(result.applied), edited, { state: {} })
    expect(plan.warnings.map((w) => w.kind)).toEqual(['changed_since'])
    expect(plan.patch.pj).toEqual({ espacios_conjuro: [{ nivel: 1, total: 4, gastados: 2 }, SLOTS[1]] })
  })

  it('floors a field at its minimum when the value changed after the action', () => {
    const { result } = runAndApply({ steps: [effect(field('hp_current'), '5')] }, {}, { hp: 30, hp_current: 2 })
    const plan = planUndo(undoEntry(result.applied), { hp: 30, hp_current: 3 }, { state: {} })
    expect(plan.patch.pj).toEqual({ hp_current: 0 })
    expect(plan.warnings.map((w) => w.kind)).toEqual(['changed_since'])
  })

  it('does not floor a field that declares no minimum', () => {
    const { result } = runAndApply({ steps: [effect(field('karma'), '5')] }, {}, { karma: 0 })
    const plan = planUndo(undoEntry(result.applied), { karma: 1 }, { state: {} })
    expect(plan.patch.pj).toEqual({ karma: -4 })
  })

  it('floors a state number at 0', () => {
    const { result, state } = runAndApply({ steps: [effect({ type: 'state', column: 'usos' }, '2')] }, {}, start, { usos: 0 })
    const plan = planUndo(undoEntry(result.applied), start, { state: { ...state, usos: 1 } })
    expect(plan.patch.linkState).toEqual({ usos: 0 })
    expect(plan.warnings.map((w) => w.kind)).toEqual(['changed_since'])
  })

  it('undoes a subtraction by adding it back', () => {
    const { result, pj, state } = runAndApply({ steps: [{ ...effect({ type: 'state', column: 'usos' }, '2'), op: 'subtract' }] }, {}, start, { usos: 3 })
    expect(state).toEqual({ usos: 1 })
    expect(planUndo(undoEntry(result.applied), pj, { state }).patch.linkState).toEqual({ usos: 3 })
  })

  it('undoes steps in reverse order when two effects hit the same target', () => {
    const { result, pj } = runAndApply({ steps: [effect(field('karma'), '2'), effect(field('karma'), '3')] }, {}, { karma: 1 })
    expect(pj.karma).toBe(6)
    const plan = planUndo(undoEntry(result.applied), pj, { state: {} })
    expect(plan.warnings).toEqual([])
    expect(plan.patch.pj).toEqual({ karma: 1 })
  })

  it('a row that is gone is a missing_row warning and nothing is written for it', () => {
    const { result, pj } = runAndApply(LANZAR_HECHIZO, { nivel: 1 })
    const plan = planUndo(undoEntry(result.applied), { ...pj, espacios_conjuro: [SLOTS[1]] }, { state: {} })
    expect(plan.warnings.map((w) => w.kind)).toEqual(['missing_row'])
    expect(plan.patch).toEqual({ pj: {} })
  })

  it('finds the row by the matched value, wherever it sits now', () => {
    const { result, pj } = runAndApply(LANZAR_HECHIZO, { nivel: 1 })
    const moved = { ...pj, espacios_conjuro: [SLOTS[1], { nivel: 1, total: 4, gastados: 2 }] }
    const plan = planUndo(undoEntry(result.applied), moved, { state: {} })
    expect(plan.warnings).toEqual([])
    expect(plan.patch.pj).toEqual({ espacios_conjuro: [SLOTS[1], { nivel: 1, total: 4, gastados: 1 }] })
  })

  it('an action that applied nothing, or a zero change, plans nothing', () => {
    const missing = runAndApply(LANZAR_HECHIZO, { nivel: 9 })
    expect(planUndo(undoEntry(missing.result.applied), start, { state: {} })).toEqual({ patch: { pj: {} }, warnings: [] })
    const flagless = runAndApply(BENDICION, { flag: false }, { oro: 5 })
    expect(planUndo(undoEntry(flagless.result.applied), flagless.pj, { state: {} })).toEqual({ patch: { pj: {} }, warnings: [] })
  })

  it('does not mutate the current character or link', () => {
    const { result, pj, state } = runAndApply(IMPONER_MANOS, { puntos: 3 }, start, { reserva: 5 })
    const frozenPj = JSON.parse(JSON.stringify(pj))
    planUndo(undoEntry(result.applied), Object.freeze(pj), Object.freeze({ state: Object.freeze(state) }))
    expect(pj).toEqual(frozenPj)
  })
})

describe('planUndo: a number stored as text', () => {
  it('writes nothing for it and warns, instead of subtracting from zero', () => {
    const { result } = runAndApply({ steps: [effect(field('oro'), '2')] }, {}, { oro: 5 })
    const planned = planUndo(undoEntry(result.applied), { oro: '7' }, { state: {} })
    expect(planned.patch).toEqual({ pj: {} })
    expect(planned.warnings.map((w) => [w.kind, w.step])).toEqual([['invalid_value', 0]])
    expect(planned.warnings[0].message).toContain('no es un número')
  })
})
