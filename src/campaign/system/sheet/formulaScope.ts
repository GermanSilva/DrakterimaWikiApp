/**
 * What a formula can reference where it is written, and who reads a key (S42 b, f). The namespace comes from the same code
 * validateSheet runs (`knownReferences`, `analyzeFormulas`, `formulaNode`), so a listed reference is one the validator accepts
 * there: the field itself and anything that would close a cycle are left out.
 */
import { formulaUses, parseFormula, usesTextOrTables } from '../formula/formula'
import {
  analyzeFormulas,
  formulaNode,
  knownReferences,
  nodeLabels,
  type CalcEntry,
  type Column,
  type FormulaEntry,
  type FormulaFacts,
  type OptionDef,
  type Sheet,
} from './sheetModel'

export type ScopeGroup = 'campos' | 'atributos' | 'capacidades' | 'locales' | 'tablas'
export type ScopeKind = 'number' | 'text' | 'boolean' | 'table'

export interface ScopeEntry {
  /** The exact text to put inside the braces. */
  ref: string
  /** Spanish, from the sheet's own labels. */
  label: string
  group: ScopeGroup
  kind: ScopeKind
  /** A table: only valid inside a table function (suma, conteo, lookup...), never as a value. */
  tableOnly?: true
}

/** Where a formula is written. An option of a field or column belongs to the field or column. */
export type FormulaContext =
  | { kind: 'field'; key: string }
  | { kind: 'stat'; row: string }
  | { kind: 'column'; table: string; column: string }

/** The facts validateSheet collects while walking the raw sheet, rebuilt from a valid sheet (same paths, same locals). */
export function formulaFactsOf(sheet: Sheet): FormulaFacts {
  const formulas: FormulaEntry[] = []
  const calcs: CalcEntry[] = []
  const globalKeys: string[] = []
  const statRows = new Set<string>()
  const capColumns = new Map<string, Map<string, boolean>>()
  const tableColumns = new Map<string, Set<string>>()
  const tableKeys = new Set<string>()
  const formulasOf = (path: string, key: string, owner: { formula?: string; options?: OptionDef[] }, locals: string[], table?: string) => {
    const extra = table !== undefined ? { table } : {}
    if (owner.formula !== undefined) formulas.push({ path: `${path}.formula`, key, text: owner.formula, locals, ...extra })
    owner.options?.forEach((o, oi) => {
      if (o.formula !== undefined) formulas.push({ path: `${path}.options[${oi}].formula`, key, text: o.formula, locals, ...extra })
    })
  }
  sheet.categories.forEach((category, ci) =>
    category.sections.forEach((section, si) =>
      section.items.forEach((item, ii) => {
        const ipath = `categories[${ci}].sections[${si}].items[${ii}]`
        globalKeys.push(item.key)
        if (item.kind === 'field') {
          formulasOf(ipath, item.key, item, [])
          if (item.calc) calcs.push({ path: `${ipath}.calc`, key: item.key, calc: item.calc })
          return
        }
        tableKeys.add(item.key)
        if (item.type === 'stat') {
          item.rows.forEach((row, ri) => {
            globalKeys.push(row.key)
            statRows.add(row.key)
            formulas.push({ path: `categories[${ci}].sections[${si}].items[${ii}].rows[${ri}].modifier`, key: `${row.key}.modificador`, text: row.modifier, locals: ['valor'] })
          })
        } else if (item.type === 'capacidades') {
          const hasFormula = new Map(item.columns.map((c) => [c.key, c.formula !== undefined || (c.options?.some((o) => o.formula !== undefined) ?? false)]))
          for (const row of item.rows) {
            globalKeys.push(row.key)
            capColumns.set(row.key, hasFormula)
          }
          const locals = [...item.columns.map((c) => c.key), 'valor', 'modificador']
          item.columns.forEach((column, ci2) => formulasOf(`${ipath}.columns[${ci2}]`, `col:${item.key}.${column.key}`, column, locals))
        } else if (item.type === 'habilidad' || item.type === 'libre') {
          const locals = item.columns.map((c) => c.key)
          item.columns.forEach((column, ci2) => formulasOf(`${ipath}.columns[${ci2}]`, `col:${item.key}.${column.key}`, column, locals, item.key))
          tableColumns.set(item.key, new Set(locals))
        } else if (item.type === 'monedas') {
          for (const row of item.rows) globalKeys.push(row.key)
          tableColumns.set(item.key, new Set(['key', 'label', 'value']))
        }
      }),
    ),
  )
  return { formulas, calcs, globalKeys, statRows, capColumns, tableColumns, tableKeys }
}

