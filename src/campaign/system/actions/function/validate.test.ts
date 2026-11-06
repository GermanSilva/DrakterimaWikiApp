import { describe, expect, it } from 'vitest'
import { validateActionFunction } from './validate'
import { ACTION_TABLE, BENDICION, FUNCTION_SHEET, IMPONER_MANOS, LANZAR_HECHIZO } from './fixture'

type Loose = Record<string, unknown>
const check = (raw: unknown, table: string | null = ACTION_TABLE) => validateActionFunction(raw, FUNCTION_SHEET, table ?? undefined)
const errorsOf = (raw: unknown, table?: string | null) => {
  const result = check(raw, table)
  return result.ok ? [] : result.errors
}
const paths = (raw: unknown, table?: string | null) => errorsOf(raw, table).map((e) => e.path)
const param = (key: string, input: Loose = { type: 'number' }) => ({ kind: 'param', key, label: key, input })
const effect = (target: Loose, value: string, extra: Loose = {}) => ({ kind: 'effect', target, op: 'add', value, ...extra })
const field = (key: string) => ({ type: 'field', key })
const withSteps = (...steps: unknown[]) => ({ steps })

describe('validateActionFunction: accepted shapes', () => {
  it.each([
    ['lanzar hechizo', LANZAR_HECHIZO],
    ['imponer las manos', IMPONER_MANOS],
    ['bendicion', BENDICION],
  ])('accepts the %s example and returns it as declared', (_name, raw) => {
    expect(check(raw)).toEqual({ ok: true, fn: raw })
  })

  it('accepts an options parameter with hidden values and a set operation', () => {
    const raw = withSteps(param('modo', { type: 'options', options: [{ label: 'Bajo', value: 1 }, { label: 'Alto', value: 5 }] }), { ...effect(field('oro'), '{modo}'), op: 'set' })
    expect(check(raw).ok).toBe(true)
  })

  it('lets a formula read the sheet (fields, computed fields, nivel) and targets a role by its name', () => {
    expect(errorsOf(withSteps(effect(field('oro'), '{hp} + {guardia} + {nivel}')))).toEqual([])
    expect(errorsOf(withSteps(effect(field('hp_current'), '1')))).toEqual([])
  })

  it('lets a row target read the columns of its row (formula columns too) in value and max', () => {
    const target = { type: 'row', table: 'espacios_conjuro', match: { column: 'nivel', value: '1' }, column: 'gastados' }
    expect(errorsOf(withSteps(effect(target, '{doble}', { max: '{total}' })))).toEqual([])
  })

  it('lets a formula read the character-scope columns of the action table', () => {
    expect(errorsOf(withSteps(effect(field('oro'), '{usos} + {reserva}')))).toEqual([])
  })

  it('accepts exactly 1 and 20 steps', () => {
    expect(check(withSteps(effect(field('oro'), '1'))).ok).toBe(true)
    expect(check(withSteps(...Array.from({ length: 20 }, () => effect(field('oro'), '1')))).ok).toBe(true)
  })
})

describe('validateActionFunction: structure', () => {
  it.each([
    ['not an object', null],
    ['no steps', {}],
    ['steps not a list', { steps: 'x' }],
    ['no step', { steps: [] }],
    ['21 steps', withSteps(...Array.from({ length: 21 }, () => effect(field('oro'), '1')))],
  ])('rejects %s at steps', (_name, raw) => {
    expect(paths(raw)).toEqual(['steps'])
  })

  it('rejects a step that is not an object or has an unknown kind', () => {
    expect(paths(withSteps(5, { kind: 'jump' }))).toEqual(['steps[0]', 'steps[1].kind'])
  })

  it('reports every problem with its path and a message', () => {
    const errors = errorsOf(withSteps({ ...effect(field('oro'), '1'), op: 'multiply' }, effect(field('nada'), '1')))
    expect(errors.map((e) => e.path)).toEqual(['steps[0].op', 'steps[1].target.key'])
    expect(errors.every((e) => e.message.length > 0)).toBe(true)
  })
})

describe('validateActionFunction: parameters', () => {
  it('rejects a duplicate key and an invalid key or label', () => {
    expect(paths(withSteps(param('a'), param('a')))).toEqual(['steps[1].key'])
    expect(paths(withSteps(param('Bad Key')))).toEqual(['steps[0].key'])
    expect(paths(withSteps({ ...param('a'), label: '' }))).toEqual(['steps[0].label'])
  })

  it('rejects a bad input type, a reversed range and a bad bound', () => {
    expect(paths(withSteps(param('a', { type: 'slider' })))).toEqual(['steps[0].input.type'])
    expect(paths(withSteps(param('a', { type: 'number', min: 5, max: 1 })))).toEqual(['steps[0].input'])
    expect(paths(withSteps(param('a', { type: 'number', max: '1 +' })))).toEqual(['steps[0].input.max'])
    expect(paths(withSteps(param('a', { type: 'number', min: Number.NaN })))).toEqual(['steps[0].input.min'])
  })

  it('rejects a bound formula that reads a parameter not declared before, accepts an earlier one', () => {
    expect(paths(withSteps(param('a', { type: 'number', max: '{b}' }), param('b')))).toEqual(['steps[0].input.max'])
    expect(errorsOf(withSteps(param('a'), param('b', { type: 'number', max: '{a}' })))).toEqual([])
  })

  it('rejects an empty or oversized option list, repeated values, an unusable value and a bad label', () => {
    expect(paths(withSteps(param('a', { type: 'options', options: [] })))).toEqual(['steps[0].input.options'])
    expect(paths(withSteps(param('a', { type: 'options', options: [{ label: 'x', value: 1 }, { label: 'y', value: 1 }] })))).toEqual(['steps[0].input.options[1].value'])
    expect(paths(withSteps(param('a', { type: 'options', options: [{ label: 'x', value: true }, { label: '', value: 2 }] })))).toEqual(['steps[0].input.options[0].value', 'steps[0].input.options[1].label'])
    expect(paths(withSteps(param('a', { type: 'options', options: Array.from({ length: 21 }, (_, i) => ({ label: `o${i}`, value: i })) })))).toEqual(['steps[0].input.options'])
  })
})

