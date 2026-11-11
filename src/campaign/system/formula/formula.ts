// Sheet formula language: pure, display-only arithmetic over referenced values.
// No eval, no assignment, no loops. Text literals ("...") and `&` build display texts; table functions
// (suma, promedio, conteo, mayor, menor, frecuente, infrecuente, lookup) read the rows of a table reference. See odd/design/sheet-builder.md section 2.

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
  | { kind: 'agg'; name: AggName; table: string; column?: string }
  | { kind: 'lookup'; table: string; keyColumn: string; key: FormulaNode; resultColumn: string; fallback?: FormulaNode }

type BinaryOp = '+' | '-' | '*' | '/' | '%' | '&' | '<' | '<=' | '>' | '>=' | '==' | '!='
type FunctionName = 'si' | 'min' | 'max' | 'floor' | 'ceil' | 'round' | 'abs' | 'signo'
type AggName = 'suma' | 'promedio' | 'conteo' | 'mayor' | 'menor' | 'frecuente' | 'infrecuente'
const TABLE_FUNCTIONS = new Set(['suma', 'promedio', 'conteo', 'mayor', 'menor', 'frecuente', 'infrecuente', 'lookup'])

export type ParseResult =
  | { ok: true; ast: FormulaNode; refs: string[]; tables: string[] }
  | { ok: false; error: string; at: SourceSpan }

/** 0-based offsets into the formula text, `end` exclusive. A problem at the end of the text is empty (start === end === length). */
export interface SourceSpan {
  start: number
  end: number
}

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

/** Every function name the parser accepts (the catalogue of the Funciones tab must list them all). */
export const FORMULA_FUNCTION_NAMES: readonly string[] = [...Object.keys(FUNCTIONS), ...TABLE_FUNCTIONS]

type TokenBody =
  | { type: 'num'; value: number }
  | { type: 'str'; value: string }
  | { type: 'ref'; ref: string }
  | { type: 'name'; name: string }
  | { type: 'op'; op: string }
type Token = TokenBody & SourceSpan

/** A problem of the formula; `at` says where in the text (the parser fills it in when the throw site does not know). */
class FormulaError extends Error {
  constructor(
    message: string,
    readonly at?: SourceSpan,
  ) {
    super(message)
  }
}

const REF_PATTERN = /^[a-z0-9_]+(\.[a-z0-9_]+)?$/

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  const push = (start: number, end: number, body: TokenBody) => void tokens.push({ ...body, start, end })
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (ch === ' ' || ch === '\t') {
      i += 1
    } else if (ch >= '0' && ch <= '9') {
      const match = /^\d+(\.\d+)?/.exec(src.slice(i))!
      push(i, i + match[0].length, { type: 'num', value: Number(match[0]) })
      i += match[0].length
    } else if (ch === '{') {
      const end = src.indexOf('}', i)
      if (end === -1) throw new FormulaError('unclosed reference', { start: i, end: src.length })
      const ref = src.slice(i + 1, end)
      if (!REF_PATTERN.test(ref)) throw new FormulaError(`invalid reference {${ref}}`, { start: i, end: end + 1 })
      if (ref.split('.').some((segment) => RESERVED_SEGMENTS.has(segment))) {
        throw new FormulaError(`reserved reference {${ref}}`, { start: i, end: end + 1 })
      }
      push(i, end + 1, { type: 'ref', ref })
      i = end + 1
    } else if (ch === '"') {
      const end = src.indexOf('"', i + 1)
      if (end === -1) throw new FormulaError('unclosed text', { start: i, end: src.length })
      const value = src.slice(i + 1, end)
      if (/[\r\n]/.test(value)) throw new FormulaError('a text cannot span lines', { start: i, end: end + 1 })
      push(i, end + 1, { type: 'str', value })
      i = end + 1
    } else if (ch >= 'a' && ch <= 'z') {
      const match = /^[a-z]+/.exec(src.slice(i))!
      push(i, i + match[0].length, { type: 'name', name: match[0] })
      i += match[0].length
    } else {
      const two = src.slice(i, i + 2)
      if (two === '<=' || two === '>=' || two === '==' || two === '!=') {
        push(i, i + 2, { type: 'op', op: two })
        i += 2
      } else if ('+-*/%&<>(),'.includes(ch)) {
        push(i, i + 1, { type: 'op', op: ch })
        i += 1
      } else {
        throw new FormulaError(`unexpected character "${ch}"`, { start: i, end: i + 1 })
      }
    }
  }
  return tokens
}