/** A number unless some option gives a text or has no formula of its own (then the choice shows as text). */
function optionsKind(options: OptionDef[] | undefined): ScopeKind {
  if (!options || options.length === 0) return 'text'
  for (const option of options) {
    const parsed = option.formula === undefined ? null : parseFormula(option.formula)
    if (!parsed?.ok || usesTextOrTables(parsed.ast)) return 'text'
  }
  return 'number'
}

const kindOf = (item: { type: string; options?: OptionDef[] }): ScopeKind =>
  item.type === 'number' ? 'number' : item.type === 'boolean' ? 'boolean' : item.type === 'options' ? optionsKind(item.options) : 'text'

/** The graph node of a context, and the local names it may use (as entries; a column does not list itself). */
function placeOf(sheet: Sheet, context: FormulaContext): { node: string; locals: ScopeEntry[] } | null {
  for (const category of sheet.categories) {
    for (const section of category.sections) {
      for (const item of section.items) {
        if (context.kind === 'field' && item.kind === 'field' && item.key === context.key) return { node: item.key, locals: [] }
        if (item.kind !== 'table') continue
        if (context.kind === 'stat' && item.type === 'stat' && item.rows.some((r) => r.key === context.row)) {
          return { node: `${context.row}.modificador`, locals: [{ ref: 'valor', label: 'Valor', group: 'locales', kind: 'number' }] }
        }
        if (context.kind !== 'column' || item.key !== context.table) continue
        if (item.type !== 'capacidades' && item.type !== 'habilidad' && item.type !== 'libre') continue
        if (!item.columns.some((c) => c.key === context.column)) continue
        const columns = item.columns.filter((c: Column) => c.key !== context.column).map((c): ScopeEntry => ({ ref: c.key, label: c.label, group: 'locales', kind: kindOf(c) }))
        const own: ScopeEntry[] =
          item.type === 'capacidades'
            ? [
                { ref: 'valor', label: 'Valor', group: 'locales', kind: 'number' },
                { ref: 'modificador', label: 'Modificador', group: 'locales', kind: 'number' },
              ]
            : []
        return { node: `col:${item.key}.${context.column}`, locals: [...columns, ...own] }
      }
    }
  }
  return null
}

/**
 * The references valid in `context`, grouped in the order Campos, Atributos, Capacidades, Locales, Tablas. A table is `tableOnly`
 * (a table function reads it; the column names go in quotes). What a formula there cannot read is not listed: itself, and any
 * formula that reads it, however many steps away (it would be a cycle).
 */
