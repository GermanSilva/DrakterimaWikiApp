import { describe, expect, it } from 'vitest'
import { BENDICION, FUNCTION_SHEET, IMPONER_MANOS, LANZAR_HECHIZO } from './fixture'
import { runActionFunction } from './run'
import { validateActionFunction } from './validate'
import type { ActionFunction } from './model'

type Loose = Record<string, unknown>
const fnOf = (raw: unknown): ActionFunction => {
  const result = validateActionFunction(raw, FUNCTION_SHEET, 'rasgos')
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.fn
}
const deepFreeze = <T>(value: T): T => {
  if (typeof value === 'object' && value !== null) for (const inner of Object.values(value)) deepFreeze(inner)
  return Object.freeze(value)
}
const SLOTS = [{ nivel: 1, total: 4, gastados: 1 }, { nivel: 2, total: 3, gastados: 3 }]
const run = (raw: unknown, params: Record<string, unknown>, pj: Loose = {}, state: Loose = {}) =>
  runActionFunction(fnOf(raw), { sheet: FUNCTION_SHEET, pj: deepFreeze({ hp: 30, hp_current: 20, ...pj }), link: deepFreeze({ state }), params: params as never })
const effect = (target: Loose, value: string, extra: Loose = {}) => ({ kind: 'effect', target, op: 'add', value, ...extra })
const field = (key: string) => ({ type: 'field', key })

describe('runActionFunction: Lanzar hechizo (row target)', () => {
  const rowTarget = { type: 'row', table: 'espacios_conjuro', match: { column: 'nivel', value: '1' }, column: 'gastados' }

  it('spends one slot of the matched row and leaves the other rows and the input untouched', () => {
    const result = run(LANZAR_HECHIZO, { nivel: 1 }, { espacios_conjuro: SLOTS })
    expect(result.patch).toEqual({ pj: { espacios_conjuro: [{ nivel: 1, total: 4, gastados: 2 }, SLOTS[1]] } })
    expect(result.applied).toEqual([
      { step: 1, label: 'Gastar espacio', target: { type: 'row', table: 'espacios_conjuro', match: { column: 'nivel', value: 1 }, column: 'gastados' }, before: 1, after: 2, delta: 1, min: 0 },
    ])
    expect(result.warnings).toEqual([])
  })

  it('warns exhausted when the row would exceed its total, and still computes the result', () => {
    const result = run(LANZAR_HECHIZO, { nivel: 2 }, { espacios_conjuro: SLOTS })
    expect(result.patch.pj).toEqual({ espacios_conjuro: [SLOTS[0], { nivel: 2, total: 3, gastados: 4 }] })
    expect(result.applied.map((a) => [a.before, a.after, a.delta])).toEqual([[3, 4, 1]])
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatchObject({ step: 1, kind: 'exhausted' })
    expect(result.warnings[0].message).toMatch(/máximo/)
  })

  it('a row that is not found is a missing_row warning and applies nothing', () => {
    const result = run(LANZAR_HECHIZO, { nivel: 5 }, { espacios_conjuro: SLOTS })
    expect(result.patch).toEqual({ pj: {} })
    expect(result.applied).toEqual([])
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatchObject({ step: 1, kind: 'missing_row' })
    expect(result.warnings[0].message).toMatch(/No hay una fila/)
  })

  it('a character with no rows at all is missing_row too', () => {
    expect(run(LANZAR_HECHIZO, { nivel: 1 }).warnings.map((w) => w.kind)).toEqual(['missing_row'])
  })

  it('counts a missing cell as 0 and keeps rows that are not objects', () => {
    const result = run(LANZAR_HECHIZO, { nivel: 1 }, { espacios_conjuro: ['x', { nivel: 1, total: 2 }, null] })
    expect(result.patch.pj).toEqual({ espacios_conjuro: ['x', { nivel: 1, total: 2, gastados: 1 }, null] })
  })

  it('reads the columns of the matched row, formula columns included, in the value', () => {
    const raw = { steps: [effect(rowTarget, '{doble}')] }
    const result = run(raw, {}, { espacios_conjuro: SLOTS })
    expect(result.applied.map((a) => a.delta)).toEqual([8])
  })

  it('subtracting below zero on a row warns exhausted (the floor of a row number is 0)', () => {
    const result = run({ steps: [{ ...effect(rowTarget, '3'), op: 'subtract' }] }, {}, { espacios_conjuro: SLOTS })
    expect(result.applied.map((a) => a.after)).toEqual([-2])
    expect(result.warnings.map((w) => w.kind)).toEqual(['exhausted'])
  })
})

