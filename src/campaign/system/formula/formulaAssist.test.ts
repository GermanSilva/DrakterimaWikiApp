/** H3a: formula assist core (S42 a, b, e, f): error positions, evaluation trace, nearest reference, function catalogue. */
import { describe, expect, it } from 'vitest'
import { evaluateFormula, explainFormula, parseFormula, FORMULA_FUNCTION_NAMES, type FormulaTrace } from './formula'
import { FORMULA_FUNCTIONS } from './functionCatalogue'
import { nearestReference } from './suggest'

const failure = (src: string) => {
  const parsed = parseFormula(src)
  if (parsed.ok) throw new Error(`expected a parse error for ${src}`)
  return parsed
}

describe('parse errors carry their position', () => {
  it.each([
    ['{vida', 'unclosed reference', 0, 5],
    ['1 + {Vida}', 'invalid reference {Vida}', 4, 10],
    ['{constructor} + 1', 'reserved reference {constructor}', 0, 13],
    ['1 + "abc', 'unclosed text', 4, 8],
    ['"a\nb"', 'a text cannot span lines', 0, 5],
    ['1 + $', 'unexpected character "$"', 4, 5],
    ['2 3', 'unexpected token after the expression', 2, 3],
    ['1 + )', 'unexpected ")"', 4, 5],
    ['foo(1)', 'unknown function "foo"', 0, 3],
    ['1 + foo(1)', 'unknown function "foo"', 4, 7],
    ['si(1, 2)', 'si takes 3 argument(s)', 0, 8],
    ['suma({t}, 5)', 'suma needs a column name in quotes', 10, 11],
    ['suma(5)', 'suma needs a table reference first', 5, 6],
    ['(1 + 2', 'expected ")"', 6, 6],
    ['max(1, 2', 'expected ")"', 8, 8],
    ['2 + ', 'unexpected end of the formula', 4, 4],
    ['', 'empty formula', 0, 0],
  ])('%j: %s', (src, error, start, end) => {
    expect(failure(src)).toEqual({ ok: false, error, at: { start, end } })
  })

  it('points at the part that does not fit for a formula that is too long', () => {
    const src = '1'.repeat(501)
    expect(failure(src)).toEqual({ ok: false, error: 'formula too long', at: { start: 500, end: 501 } })
  })

  it('points inside the formula for one nested too deeply', () => {
    const src = '('.repeat(40) + '1' + ')'.repeat(40)
    const parsed = failure(src)
    expect(parsed.error).toBe('formula nested too deeply')
    expect(parsed.at.start).toBeGreaterThanOrEqual(0)
    expect(parsed.at.end).toBeLessThanOrEqual(src.length)
  })

  it('keeps a successful parse as it was', () => {
    expect(parseFormula('{a} + 1')).toMatchObject({ ok: true, refs: ['a'], tables: [] })
  })
})

describe('explainFormula', () => {
  const values: Record<string, unknown> = { a: 1, flag: true, rows: [{ n: 2 }, { n: 5 }] }
  const resolve = (ref: string) => values[ref]
  const explain = (src: string): FormulaTrace => {
    const parsed = parseFormula(src)
    if (!parsed.ok) throw new Error(parsed.error)
    return explainFormula(parsed.ast, resolve)
  }
  /** The shape without the noise: text, value or error, children. */
  const shape = (t: FormulaTrace): unknown => ({ text: t.text, ...(t.ok ? { value: t.value } : { error: t.error }), children: t.children.map(shape) })

  it('is a tree of the source text of each sub-expression with its value; references are leaves', () => {
    expect(shape(explain('{a} + 2 * 3'))).toEqual({
      text: '{a} + 2 * 3',
      value: 7,
      children: [
        { text: '{a}', value: 1, children: [] },
        { text: '2 * 3', value: 6, children: [{ text: '2', value: 2, children: [] }, { text: '3', value: 3, children: [] }] },
      ],
    })
  })

  it('shows functions with their arguments, a negation and texts', () => {
    expect(shape(explain('signo(-{a})'))).toEqual({
      text: 'signo(-{a})',
      value: '-1',
      children: [{ text: '-{a}', value: -1, children: [{ text: '{a}', value: 1, children: [] }] }],
    })
    expect(shape(explain('"x" & {a}'))).toMatchObject({ text: '"x" & {a}', value: 'x1' })
  })

  it('only follows the branch si takes', () => {
    expect(shape(explain('si({flag}, 10, 1 / 0)'))).toEqual({
      text: 'si({flag}, 10, 1 / 0)',
      value: 10,
      children: [{ text: '{flag}', value: 1, children: [] }, { text: '10', value: 10, children: [] }],
    })
  })

  it('shows a table function as one step with its value', () => {
    expect(shape(explain('suma({rows}, "n") + 1'))).toEqual({
      text: 'suma({rows}, "n") + 1',
      value: 8,
      children: [{ text: 'suma({rows}, "n")', value: 7, children: [] }, { text: '1', value: 1, children: [] }],
    })
  })

  it('shows the key of a lookup as a step', () => {
    const tree = explain('lookup({rows}, "n", {a} + 1, "n", 0)')
    expect(tree.ok && tree.value).toBe(2)
    expect(tree.children.map((c) => c.text)).toEqual(['{a} + 1'])
  })

  it('puts the error where it happens and on the steps above it, and stops there', () => {
    expect(shape(explain('{a} / 0 + {missing}'))).toEqual({
      text: '{a} / 0 + {missing}',
      error: 'division by zero',
      children: [
        {
          text: '{a} / 0',
          error: 'division by zero',
          children: [{ text: '{a}', value: 1, children: [] }, { text: '0', value: 0, children: [] }],
        },
      ],
    })
    expect(shape(explain('1 + {missing}'))).toMatchObject({
      error: 'no value for {missing}',
      children: [{ text: '1', value: 1 }, { text: '{missing}', error: 'no value for {missing}', children: [] }],
    })
  })

  it('agrees with evaluateFormula on every formula', () => {
    const sources = ['{a} + 1', '{a} / 0', 'si({a}, "x", 2) & "y"', 'max(1, {a}, 4)', 'suma({rows}, "n")', '{rows} + 1', '{missing}', 'round(2.5) % 0', 'lookup({rows}, "n", 9, "n")', '"a" + 1']
    for (const src of sources) {
      const parsed = parseFormula(src)
      if (!parsed.ok) throw new Error(src)
      const direct = evaluateFormula(parsed.ast, resolve)
      const tree = explainFormula(parsed.ast, resolve)
      expect(tree.ok, src).toBe(direct.ok)
      if (direct.ok && tree.ok) expect(tree.value, src).toBe(direct.value)
      if (!direct.ok && !tree.ok) expect(tree.error, src).toBe(direct.error)
    }
  })
})