describe('validateActionFunction: formulas and parameter references', () => {
  it('rejects a parameter used before it is declared', () => {
    expect(paths(withSteps(effect(field('oro'), '{puntos}'), param('puntos')))).toEqual(['steps[0].value'])
  })

  it('rejects an unknown reference and a formula that does not parse', () => {
    expect(paths(withSteps(effect(field('oro'), '{nada}')))).toEqual(['steps[0].value'])
    expect(paths(withSteps(effect(field('oro'), '1 +')))).toEqual(['steps[0].value'])
    expect(paths(withSteps(effect(field('oro'), '1', { max: '{nada}' })))).toEqual(['steps[0].max'])
    expect(paths(withSteps(effect(field('oro'), 5 as unknown as string)))).toEqual(['steps[0].value'])
  })

  it('rejects a row column when no row is matched, and a state column when the function has no action table', () => {
    expect(paths(withSteps(effect(field('oro'), '{total}')))).toEqual(['steps[0].value'])
    expect(paths(withSteps(effect(field('oro'), '{reserva}')), null)).toEqual(['steps[0].value'])
  })

  it('checks the tables and columns a formula reads', () => {
    expect(errorsOf(withSteps(effect(field('oro'), 'suma({espacios_conjuro}, "total")')))).toEqual([])
    expect(paths(withSteps(effect(field('oro'), 'suma({nada}, "total")')))).toEqual(['steps[0].value'])
    expect(paths(withSteps(effect(field('oro'), 'suma({espacios_conjuro}, "nada")')))).toEqual(['steps[0].value'])
  })

  it('does not let the match value read the row it is looking for', () => {
    const target = { type: 'row', table: 'espacios_conjuro', match: { column: 'nivel', value: '{total}' }, column: 'gastados' }
    expect(paths(withSteps(effect(target, '1')))).toEqual(['steps[0].target.match.value'])
  })
})

describe('validateActionFunction: targets', () => {
  it('rejects a field that does not exist, is not a number, or is computed', () => {
    for (const key of ['nada', 'titulo', 'bendicion', 'forma', 'guardia']) expect(paths(withSteps(effect(field(key), '1')))).toEqual(['steps[0].target.key'])
  })

  it('rejects a role that is not bound in the sheet', () => {
    expect(paths(withSteps(effect(field('speed'), '1')))).toEqual(['steps[0].target.key'])
  })

  it('rejects a bad target type', () => {
    expect(paths(withSteps(effect({ type: 'moon' }, '1')))).toEqual(['steps[0].target.type'])
  })

  it('rejects a row target on a missing table, on a Habilidad table, on missing columns or non-number columns', () => {
    const row = (extra: Loose) => withSteps(effect({ type: 'row', table: 'espacios_conjuro', match: { column: 'nivel', value: '1' }, column: 'gastados', ...extra }, '1'))
    expect(errorsOf(row({}))).toEqual([])
    expect(paths(row({ table: 'nada' }))).toEqual(['steps[0].target.table'])
    expect(paths(row({ table: 'rasgos' }))).toEqual(['steps[0].target.table'])
    for (const column of ['nada', 'nota', 'doble']) expect(paths(row({ column }))).toEqual(['steps[0].target.column'])
    for (const column of ['nada', 'nota']) expect(paths(row({ match: { column, value: '1' } }))).toEqual(['steps[0].target.match.column'])
    expect(paths(row({ match: { column: 'nivel', value: 'x +' } }))).toEqual(['steps[0].target.match.value'])
  })

  it('rejects a state target that is not a character-scope number column of the action table', () => {
    const state = (column: string) => withSteps(effect({ type: 'state', column }, '1'))
    expect(errorsOf(state('usos'))).toEqual([])
    for (const column of ['nada', 'fuente', 'activo', 'modo']) expect(paths(state(column))).toEqual(['steps[0].target.column'])
    expect(paths(state('usos'), null)).toEqual(['steps[0].target'])
    expect(paths(state('usos'), 'espacios_conjuro')).toEqual(['steps[0].target'])
  })
})