describe('runActionFunction: Imponer las manos (state and role targets)', () => {
  it('spends the reserve in the link state and heals the role field', () => {
    const result = run(IMPONER_MANOS, { puntos: 3 }, {}, { reserva: 5, usos: 1 })
    expect(result.patch).toEqual({ pj: { hp_current: 23 }, linkState: { reserva: 2 } })
    expect(result.applied.map((a) => [a.step, a.target, a.before, a.after, a.delta])).toEqual([
      [1, { type: 'state', column: 'reserva' }, 5, 2, -3],
      [2, { type: 'field', key: 'hp_current' }, 20, 23, 3],
    ])
    expect(result.warnings).toEqual([])
  })

  it('warns exhausted when the healing passes the maximum HP', () => {
    const result = run(IMPONER_MANOS, { puntos: 15 }, {}, { reserva: 20 })
    expect(result.patch.pj).toEqual({ hp_current: 35 })
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatchObject({ step: 2, kind: 'exhausted' })
  })

  it('a parameter above its formula bound is not accepted: invalid_param, and the effects that read it fail', () => {
    const result = run(IMPONER_MANOS, { puntos: 6 }, {}, { reserva: 5 })
    expect(result.patch).toEqual({ pj: {} })
    expect(result.applied).toEqual([])
    expect(result.warnings.map((w) => [w.step, w.kind])).toEqual([[0, 'invalid_param'], [1, 'formula_error'], [2, 'formula_error']])
  })

  it('later steps see the earlier effects of the same run', () => {
    const raw = {
      steps: [
        { kind: 'param', key: 'puntos', label: 'Puntos', input: { type: 'number' } },
        { kind: 'effect', target: { type: 'state', column: 'reserva' }, op: 'subtract', value: '{puntos}' },
        { kind: 'effect', target: field('karma'), op: 'add', value: '{reserva}' },
      ],
    }
    const result = run(raw, { puntos: 3 }, {}, { reserva: 5 })
    expect(result.patch).toEqual({ pj: { karma: 2 }, linkState: { reserva: 2 } })
  })

  it('two effects on the same target chain, and the patch holds the last value', () => {
    const result = run({ steps: [effect(field('karma'), '2'), effect(field('karma'), '3')] }, {}, { karma: 1 })
    expect(result.applied.map((a) => [a.before, a.after])).toEqual([[1, 3], [3, 6]])
    expect(result.patch.pj).toEqual({ karma: 6 })
  })

  it('a state column with no stored value counts as 0', () => {
    const result = run({ steps: [effect({ type: 'state', column: 'usos' }, '1')] }, {}, {}, {})
    expect(result.patch).toEqual({ pj: {}, linkState: { usos: 1 } })
  })
})