describe('nearestReference', () => {
  const refs = ['fuerza', 'destreza', 'stats_str.valor', 'stats_str.modificador', 'nivel']
  it('suggests the closest reference within a small edit distance', () => {
    expect(nearestReference('fuerzaa', refs)).toBe('fuerza')
    expect(nearestReference('nivle', refs)).toBe('nivel')
    expect(nearestReference('stats_str.modifcador', refs)).toBe('stats_str.modificador')
    expect(nearestReference('Fuerza', refs)).toBe('fuerza')
  })
  it('suggests nothing when nothing is close, for a short name that only looks alike, or without candidates', () => {
    expect(nearestReference('zzzzzzzz', refs)).toBeNull()
    expect(nearestReference('dex', ['str'])).toBeNull()
    expect(nearestReference('fuerza', [])).toBeNull()
  })
  it('breaks a tie by the alphabetical order so the answer does not depend on the order given', () => {
    expect(nearestReference('abc', ['abd', 'abb'])).toBe('abb')
    expect(nearestReference('abc', ['abb', 'abd'])).toBe('abb')
  })
  it('does not suggest the exact reference back', () => {
    expect(nearestReference('nivel', refs)).toBeNull()
  })
})

describe('the function catalogue', () => {
  it('lists every function the parser accepts, and the & operator', () => {
    const names = FORMULA_FUNCTIONS.map((f) => f.name)
    for (const name of FORMULA_FUNCTION_NAMES) expect(names, name).toContain(name)
    expect(names).toContain('&')
    expect(new Set(names).size).toBe(names.length)
  })
  it('accepts only names the parser knows, plus &', () => {
    for (const { name } of FORMULA_FUNCTIONS) if (name !== '&') expect(FORMULA_FUNCTION_NAMES).toContain(name)
  })
  it('names every function the parser accepts, as the parser sees it', () => {
    for (const name of FORMULA_FUNCTION_NAMES) expect(failure(`${name}`).error).not.toBe(`unknown function "${name}"`)
    expect(failure('zzz(1)').error).toBe('unknown function "zzz"')
  })
  it('gives each one a Spanish description, its syntax and an example that parses', () => {
    for (const f of FORMULA_FUNCTIONS) {
      expect(f.description.length, f.name).toBeGreaterThan(10)
      expect(f.syntax, f.name).not.toBe('')
      expect(parseFormula(f.example).ok, `${f.name}: ${f.example}`).toBe(true)
    }
  })
  it('every example computes over a small character', () => {
    const data: Record<string, unknown> = {
      fuerza: 14,
      inventario: [{ nombre: 'Soga', peso: 5 }, { nombre: 'Daga', peso: 1 }, { nombre: 'Daga', peso: 1 }],
      precios: [{ objeto: 'Daga', oro: 2 }],
    }
    for (const f of FORMULA_FUNCTIONS) {
      const parsed = parseFormula(f.example)
      if (!parsed.ok) throw new Error(f.example)
      const r = evaluateFormula(parsed.ast, (ref) => data[ref])
      expect(r.ok, `${f.name}: ${f.example}`).toBe(true)
    }
  })
})
