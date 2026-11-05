// Sheet formula language: pure, display-only arithmetic over referenced values.
// No eval, no assignment, no loops. Text literals ("...") and `&` build display texts; table functions
// (suma, promedio, conteo, lookup) read the rows of a table reference. See odd/design/sheet-builder.md section 2.

export const MAX_FORMULA_LENGTH = 500
const MAX_DEPTH = 32
const MAX_ARGUMENTS = 16
const RESERVED_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype'])

export type FormulaValue = number | boolean | string

export type FormulaNode =
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'ref'; ref: string }
  | { kind: 'neg'; operand: FormulaNode }
  | { kind: 'bin'; op: BinaryOp; left: FormulaNode; right: FormulaNode }
  | { kind: 'call'; name: FunctionName; args: FormulaNode[] }
  | { kind: 'agg'; name: 'suma' | 'promedio' | 'conteo'; table: string; column?: string }
  | { kind: 'lookup'; table: string; keyColumn: string; key: FormulaNode; resultColumn: string; fallback?: FormulaNode }

type BinaryOp = '+' | '-' | '*' | '/' | '%' | '&' | '<' | '<=' | '>' | '>=' | '==' | '!='
type FunctionName = 'si' | 'min' | 'max' | 'floor' | 'ceil' | 'round' | 'abs' | 'signo'
const TABLE_FUNCTIONS = new Set(['suma', 'promedio', 'conteo', 'lookup'])

export type ParseResult =
  | { ok: true; ast: FormulaNode; refs: string[]; tables: string[] }
  | { ok: false; error: string }

export type EvaluateResult = { ok: true; value: number | string } | { ok: false; error: string }

const FUNCTIONS: Record<FunctionName, { min: number; max: number }> = {
  si: { min: 3, max: 3 },
  min: { min: 1, max: MAX_ARGUMENTS },
  max: { min: 1, max: MAX_ARGUMENTS },
  floor: { min: 1, max: 1 },
  ceil: { min: 1, max: 1 },
  round: { min: 1, max: 1 },
  abs: { min: 1, max: 1 },
  signo: { min: 1, max: 1 },
}