/** Where each parsed node sits in its source text, so a trace can quote the sub-expression (not part of the AST, which stays plain data). */
const SOURCE_OF = new WeakMap<FormulaNode, { source: string; start: number; end: number }>()

class Parser {
  private pos = 0
  private depth = 0
  readonly refs: string[] = []
  readonly tables: string[] = []

  constructor(
    private readonly tokens: Token[],
    private readonly source: string,
  ) {}

  /** The current token, or the end of the text when there is none. */
  private here(): SourceSpan {
    const token = this.tokens[this.pos]
    return token ? { start: token.start, end: token.end } : { start: this.source.length, end: this.source.length }
  }

  private fail(message: string, at: SourceSpan = this.here()): never {
    throw new FormulaError(message, at)
  }

  /** Records that `node` spans from token `from` to the last token read. */
  private mark<T extends FormulaNode>(node: T, from: number): T {
    SOURCE_OF.set(node, { source: this.source, start: this.tokens[from].start, end: this.tokens[this.pos - 1].end })
    return node
  }

  parse(): FormulaNode {
    const node = this.comparison()
    if (this.pos < this.tokens.length) this.fail('unexpected token after the expression')
    return node
  }

  private peekOp(...ops: string[]): string | null {
    const token = this.tokens[this.pos]
    return token?.type === 'op' && ops.includes(token.op) ? token.op : null
  }

  private expectOp(op: string): void {
    if (!this.peekOp(op)) this.fail(`expected "${op}"`)
    this.pos += 1
  }

  private nested<T>(parse: () => T): T {
    this.depth += 1
    if (this.depth > MAX_DEPTH) this.fail('formula nested too deeply')
    try {
      return parse()
    } finally {
      this.depth -= 1
    }
  }

  private comparison(): FormulaNode {
    const from = this.pos
    let left = this.concat()
    for (let op = this.peekOp('<', '<=', '>', '>=', '==', '!='); op; op = this.peekOp('<', '<=', '>', '>=', '==', '!=')) {
      this.pos += 1
      left = this.mark({ kind: 'bin', op: op as BinaryOp, left, right: this.concat() }, from)
    }
    return left
  }

  /** `&` binds looser than arithmetic: `{a} & "/" & {a} + 9` joins the sum. */
  private concat(): FormulaNode {
    const from = this.pos
    let left = this.additive()
    while (this.peekOp('&')) {
      this.pos += 1
      left = this.mark({ kind: 'bin', op: '&', left, right: this.additive() }, from)
    }
    return left
  }

  private additive(): FormulaNode {
    const from = this.pos
    let left = this.multiplicative()
    for (let op = this.peekOp('+', '-'); op; op = this.peekOp('+', '-')) {
      this.pos += 1
      left = this.mark({ kind: 'bin', op: op as BinaryOp, left, right: this.multiplicative() }, from)
    }
    return left
  }

  private multiplicative(): FormulaNode {
    const from = this.pos
    let left = this.unary()
    for (let op = this.peekOp('*', '/', '%'); op; op = this.peekOp('*', '/', '%')) {
      this.pos += 1
      left = this.mark({ kind: 'bin', op: op as BinaryOp, left, right: this.unary() }, from)
    }
    return left
  }

  private unary(): FormulaNode {
    if (this.peekOp('-')) {
      const from = this.pos
      this.pos += 1
      return this.mark(this.nested(() => ({ kind: 'neg', operand: this.unary() }) as FormulaNode), from)
    }
    return this.primary()
  }

  private primary(): FormulaNode {
    const token = this.tokens[this.pos]
    if (!token) return this.fail('unexpected end of the formula')
    const from = this.pos
    if (token.type === 'num') {
      this.pos += 1
      return this.mark({ kind: 'num', value: token.value }, from)
    }
    if (token.type === 'str') {
      this.pos += 1
      return this.mark({ kind: 'str', value: token.value }, from)
    }
    if (token.type === 'ref') {
      this.pos += 1
      this.noteRef(token.ref)
      return this.mark({ kind: 'ref', ref: token.ref }, from)
    }
    if (token.type === 'name') {
      this.pos += 1
      return this.mark(this.call(token.name, token), from)
    }
    if (token.op === '(') {
      this.pos += 1
      const inner = this.nested(() => this.comparison())
      this.expectOp(')')
      return inner
    }
    return this.fail(`unexpected "${token.op}"`)
  }

