// Sheet formula language: pure, display-only arithmetic over referenced values.
// No eval, no assignment, no strings, no loops. See odd/design/sheet-builder.md section 2.

export const MAX_FORMULA_LENGTH = 500
const MAX_DEPTH = 32
const MAX_ARGUMENTS = 16
const RESERVED_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype'])

export type FormulaValue = number | boolean

export type FormulaNode =
  | { kind: 'num'; value: number }
  | { kind: 'ref'; ref: string }
  | { kind: 'neg'; operand: FormulaNode }
  | { kind: 'bin'; op: BinaryOp; left: FormulaNode; right: FormulaNode }
  | { kind: 'call'; name: FunctionName; args: FormulaNode[] }

type BinaryOp = '+' | '-' | '*' | '/' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!='
type FunctionName = 'si' | 'min' | 'max' | 'floor' | 'ceil' | 'round' | 'abs'

export type ParseResult =
  | { ok: true; ast: FormulaNode; refs: string[] }
  | { ok: false; error: string }

export type EvaluateResult = { ok: true; value: number } | { ok: false; error: string }

const FUNCTIONS: Record<FunctionName, { min: number; max: number }> = {
  si: { min: 3, max: 3 },
  min: { min: 1, max: MAX_ARGUMENTS },
  max: { min: 1, max: MAX_ARGUMENTS },
  floor: { min: 1, max: 1 },
  ceil: { min: 1, max: 1 },
  round: { min: 1, max: 1 },
  abs: { min: 1, max: 1 },
}

type Token =
  | { type: 'num'; value: number }
  | { type: 'ref'; ref: string }
  | { type: 'name'; name: string }
  | { type: 'op'; op: string }

class FormulaError extends Error {}

const REF_PATTERN = /^[a-z0-9_]+(\.[a-z0-9_]+)?$/

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (ch === ' ' || ch === '\t') {
      i += 1
    } else if (ch >= '0' && ch <= '9') {
      const match = /^\d+(\.\d+)?/.exec(src.slice(i))!
      tokens.push({ type: 'num', value: Number(match[0]) })
      i += match[0].length
    } else if (ch === '{') {
      const end = src.indexOf('}', i)
      if (end === -1) throw new FormulaError('unclosed reference')
      const ref = src.slice(i + 1, end)
      if (!REF_PATTERN.test(ref)) throw new FormulaError(`invalid reference {${ref}}`)
      if (ref.split('.').some((segment) => RESERVED_SEGMENTS.has(segment))) {
        throw new FormulaError(`reserved reference {${ref}}`)
      }
      tokens.push({ type: 'ref', ref })
      i = end + 1
    } else if (ch >= 'a' && ch <= 'z') {
      const match = /^[a-z]+/.exec(src.slice(i))!
      tokens.push({ type: 'name', name: match[0] })
      i += match[0].length
    } else {
      const two = src.slice(i, i + 2)
      if (two === '<=' || two === '>=' || two === '==' || two === '!=') {
        tokens.push({ type: 'op', op: two })
        i += 2
      } else if ('+-*/%<>(),'.includes(ch)) {
        tokens.push({ type: 'op', op: ch })
        i += 1
      } else {
        throw new FormulaError(`unexpected character "${ch}"`)
      }
    }
  }
  return tokens
}

class Parser {
  private pos = 0
  private depth = 0
  readonly refs: string[] = []

  constructor(private readonly tokens: Token[]) {}

  parse(): FormulaNode {
    const node = this.comparison()
    if (this.pos < this.tokens.length) throw new FormulaError('unexpected token after the expression')
    return node
  }

  private peekOp(...ops: string[]): string | null {
    const token = this.tokens[this.pos]
    return token?.type === 'op' && ops.includes(token.op) ? token.op : null
  }

  private expectOp(op: string): void {
    if (!this.peekOp(op)) throw new FormulaError(`expected "${op}"`)
    this.pos += 1
  }

  private nested<T>(parse: () => T): T {
    this.depth += 1
    if (this.depth > MAX_DEPTH) throw new FormulaError('formula nested too deeply')
    try {
      return parse()
    } finally {
      this.depth -= 1
    }
  }

  private comparison(): FormulaNode {
    let left = this.additive()
    for (let op = this.peekOp('<', '<=', '>', '>=', '==', '!='); op; op = this.peekOp('<', '<=', '>', '>=', '==', '!=')) {
      this.pos += 1
      left = { kind: 'bin', op: op as BinaryOp, left, right: this.additive() }
    }
    return left
  }

  private additive(): FormulaNode {
    let left = this.multiplicative()
    for (let op = this.peekOp('+', '-'); op; op = this.peekOp('+', '-')) {
      this.pos += 1
      left = { kind: 'bin', op: op as BinaryOp, left, right: this.multiplicative() }
    }
    return left
  }

  private multiplicative(): FormulaNode {
    let left = this.unary()
    for (let op = this.peekOp('*', '/', '%'); op; op = this.peekOp('*', '/', '%')) {
      this.pos += 1
      left = { kind: 'bin', op: op as BinaryOp, left, right: this.unary() }
    }
    return left
  }

  private unary(): FormulaNode {
    if (this.peekOp('-')) {
      this.pos += 1
      return this.nested(() => ({ kind: 'neg', operand: this.unary() }) as FormulaNode)
    }
    return this.primary()
  }