type Token =
  | { type: 'num'; value: number }
  | { type: 'str'; value: string }
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
    } else if (ch === '"') {
      const end = src.indexOf('"', i + 1)
      if (end === -1) throw new FormulaError('unclosed text')
      const value = src.slice(i + 1, end)
      if (/[\r\n]/.test(value)) throw new FormulaError('a text cannot span lines')
      tokens.push({ type: 'str', value })
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
      } else if ('+-*/%&<>(),'.includes(ch)) {
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
  readonly tables: string[] = []

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
    let left = this.concat()
    for (let op = this.peekOp('<', '<=', '>', '>=', '==', '!='); op; op = this.peekOp('<', '<=', '>', '>=', '==', '!=')) {
      this.pos += 1
      left = { kind: 'bin', op: op as BinaryOp, left, right: this.concat() }
    }
    return left
  }

  /** `&` binds looser than arithmetic: `{a} & "/" & {a} + 9` joins the sum. */
  private concat(): FormulaNode {
    let left = this.additive()
    while (this.peekOp('&')) {
      this.pos += 1
      left = { kind: 'bin', op: '&', left, right: this.additive() }
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
    if (token.type === 'str') {
      this.pos += 1
      return { kind: 'str', value: token.value }
    }
    if (token.type === 'ref') {
      this.pos += 1
      this.noteRef(token.ref)
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

  private noteRef(ref: string): void {
    if (!this.refs.includes(ref)) this.refs.push(ref)
  }

  private tableRef(fn: string): string {
    const token = this.tokens[this.pos]
    if (token?.type !== 'ref') throw new FormulaError(`${fn} needs a table reference first`)
    this.pos += 1
    this.noteRef(token.ref)
    if (!this.tables.includes(token.ref)) this.tables.push(token.ref)
    return token.ref
  }

  /** Column names are fixed texts, so a validator can check them against the table. */
  private columnName(fn: string): string {
    this.expectOp(',')
    const token = this.tokens[this.pos]
    if (token?.type !== 'str' || token.value === '') throw new FormulaError(`${fn} needs a column name in quotes`)
    this.pos += 1
    return token.value
  }

  private tableCall(fn: string): FormulaNode {
    this.expectOp('(')
    const node = this.nested((): FormulaNode => {
      const table = this.tableRef(fn)
      if (fn === 'lookup') {
        const keyColumn = this.columnName(fn)
        this.expectOp(',')
        const key = this.comparison()
        const resultColumn = this.columnName(fn)
        let fallback: FormulaNode | undefined
        if (this.peekOp(',')) {
          this.pos += 1
          fallback = this.comparison()
        }
        return { kind: 'lookup', table, keyColumn, key, resultColumn, ...(fallback ? { fallback } : {}) }
      }
      if (fn === 'conteo' && !this.peekOp(',')) return { kind: 'agg', name: 'conteo', table }
      return { kind: 'agg', name: fn as 'suma' | 'promedio' | 'conteo', table, column: this.columnName(fn) }
    })
    this.expectOp(')')
    return node
  }

  private call(name: string): FormulaNode {
    if (TABLE_FUNCTIONS.has(name)) return this.tableCall(name)
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
    return { ok: true, ast, refs: parser.refs, tables: parser.tables }
  } catch (error) {
    if (error instanceof FormulaError) return { ok: false, error: error.message }
    throw error
  }
}

function finite(value: number): number {
  if (!Number.isFinite(value)) throw new FormulaError('result is not a finite number')
  return value
}

type Value = number | string

const num = (value: Value): number => {
  if (typeof value !== 'number') throw new FormulaError('a text cannot be used as a number')
  return value
}

const round2 = (value: number) => Math.round(value * 100) / 100
const text = (value: Value): string => (typeof value === 'number' ? String(round2(value)) : value)

const ownCell = (row: Record<string, unknown>, column: string): unknown =>
  Object.prototype.hasOwnProperty.call(row, column) ? row[column] : undefined

function tableRows(ref: string, resolve: (ref: string) => unknown): Record<string, unknown>[] {
  const value = resolve(ref)
  if (!Array.isArray(value)) throw new FormulaError(`{${ref}} is not a table`)
  return value.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null && !Array.isArray(row))
}

/** A cell as a formula value; empty (missing, null, '') is undefined. */
function cellValue(raw: unknown): Value | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined
  if (typeof raw === 'boolean') return raw ? 1 : 0
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') return raw
  throw new FormulaError('a cell holds something that is not a value')
}

function evalNode(node: FormulaNode, resolve: (ref: string) => unknown): Value {
  switch (node.kind) {
    case 'num':
    case 'str':
      return node.value
    case 'ref': {
      const value = resolve(node.ref)
      if (typeof value === 'boolean') return value ? 1 : 0
      if (typeof value === 'number' && Number.isFinite(value)) return value
      if (typeof value === 'string') return value
      if (Array.isArray(value)) throw new FormulaError(`{${node.ref}} is a table, use it inside a table function`)
      throw new FormulaError(`no value for {${node.ref}}`)
    }
    case 'neg':
      return -num(evalNode(node.operand, resolve))
    case 'agg': {
      const rows = tableRows(node.table, resolve)
      if (node.column === undefined) return rows.length
      const cells = rows.map((row) => cellValue(ownCell(row, node.column as string)))
      if (node.name === 'conteo') return cells.filter((cell) => cell !== undefined && cell !== 0).length
      const numbers = cells.filter((cell): cell is Value => cell !== undefined).map(num)
      const total = numbers.reduce((sum, value) => finite(sum + value), 0)
      if (node.name === 'suma') return total
      if (numbers.length === 0) throw new FormulaError(`no values to average in {${node.table}}`)
      return total / numbers.length
    }
    case 'lookup': {
      const rows = tableRows(node.table, resolve)
      const key = evalNode(node.key, resolve)
      const row = rows.find((candidate) => cellValue(ownCell(candidate, node.keyColumn)) === key)
      const found = row ? cellValue(ownCell(row, node.resultColumn)) : undefined
      if (found !== undefined) return found
      if (node.fallback) return evalNode(node.fallback, resolve)
      throw new FormulaError(row ? `the row of ${text(key)} has no ${node.resultColumn}` : `no row of {${node.table}} has ${text(key)}`)
    }
    case 'bin': {
      const left = evalNode(node.left, resolve)
      const right = evalNode(node.right, resolve)
      if (node.op === '&') return text(left) + text(right)
      if (node.op === '==') return left === right ? 1 : 0
      if (node.op === '!=') return left !== right ? 1 : 0
      return arithmetic(node.op, num(left), num(right))
    }
    case 'call': {
      if (node.name === 'si') {
        const branch = num(evalNode(node.args[0], resolve)) !== 0 ? node.args[1] : node.args[2]
        return evalNode(branch, resolve)
      }
      const args = node.args.map((arg) => num(evalNode(arg, resolve)))
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
        case 'signo': {
          const value = round2(args[0])
          return value >= 0 ? `+${value}` : String(value)
        }
        default:
          return Math.abs(args[0])
      }
    }
  }
}