  private noteRef(ref: string): void {
    if (!this.refs.includes(ref)) this.refs.push(ref)
  }

  private tableRef(fn: string): string {
    const token = this.tokens[this.pos]
    if (token?.type !== 'ref') this.fail(`${fn} needs a table reference first`)
    this.pos += 1
    this.noteRef(token.ref)
    if (!this.tables.includes(token.ref)) this.tables.push(token.ref)
    return token.ref
  }

  /** Column names are fixed texts, so a validator can check them against the table. */
  private columnName(fn: string): string {
    this.expectOp(',')
    const token = this.tokens[this.pos]
    if (token?.type !== 'str' || token.value === '') this.fail(`${fn} needs a column name in quotes`)
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
      return { kind: 'agg', name: fn as AggName, table, column: this.columnName(fn) }
    })
    this.expectOp(')')
    return node
  }

  private call(name: string, nameToken: Token): FormulaNode {
    if (TABLE_FUNCTIONS.has(name)) return this.tableCall(name)
    if (!Object.prototype.hasOwnProperty.call(FUNCTIONS, name)) {
      this.fail(`unknown function "${name}"`, { start: nameToken.start, end: nameToken.end })
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
      this.fail(`${fn} takes ${min === max ? min : `${min} to ${max}`} argument(s)`, { start: nameToken.start, end: this.tokens[this.pos - 1].end })
    }
    return { kind: 'call', name: fn, args }
  }
}