export function referenceScope(sheet: Sheet, context: FormulaContext): ScopeEntry[] {
  const place = placeOf(sheet, context)
  if (!place) return []
  const facts = formulaFactsOf(sheet)
  const edges = analyzeFormulas(facts, () => {})
  const known = knownReferences(facts)

  const reaches = new Map<string, boolean>()
  const readsContext = (node: string, seen = new Set<string>()): boolean => {
    if (node === place.node) return true
    const cached = reaches.get(node)
    if (cached !== undefined) return cached
    if (seen.has(node)) return false
    seen.add(node)
    const found = (edges.get(node) ?? []).some((dep) => readsContext(dep, seen))
    if (seen.size === 1) reaches.set(node, found)
    return found
  }
  const ok = (ref: string, entry: Pick<FormulaEntry, 'locals' | 'table'>) => !readsContext(formulaNode(entry, ref))

  const fields: ScopeEntry[] = []
  const stats: ScopeEntry[] = []
  const capacidades: ScopeEntry[] = []
  const tables: ScopeEntry[] = []
  const add = (list: ScopeEntry[], entry: ScopeEntry) => {
    if (known.has(entry.ref) && ok(entry.ref, { locals: [] })) list.push(entry)
  }
  add(fields, { ref: 'nivel', label: 'Nivel', group: 'campos', kind: 'number' })
  for (const category of sheet.categories) {
    for (const section of category.sections) {
      for (const item of section.items) {
        if (item.kind === 'field') add(fields, { ref: item.key, label: item.label, group: 'campos', kind: kindOf(item) })
        else if (item.type === 'stat') {
          for (const row of item.rows) {
            add(stats, { ref: `${row.key}.valor`, label: `${row.label} (valor)`, group: 'atributos', kind: 'number' })
            add(stats, { ref: `${row.key}.modificador`, label: `${row.label} (modificador)`, group: 'atributos', kind: 'number' })
          }
        } else if (item.type === 'capacidades') {
          for (const row of item.rows) {
            for (const column of item.columns) add(capacidades, { ref: `${row.key}.${column.key}`, label: `${row.label} · ${column.label}`, group: 'capacidades', kind: kindOf(column) })
          }
        } else if (facts.tableColumns.has(item.key)) {
          tables.push({ ref: item.key, label: item.label, group: 'tablas', kind: 'table', tableOnly: true })
        }
      }
    }
  }
  return [...fields, ...stats, ...capacidades, ...place.locals, ...tables]
}

export interface FormulaUser {
  /** Where the user is written: a field (also a calculation), a stat row modifier or a table column. */
  context: FormulaContext
  /** Spanish name: "Iniciativa", "Fuerza (modificador)", "Equipo › Total". */
  label: string
  /** The path of the formula (or `.calc`) in the sheet, the first one when a field or column has one per option. */
  path: string
}

/**
 * Who reads `name` ("Lo usan"): a field or table key, a stat row key (its valor and modificador), `table.column` (a table function
 * naming that column, a calculation over it, a sibling column formula using it as a local) or a table key (any table function over it).
 * Formulas in sheet order, then calculations; a field or column with one formula per option counts once.
 */
export function formulaUsers(sheet: Sheet, name: string): FormulaUser[] {
  const facts = formulaFactsOf(sheet)
  const labels = nodeLabels(sheet.categories)
  const [tableName, columnName] = name.split('.')
  const isColumn = name.includes('.') && facts.tableColumns.has(tableName)
  const found = new Map<string, FormulaUser>()
  const note = (node: string, path: string) => {
    if (found.has(node)) return
    const column = /^col:([^.]+)\.(.+)$/.exec(node)
    const row = node.endsWith('.modificador') ? node.slice(0, -'.modificador'.length) : null
    const context: FormulaContext = column
      ? { kind: 'column', table: column[1], column: column[2] }
      : row !== null && facts.statRows.has(row)
        ? { kind: 'stat', row }
        : { kind: 'field', key: node }
    found.set(node, { context, label: labels.get(node) ?? node, path })
  }
  for (const f of facts.formulas) {
    const parsed = parseFormula(f.text)
    if (!parsed.ok) continue
    const uses = formulaUses(parsed.ast)
    const plain = uses.plain.some((ref) => {
      if (f.locals.includes(ref)) return isColumn && f.table === tableName && ref === columnName
      return !isColumn && (ref === name || ref.startsWith(`${name}.`))
    })
    const viaTable = uses.tables.some(({ table, columns }) => (isColumn ? table === tableName && columns.includes(columnName) : table === name))
    if (plain || viaTable) note(f.key, f.path)
  }
  for (const { path, key: node, calc } of facts.calcs) {
    if (isColumn ? calc.table === tableName && calc.column === columnName : calc.table === name) note(node, path)
  }
  return [...found.values()]
}