function arithmetic(op: Exclude<BinaryOp, '&' | '==' | '!='>, left: number, right: number): number {
  switch (op) {
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
    default:
      return left >= right ? 1 : 0
  }
}

/** True when a formula builds text ("...", &, signo) or reads a table: the sheet validators gate these features. */
export function usesTextOrTables(node: FormulaNode): boolean {
  switch (node.kind) {
    case 'num':
    case 'ref':
      return false
    case 'neg':
      return usesTextOrTables(node.operand)
    case 'bin':
      return node.op === '&' || usesTextOrTables(node.left) || usesTextOrTables(node.right)
    case 'call':
      return node.name === 'signo' || node.args.some(usesTextOrTables)
    default:
      return true
  }
}

/** Evaluates a parsed formula; any problem (missing value, division by zero, overflow) is a result, never a throw. */
export function evaluateFormula(ast: FormulaNode, resolve: (ref: string) => unknown): EvaluateResult {
  try {
    const value = evalNode(ast, resolve)
    return { ok: true, value: typeof value === 'number' ? finite(value) : value }
  } catch (error) {
    if (error instanceof FormulaError) return { ok: false, error: error.message }
    throw error
  }
}

/** What a formula reads: value references, and for each table reference the column names its table functions use. */
export interface FormulaUses {
  plain: string[]
  tables: { table: string; columns: string[] }[]
}

export function formulaUses(ast: FormulaNode): FormulaUses {
  const plain: string[] = []
  const tables: FormulaUses['tables'] = []
  const noteTable = (table: string, columns: (string | undefined)[]) => {
    let entry = tables.find((t) => t.table === table)
    if (!entry) tables.push((entry = { table, columns: [] }))
    for (const column of columns) if (column !== undefined && !entry.columns.includes(column)) entry.columns.push(column)
  }
  const walk = (node: FormulaNode): void => {
    switch (node.kind) {
      case 'ref':
        if (!plain.includes(node.ref)) plain.push(node.ref)
        return
      case 'neg':
        return walk(node.operand)
      case 'bin':
        walk(node.left)
        return walk(node.right)
      case 'call':
        return node.args.forEach(walk)
      case 'agg':
        return noteTable(node.table, [node.column])
      case 'lookup':
        noteTable(node.table, [node.keyColumn, node.resultColumn])
        walk(node.key)
        if (node.fallback) walk(node.fallback)
        return
      default:
    }
  }
  walk(ast)
  return { plain, tables }
}

/**
 * Looks for a cycle in a graph given as node -> nodes it depends on. Returns a closed path (first node repeated at the
 * end) or null. Targets that are not nodes are leaves.
 */
export function findEdgeCycle(edges: Map<string, string[]>): string[] | null {
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
  return findEdgeCycle(edges)
}
