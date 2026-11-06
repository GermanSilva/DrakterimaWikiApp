/** Regression pins from the independent verification of G6c: hostile or hand-edited functions never reach the sheet or the database. */
import { describe, expect, it } from 'vitest'
import { FUNCTION_SHEET } from './fixture'
import { runActionFunction } from './run'
import { validateActionFunction } from './validate'

type Loose = Record<string, unknown>
const check = (raw: unknown, table = 'rasgos') => validateActionFunction(raw, FUNCTION_SHEET, table)
const effect = (target: Loose, value = '1', extra: Loose = {}) => ({ kind: 'effect', target, op: 'add', value, ...extra })
const field = (key: string) => ({ type: 'field', key })
const withSteps = (...steps: unknown[]) => ({ steps })
const rejectedAt = (raw: unknown) => {
  const result = check(raw)
  return result.ok ? null : result.errors.map((e) => e.path)
}

describe('hostile functions: the validator rejects them', () => {
  it.each(['__proto__', 'constructor', 'prototype', 'nombre', 'sections_updated', 'notas', 'id', 'owner_id'])('a field target named %s', (key) => {
    expect(rejectedAt(withSteps(effect(field(key))))).toEqual(['steps[0].target.key'])
  })

  it('a role that is not bound in the sheet', () => {
    expect(rejectedAt(withSteps(effect(field('initiative'))))).toEqual(['steps[0].target.key'])
  })

  it('a Habilidad table as a row target (only Libre tables)', () => {
    const target = { type: 'row', table: 'rasgos', match: { column: 'nombre', value: '1' }, column: 'usos' }
    expect(rejectedAt(withSteps(effect(target)))).toEqual(expect.arrayContaining(['steps[0].target.table']))
  })

  it.each([
    ['an entry-scope column', 'fuente'],
    ['a boolean column', 'activo'],
    ['a text column', 'modo'],
    ['a column that does not exist', 'nope'],
    ['a prototype key', '__proto__'],
  ])('a state target on %s', (_name, column) => {
    expect(rejectedAt(withSteps(effect({ type: 'state', column })))).toEqual(['steps[0].target.column'])
  })

  it('a state target without the action table', () => {
    expect(check(withSteps(effect({ type: 'state', column: 'reserva' })), 'espacios_conjuro').ok).toBe(false)
  })

  it.each(['1; process.exit()', '{hp}) + constructor', '__proto__', '{constructor}', 'hp.constructor("x")()', '${1}', ''])('formula text %j', (value) => {
    expect(rejectedAt(withSteps(effect(field('oro'), value)))).toEqual(['steps[0].value'])
  })

  it('an unknown operation', () => {
    expect(rejectedAt(withSteps({ ...effect(field('oro')), op: 'multiply' }))).toEqual(['steps[0].op'])
  })

  it('21 steps', () => {
    expect(rejectedAt(withSteps(...Array.from({ length: 21 }, () => effect(field('oro')))))).toEqual(['steps'])
  })
})

describe('hostile functions: what survives validation is clean data', () => {
  it('drops a nested __proto__ and unknown properties without polluting Object.prototype', () => {
    const raw = JSON.parse('{"steps":[{"kind":"effect","target":{"type":"field","key":"oro","__proto__":{"polluted":1}},"op":"add","value":"1","__proto__":{"polluted":2},"extra":{"__proto__":{"polluted":3}}}],"__proto__":{"polluted":4}}')
    const result = check(raw)
    expect(result).toEqual({ ok: true, fn: { steps: [{ kind: 'effect', target: { type: 'field', key: 'oro' }, op: 'add', value: '1' }] } })
    expect(Object.hasOwn(JSON.parse(JSON.stringify(result)), '__proto__')).toBe(false)
    expect(({} as Loose).polluted).toBeUndefined()
  })

  it('an overflowing result is a formula_error and nothing is written', () => {
    const checked = check(withSteps(effect(field('karma'), '{karma} * {karma}')))
    if (!checked.ok) throw new Error(JSON.stringify(checked.errors))
    const result = runActionFunction(checked.fn, { sheet: FUNCTION_SHEET, pj: { karma: 1e200 }, link: { state: {} }, params: {} })
    expect(result.patch).toEqual({ pj: {} })
    expect(result.applied).toEqual([])
    expect(result.warnings.map((w) => w.kind)).toEqual(['formula_error'])
  })
})