  private primary(): FormulaNode {
    const token = this.tokens[this.pos]
    if (!token) throw new FormulaError('unexpected end of the formula')
    if (token.type === 'num') {
      this.pos += 1
      return { kind: 'num', value: token.value }
    }
    if (token.type === 'ref') {
      this.pos += 1
      if (!this.refs.includes(token.ref)) this.refs.push(token.ref)
      return { kind: 'ref', ref: token.ref }
    }
    if (token.type === 'name') {
      this.pos += 1
      return this.call(token.name)
    }
    if (token.op === '(') {
      this.pos += 1
      const inner = this.nested(() => this.comparison())
      this.expectOp(')')
      return inner
    }
    throw new FormulaError(`unexpected "${token.op}"`)
  }

  private call(name: string): FormulaNode {
    if (!Object.prototype.hasOwnProperty.call(FUNCTIONS, name)) {
      throw new FormulaError(`unknown function "${name}"`)
    }
    const fn = name as FunctionName
    this.expectOp('(')
    const args = this.nested(() => {
      const list: FormulaNode[] = [this.comparison()]
      while (this.peekOp(',')) {
        this.pos += 1
        list.push(this.comparison())
      }
      return list
    })
    this.expectOp(')')
    const { min, max } = FUNCTIONS[fn]
    if (args.length < min || args.length > max) {
      throw new FormulaError(`${fn} takes ${min === max ? min : `${min} to ${max}`} argument(s)`)
    }
    return { kind: 'call', name: fn, args }
  }
}

export function parseFormula(src: string): ParseResult {
  if (src.trim() === '') return { ok: false, error: 'empty formula' }
  if (src.length > MAX_FORMULA_LENGTH) return { ok: false, error: 'formula too long' }
  try {
    const parser = new Parser(tokenize(src))
    const ast = parser.parse()
    return { ok: true, ast, refs: parser.refs }
  } catch (error) {
    if (error instanceof FormulaError) return { ok: false, error: error.message }
    throw error
  }
}

function finite(value: number): number {
  if (!Number.isFinite(value)) throw new FormulaError('result is not a finite number')
  return value
}

function evalNode(node: FormulaNode, resolve: (ref: string) => unknown): number {
  switch (node.kind) {
    case 'num':
      return node.value
    case 'ref': {
      const value = resolve(node.ref)
      if (typeof value === 'boolean') return value ? 1 : 0
      if (typeof value === 'number' && Number.isFinite(value)) return value
      throw new FormulaError(`no numeric value for {${node.ref}}`)
    }
    case 'neg':
      return -evalNode(node.operand, resolve)
    case 'bin': {
      const left = evalNode(node.left, resolve)
      const right = evalNode(node.right, resolve)
      switch (node.op) {
        case '+':
          return finite(left + right)
        case '-':
          return finite(left - right)
        case '*':
          return finite(left * right)
        case '/':
          if (right === 0) throw new FormulaError('division by zero')
          return finite(left / right)
        case '%':
          if (right === 0) throw new FormulaError('modulo by zero')
          return finite(left % right)
        case '<':
          return left < right ? 1 : 0
        case '<=':
          return left <= right ? 1 : 0
        case '>':
          return left > right ? 1 : 0
        case '>=':
          return left >= right ? 1 : 0
        case '==':
          return left === right ? 1 : 0
        default:
          return left !== right ? 1 : 0
      }
    }
    case 'call': {
      if (node.name === 'si') {
        const branch = evalNode(node.args[0], resolve) !== 0 ? node.args[1] : node.args[2]
        return evalNode(branch, resolve)
      }
      const args = node.args.map((arg) => evalNode(arg, resolve))
      switch (node.name) {
        case 'min':
          return Math.min(...args)
        case 'max':
          return Math.max(...args)
        case 'floor':
          return Math.floor(args[0])
        case 'ceil':
          return Math.ceil(args[0])
        case 'round':
          return Math.round(args[0])
        default:
          return Math.abs(args[0])
      }
    }
  }
}

/** Evaluates a parsed formula; any problem (missing value, division by zero, overflow) is a result, never a throw. */
export function evaluateFormula(ast: FormulaNode, resolve: (ref: string) => unknown): EvaluateResult {
  try {
    return { ok: true, value: finite(evalNode(ast, resolve)) }
  } catch (error) {
    if (error instanceof FormulaError) return { ok: false, error: error.message }
    throw error
  }
}

/**
 * Looks for a reference cycle among formulas keyed by their own field key. Returns a closed path
 * (first key repeated at the end) or null. Formulas that do not parse are skipped: they are
 * reported separately by parseFormula.
 */
export function findFormulaCycle(formulas: Record<string, string>): string[] | null {
  const edges = new Map<string, string[]>()
  for (const key of Object.keys(formulas)) {
    const parsed = parseFormula(formulas[key])
    if (parsed.ok) edges.set(key, parsed.refs)
  }
  const done = new Set<string>()
  for (const start of edges.keys()) {
    if (done.has(start)) continue
    const path: string[] = [start]
    const next: number[] = [0]
    const onPath = new Set<string>([start])
    while (path.length > 0) {
      const node = path[path.length - 1]
      const targets = edges.get(node) ?? []
      const index = next[next.length - 1]
      if (index >= targets.length) {
        done.add(node)
        onPath.delete(node)
        path.pop()
        next.pop()
        continue
      }
      next[next.length - 1] = index + 1
      const target = targets[index]
      if (!edges.has(target) || done.has(target)) continue
      if (onPath.has(target)) return [...path.slice(path.indexOf(target)), target]
      path.push(target)
      next.push(0)
      onPath.add(target)
    }
  }
  return null
}
