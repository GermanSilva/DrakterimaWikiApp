import { describe, expect, it } from 'vitest'
import {
  MAX_FORMULA_LENGTH,
  evaluateFormula,
  findFormulaCycle,
  parseFormula,
  type FormulaValue,
} from './formula'

const run = (src: string, scope: Record<string, FormulaValue> = {}) => {
  const parsed = parseFormula(src)
  if (!parsed.ok) throw new Error(`parse failed: ${parsed.error}`)
  return evaluateFormula(parsed.ast, (ref) => scope[ref])
}

describe('parseFormula', () => {
  it('collects the distinct references in order of appearance', () => {
    const parsed = parseFormula('{stat_str} + {stat_dex} * {stat_str} + {row.col}')
    expect(parsed).toMatchObject({ ok: true, refs: ['stat_str', 'stat_dex', 'row.col'] })
  })

  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['dangling operator', '1 +'],
    ['unbalanced parenthesis', '(1 + 2'],
    ['extra closing parenthesis', '1 + 2)'],
    ['unknown character', '1 $ 2'],
    ['assignment', 'a = 1'],
    ['string literal', '"hola"'],
    ['unknown function', 'eval(1)'],
    ['bare identifier', 'constructor'],
    ['empty reference', '{}'],
    ['unclosed reference', '{stat_str'],
    ['reference with spaces', '{stat str}'],
    ['reference with uppercase', '{Stat}'],
    ['wrong arity for floor', 'floor(1, 2)'],
    ['si with two arguments', 'si(1, 2)'],
    ['trailing garbage', '1 2'],
    ['double dot number', '1.2.3'],
  ])('rejects %s', (_label, src) => {
    expect(parseFormula(src).ok).toBe(false)
  })

  it('rejects formulas longer than the limit', () => {
    expect(parseFormula('1+'.repeat(MAX_FORMULA_LENGTH) + '1').ok).toBe(false)
  })

  it('rejects formulas nested deeper than the limit', () => {
    expect(parseFormula('('.repeat(100) + '1' + ')'.repeat(100)).ok).toBe(false)
  })
})

describe('evaluateFormula', () => {
  it('applies operator precedence and parentheses', () => {
    expect(run('2 + 3 * 4')).toEqual({ ok: true, value: 14 })
    expect(run('(2 + 3) * 4')).toEqual({ ok: true, value: 20 })
    expect(run('10 - 4 - 3')).toEqual({ ok: true, value: 3 })
    expect(run('-2 + 5')).toEqual({ ok: true, value: 3 })
    expect(run('7 % 4')).toEqual({ ok: true, value: 3 })
    expect(run('1.5 * 2')).toEqual({ ok: true, value: 3 })
  })

  it('resolves references and treats booleans as 1/0', () => {
    expect(run('{a} + {b}', { a: 3, b: true })).toEqual({ ok: true, value: 4 })
    expect(run('{a} + 1', { a: false })).toEqual({ ok: true, value: 1 })
  })

  it('computes the D&D ability modifier', () => {
    const mod = (score: number) => run('floor(({valor} - 10) / 2)', { valor: score })
    expect(mod(10)).toEqual({ ok: true, value: 0 })
    expect(mod(8)).toEqual({ ok: true, value: -1 })
    expect(mod(9)).toEqual({ ok: true, value: -1 })
    expect(mod(18)).toEqual({ ok: true, value: 4 })
  })

  it('supports comparisons returning 1/0 and si()', () => {
    expect(run('3 > 2')).toEqual({ ok: true, value: 1 })
    expect(run('3 <= 2')).toEqual({ ok: true, value: 0 })
    expect(run('2 == 2')).toEqual({ ok: true, value: 1 })
    expect(run('2 != 2')).toEqual({ ok: true, value: 0 })
    expect(run('si({nivel} >= 5, 3, 2)', { nivel: 5 })).toEqual({ ok: true, value: 3 })
    expect(run('si({nivel} >= 5, 3, 2)', { nivel: 4 })).toEqual({ ok: true, value: 2 })
  })

  it('evaluates only the branch si() picks', () => {
    expect(run('si(1, 5, 1 / 0)')).toEqual({ ok: true, value: 5 })
    expect(run('si(0, 1 / 0, 7)')).toEqual({ ok: true, value: 7 })
  })

  it('supports min, max, floor, ceil, round and abs', () => {
    expect(run('min(4, 2, 9)')).toEqual({ ok: true, value: 2 })
    expect(run('max(4, 2, 9)')).toEqual({ ok: true, value: 9 })
    expect(run('floor(-1.5)')).toEqual({ ok: true, value: -2 })
    expect(run('ceil(1.2)')).toEqual({ ok: true, value: 2 })
    expect(run('round(2.5)')).toEqual({ ok: true, value: 3 })
    expect(run('abs(-4)')).toEqual({ ok: true, value: 4 })
  })

  it('computes the suggested proficiency bonus', () => {
    const bonus = (nivel: number) => run('2 + floor(({nivel} - 1) / 4)', { nivel }).ok
    expect(bonus(1)).toBe(true)
    expect(run('2 + floor(({nivel} - 1) / 4)', { nivel: 5 })).toEqual({ ok: true, value: 3 })
    expect(run('2 + floor(({nivel} - 1) / 4)', { nivel: 17 })).toEqual({ ok: true, value: 6 })
  })

  it.each([
    ['division by zero', '1 / 0'],
    ['modulo by zero', '1 % 0'],
    ['a missing reference', '{nope} + 1'],
    ['a reference that is not finite', '{inf} + 1'],
    ['min with no usable value', 'min({nope}, 1)'],
  ])('reports an error for %s', (_label, src) => {
    const result = run(src, { inf: Number.POSITIVE_INFINITY })
    expect(result.ok).toBe(false)
  })

  it('reports an error when the result is not a finite number', () => {
    expect(run('{a} * {a}', { a: 1e200 }).ok).toBe(false)
  })

  it.each(['{__proto__}', '{constructor}', '{prototype}', '{row.constructor}'])(
    'rejects the reserved reference %s',
    (src) => {
      expect(parseFormula(src).ok).toBe(false)
    },
  )

  it('ignores inherited members of the scope object', () => {
    const parsed = parseFormula('{valueof}')
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(evaluateFormula(parsed.ast, (ref) => ({} as Record<string, FormulaValue>)[ref]).ok).toBe(false)
    }
  })
})

describe('findFormulaCycle', () => {
  it('returns null when the dependency graph is acyclic', () => {
    expect(
      findFormulaCycle({
        mod: '{valor} / 2',
        bonus: '{mod} + 1',
        total: '{bonus} + {mod}',
      }),
    ).toBeNull()
  })

  it('reports the keys of a direct self reference', () => {
    expect(findFormulaCycle({ a: '{a} + 1' })).toEqual(['a', 'a'])
  })

  it('reports an indirect cycle as a closed path', () => {
    const cycle = findFormulaCycle({ a: '{b} + 1', b: '{c} + 1', c: '{a} + 1' })
    expect(cycle).not.toBeNull()
    expect(cycle![0]).toBe(cycle![cycle!.length - 1])
    expect(new Set(cycle)).toEqual(new Set(['a', 'b', 'c']))
  })

  it('ignores references to values that are not formulas', () => {
    expect(findFormulaCycle({ a: '{plain} + 1' })).toBeNull()
  })

  it('ignores formulas that do not parse', () => {
    expect(findFormulaCycle({ a: '{b} +', b: '{a}' })).toBeNull()
  })
})