export function parseFormula(src: string): ParseResult {
  if (src.trim() === '') return { ok: false, error: 'empty formula', at: { start: 0, end: src.length } }
  if (src.length > MAX_FORMULA_LENGTH) return { ok: false, error: 'formula too long', at: { start: MAX_FORMULA_LENGTH, end: src.length } }
  try {
    const parser = new Parser(tokenize(src), src)
    const ast = parser.parse()
    return { ok: true, ast, refs: parser.refs, tables: parser.tables }
  } catch (error) {
    if (error instanceof FormulaError) return { ok: false, error: error.message, at: error.at ?? { start: src.length, end: src.length } }
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

/** The most (frecuente) or least (infrecuente) repeated filled value; a tie goes to the value that appears first. */
function repeated(name: 'frecuente' | 'infrecuente', table: string, cells: (Value | undefined)[]): Value {
  const counts = new Map<Value, number>()
  for (const cell of cells) if (cell !== undefined) counts.set(cell, (counts.get(cell) ?? 0) + 1)
  if (counts.size === 0) throw new FormulaError(`no values in {${table}}`)
  let best: Value | undefined
  let bestCount = 0
  for (const [value, count] of counts) {
    if (best === undefined || (name === 'frecuente' ? count > bestCount : count < bestCount)) {
      best = value
      bestCount = count
    }
  }
  return best as Value
}

/** Records the steps of an evaluation as a tree (see explainFormula); the evaluator calls it, it never decides anything. */
class Tracer {
  readonly roots: Frame[] = []
  private readonly open_: Frame[] = []

  open(node: FormulaNode): void {
    const frame: Frame = { node, children: [] }
    const parent = this.open_[this.open_.length - 1]
    ;(parent ? parent.children : this.roots).push(frame)
    this.open_.push(frame)
  }

  close(result: EvaluateResult): void {
    const frame = this.open_.pop()
    if (frame) frame.result = result
  }
}
interface Frame {
  node: FormulaNode
  children: Frame[]
  result?: EvaluateResult
}

/** The one evaluation path: with a tracer it also records every step, without one it is the plain evaluator. */
function evalNode(node: FormulaNode, resolve: (ref: string) => unknown, tracer?: Tracer): Value {
  if (!tracer) return evalCore(node, resolve)
  tracer.open(node)
  try {
    const value = evalCore(node, resolve, tracer)
    tracer.close({ ok: true, value })
    return value
  } catch (error) {
    if (error instanceof FormulaError) tracer.close({ ok: false, error: error.message })
    throw error
  }
}

function evalCore(node: FormulaNode, resolve: (ref: string) => unknown, tracer?: Tracer): Value {
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
      return -num(evalNode(node.operand, resolve, tracer))
    case 'agg': {
      const rows = tableRows(node.table, resolve)
      if (node.column === undefined) return rows.length
      const cells = rows.map((row) => cellValue(ownCell(row, node.column as string)))
      if (node.name === 'conteo') return cells.filter((cell) => cell !== undefined && cell !== 0).length
      if (node.name === 'frecuente' || node.name === 'infrecuente') return repeated(node.name, node.table, cells)
      const numbers = cells.filter((cell): cell is Value => cell !== undefined).map(num)
      if (node.name === 'mayor' || node.name === 'menor') {
        if (numbers.length === 0) throw new FormulaError(`no values in {${node.table}}`)
        return node.name === 'mayor' ? Math.max(...numbers) : Math.min(...numbers)
      }
      const total = numbers.reduce((sum, value) => finite(sum + value), 0)
      if (node.name === 'suma') return total
      if (numbers.length === 0) throw new FormulaError(`no values to average in {${node.table}}`)
      return total / numbers.length
    }
    case 'lookup': {
      const rows = tableRows(node.table, resolve)
      const key = evalNode(node.key, resolve, tracer)
      const row = rows.find((candidate) => cellValue(ownCell(candidate, node.keyColumn)) === key)
      const found = row ? cellValue(ownCell(row, node.resultColumn)) : undefined
      if (found !== undefined) return found
      if (node.fallback) return evalNode(node.fallback, resolve, tracer)
      throw new FormulaError(row ? `the row of ${text(key)} has no ${node.resultColumn}` : `no row of {${node.table}} has ${text(key)}`)
    }
    case 'bin': {
      const left = evalNode(node.left, resolve, tracer)
      const right = evalNode(node.right, resolve, tracer)
      if (node.op === '&') return text(left) + text(right)
      if (node.op === '==') return left === right ? 1 : 0
      if (node.op === '!=') return left !== right ? 1 : 0
      return arithmetic(node.op, num(left), num(right))
    }
    case 'call': {
      if (node.name === 'si') {
        const branch = num(evalNode(node.args[0], resolve, tracer)) !== 0 ? node.args[1] : node.args[2]
        return evalNode(branch, resolve, tracer)
      }
      const args = node.args.map((arg) => num(evalNode(arg, resolve, tracer)))
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
  return runFormula(ast, resolve)
}

function runFormula(ast: FormulaNode, resolve: (ref: string) => unknown, tracer?: Tracer): EvaluateResult {
  try {
    const value = evalNode(ast, resolve, tracer)
    return { ok: true, value: typeof value === 'number' ? finite(value) : value }
  } catch (error) {
    if (error instanceof FormulaError) return { ok: false, error: error.message }
    throw error
  }
}

/** One step of an evaluation: the source text of a sub-expression, what it gave (a value or the reason it could not be computed) and the steps it took. */
export type FormulaTrace = { text: string; children: FormulaTrace[] } & ({ ok: true; value: number | string } | { ok: false; error: string })

/**
 * The evaluation of a formula as a tree ("Explicar el resultado"). It runs the same evaluator as evaluateFormula, so it cannot
 * disagree with it: references and table functions are leaves, `si` only shows the branch it took, and after an error nothing
 * else is evaluated (the steps above the error repeat it).
 */
export function explainFormula(ast: FormulaNode, resolve: (ref: string) => unknown): FormulaTrace {
  const tracer = new Tracer()
  const result = runFormula(ast, resolve, tracer)
  const build = (frame: Frame, final?: EvaluateResult): FormulaTrace => ({
    text: textOf(frame.node),
    children: frame.children.map((child) => build(child)),
    ...(final ?? frame.result ?? { ok: false as const, error: 'not evaluated' }),
  })
  return build(tracer.roots[0], result)
}

function textOf(node: FormulaNode): string {
  const where = SOURCE_OF.get(node)
  return where ? where.source.slice(where.start, where.end) : unparse(node)
}

/** Text for a node that was not parsed from text (built by hand). */
function unparse(node: FormulaNode): string {
  const quote = (value: string) => `"${value}"`
  switch (node.kind) {
    case 'num':
      return String(node.value)
    case 'str':
      return quote(node.value)
    case 'ref':
      return `{${node.ref}}`
    case 'neg':
      return `-${unparse(node.operand)}`
    case 'bin':
      return `${unparse(node.left)} ${node.op} ${unparse(node.right)}`
    case 'call':
      return `${node.name}(${node.args.map(unparse).join(', ')})`
    case 'agg':
      return `${node.name}({${node.table}}${node.column !== undefined ? `, ${quote(node.column)}` : ''})`
    case 'lookup':
      return `lookup({${node.table}}, ${quote(node.keyColumn)}, ${unparse(node.key)}, ${quote(node.resultColumn)}${node.fallback ? `, ${unparse(node.fallback)}` : ''})`
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