describe('runActionFunction: parameters', () => {
  it('a checkbox adds 2 only when checked', () => {
    expect(run(BENDICION, { flag: true }, { oro: 5 }).patch.pj).toEqual({ oro: 7 })
    expect(run(BENDICION, { flag: false }, { oro: 5 }).patch.pj).toEqual({ oro: 5 })
    expect(run(BENDICION, {}, { oro: 5 }).patch.pj).toEqual({ oro: 5 })
    expect(run(BENDICION, { flag: true }, { oro: 5 }).warnings).toEqual([])
  })

  it('a checkbox that is not a boolean is invalid_param', () => {
    expect(run(BENDICION, { flag: 'yes' }).warnings.map((w) => [w.step, w.kind])).toEqual([[0, 'invalid_param'], [1, 'formula_error']])
  })

  it('an options parameter is the hidden value of the chosen option', () => {
    const raw = {
      steps: [
        { kind: 'param', key: 'modo', label: 'Modo', input: { type: 'options', options: [{ label: 'Bajo', value: 1 }, { label: 'Alto', value: 5 }] } },
        effect(field('karma'), '{modo}'),
      ],
    }
    expect(run(raw, { modo: 5 }).patch.pj).toEqual({ karma: 5 })
    expect(run(raw, { modo: 2 }).warnings.map((w) => w.kind)).toEqual(['invalid_param', 'formula_error'])
  })

  it('a number parameter must be a finite number inside its range and a missing one is invalid_param', () => {
    expect(run(LANZAR_HECHIZO, { nivel: 10 }, { espacios_conjuro: SLOTS }).warnings[0]).toMatchObject({ step: 0, kind: 'invalid_param' })
    expect(run(LANZAR_HECHIZO, { nivel: 0 }, { espacios_conjuro: SLOTS }).warnings[0]).toMatchObject({ step: 0, kind: 'invalid_param' })
    expect(run(LANZAR_HECHIZO, { nivel: Number.NaN }, { espacios_conjuro: SLOTS }).warnings[0]).toMatchObject({ step: 0, kind: 'invalid_param' })
    expect(run(LANZAR_HECHIZO, {}, { espacios_conjuro: SLOTS }).warnings[0]).toMatchObject({ step: 0, kind: 'invalid_param' })
  })
})

describe('runActionFunction: operations, formulas and failures', () => {
  it('set replaces the value (delta is the difference); a role resolves to its bound field', () => {
    const result = run({ steps: [{ ...effect(field('hp_current'), '{hp}'), op: 'set' }] }, {})
    expect(result.patch.pj).toEqual({ hp_current: 30 })
    expect(result.applied[0]).toMatchObject({ before: 20, after: 30, delta: 10 })
  })

  it('computed fields are read with the sheet semantics', () => {
    expect(run({ steps: [effect(field('karma'), '{guardia}')] }, {}).patch.pj).toEqual({ karma: 15 })
  })

  it('a field with no stored value counts as 0 (its default when declared)', () => {
    expect(run({ steps: [effect(field('karma'), '2')] }, {}).patch.pj).toEqual({ karma: 2 })
  })

  it('a formula that cannot be computed is a formula_error and applies nothing', () => {
    const result = run({ steps: [effect(field('karma'), '1 / 0'), effect(field('karma'), '{hp_current} + 1')] }, {})
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatchObject({ step: 0, kind: 'formula_error' })
    expect(result.warnings[0].message).toMatch(/fórmula/)
    expect(result.applied.map((a) => a.step)).toEqual([1])
  })

  it('a reference with no value (a state column never stored) is a formula_error', () => {
    const result = run({ steps: [effect(field('karma'), '{reserva}')] }, {})
    expect(result.warnings.map((w) => [w.step, w.kind])).toEqual([[0, 'formula_error']])
  })

  it('a maximum that cannot be computed applies nothing', () => {
    const result = run({ steps: [effect(field('karma'), '1', { max: '1 / 0' })] }, {})
    expect(result.applied).toEqual([])
    expect(result.warnings.map((w) => w.kind)).toEqual(['formula_error'])
  })

  it('going below the minimum of the field is exhausted, and the value is still computed', () => {
    const result = run({ steps: [{ ...effect(field('hp_current'), '25'), op: 'subtract' }] }, {})
    expect(result.patch.pj).toEqual({ hp_current: -5 })
    expect(result.warnings.map((w) => [w.step, w.kind])).toEqual([[0, 'exhausted']])
  })

  it('never throws on odd stored data', () => {
    const odd = { hp: 'x', hp_current: null, espacios_conjuro: 'nope', karma: { a: 1 } }
    expect(() => run(LANZAR_HECHIZO, { nivel: 1 }, odd)).not.toThrow()
    expect(() => run({ steps: [effect(field('karma'), '{hp}')] }, {}, odd)).not.toThrow()
    expect(run({ steps: [effect(field('karma'), '1')] }, {}, odd).patch.pj).toEqual({ karma: 1 })
  })

  it('an empty patch and no warnings for a function with parameters only', () => {
    const raw = { steps: [{ kind: 'param', key: 'a', label: 'A', input: { type: 'checkbox' } }] }
    expect(run(raw, {})).toEqual({ patch: { pj: {} }, applied: [], warnings: [] })
  })
})
