/**
 * Turns a sheet definition plus one character into what the detail view draws (odd/design/sheet-builder.md, section 2):
 * typed values, formulas already evaluated, tables passed through, empty things marked. Pure and total: a value of the
 * wrong type counts as missing, a formula that cannot be computed is an `error` result, and a cycle of formulas ends in
 * errors instead of a stack overflow. Nothing here ever throws on character data.
 *
 * Where a value lives in the character (flattened `data` plus the promoted columns), see sheetAccess.ts:
 *  field `pj[key]` | Stat row `pj[row]` | Capacidades first column `pj[row]`, others `pj[row__col]` |
 *  Habilidad / Libre `pj[table]` (array of rows) | coins `pj.monedas` and `pj.monedas_guardado` keyed by denomination.
 *
 * Formula scope, in order: the names local to a row ({valor} in a Stat modifier; the row's columns plus {valor} and
 * {modificador} of the linked stat in a Capacidades column), then the sheet: {nivel}, a field, a Stat or Capacidades row,
 * and {row.valor} {row.modificador} {row.column}.
 */
import { evaluateFormula, parseFormula, type FormulaNode } from '../formula/formula'
import type { CapacidadRow, Column, Field, FieldType, NumberFormat, Sheet, StatRow, Table } from './sheetModel'

export type Scalar = number | boolean | string | null

export interface Cell {
  key: string
  label: string
  type: FieldType
  format?: NumberFormat
  value: Scalar
  text: string
  error: boolean
}

export interface CoinAmount {
  key: string
  label: string
  amount: number
}

export type ResolvedItem =
  | { kind: 'field'; key: string; label: string; type: FieldType; format?: NumberFormat; value: Scalar; text: string; error: boolean; empty: boolean }
  | { kind: 'stat'; key: string; label: string; rows: { key: string; label: string; value: number | null; valueText: string; modifier: number | null; modifierText: string }[]; empty: false }
  | { kind: 'capacidades'; key: string; label: string; columns: Column[]; rows: { key: string; label: string; stat: string; statLabel: string; statModifierText: string; linked: number | null; cells: Cell[] }[]; empty: false }
  | { kind: 'rows'; key: string; label: string; tableType: 'libre' | 'habilidad'; columns: Column[]; rows: Record<string, unknown>[]; empty: boolean }
  | { kind: 'coins'; key: string; label: string; denominations: { key: string; label: string; value: number }[]; carried: CoinAmount[]; stored: CoinAmount[]; carriedTotal: number; storedTotal: number; empty: boolean }

export interface ResolvedBlock {
  key: string
  title?: string
  mode: 'stat' | 'tile' | 'capacidades' | 'plano' | 'modal'
  items: ResolvedItem[]
  /** Modal blocks: the rows of the habilidad table grouped by the categories the block names, in that order. */
  groups?: { category: string; rows: Record<string, unknown>[] }[]
  empty: boolean
}

export interface ResolvedSection {
  key: string
  label: string
  /** Label of the category (editor tab) the section belongs to. */
  category: string
  blocks: ResolvedBlock[]
  empty: boolean
}

export interface ResolvedSheet {
  sections: ResolvedSection[]
}

type Num = number | null
interface Computed {
  value: Scalar
  error: boolean
}

const own = (record: Record<string, unknown>, key: string): unknown => (Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined)
const finiteNumber = (value: unknown): Num => (typeof value === 'number' && Number.isFinite(value) ? value : null)

export function formatNumber(value: number, format?: NumberFormat): string {
  const rounded = Math.round(value * 100) / 100
  const text = String(rounded)
  return format === 'signed' && rounded >= 0 ? `+${text}` : text
}

const textOf = (value: Scalar, format?: NumberFormat): string => (typeof value === 'number' ? formatNumber(value, format) : typeof value === 'string' ? value : '')

const asRecords = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null && !Array.isArray(row)) : []

export function resolveSheet(sheet: Sheet, pj: Record<string, unknown>): ResolvedSheet {
  const fields = new Map<string, Field>()
  const statRows = new Map<string, StatRow>()
  const capRows = new Map<string, { table: Extract<Table, { type: 'capacidades' }>; row: CapacidadRow }>()
  for (const category of sheet.categories) {
    for (const section of category.sections) {
      for (const item of section.items) {
        if (item.kind === 'field') fields.set(item.key, item)
        else if (item.type === 'stat') for (const row of item.rows) statRows.set(row.key, row)
        else if (item.type === 'capacidades') for (const row of item.rows) capRows.set(row.key, { table: item, row })
      }
    }
  }

  const asts = new Map<string, FormulaNode | null>()
  const ast = (text: string): FormulaNode | null => {
    if (!asts.has(text)) {
      const parsed = parseFormula(text)
      asts.set(text, parsed.ok ? parsed.ast : null)
    }
    return asts.get(text) ?? null
  }

  const memo = new Map<string, Computed>()
  const visiting = new Set<string>()
  /** Memoised evaluation with re-entry detection: a value that depends on itself is an error, not a loop. */
  const once = (id: string, compute: () => Computed): Computed => {
    const known = memo.get(id)
    if (known) return known
    if (visiting.has(id)) return { value: null, error: true }
    visiting.add(id)
    try {
      const result = compute()
      memo.set(id, result)
      return result
    } finally {
      visiting.delete(id)
    }
  }

  const evaluate = (text: string, local: (ref: string) => unknown): Computed => {
    const tree = ast(text)
    if (!tree) return { value: null, error: true }
    const result = evaluateFormula(tree, (ref) => {
      const near = local(ref)
      return near !== undefined ? near : globalRef(ref)
    })
    return result.ok ? { value: result.value, error: false } : { value: null, error: true }
  }

  const typed = (raw: unknown, type: FieldType): Scalar => {
    if (type === 'number') return finiteNumber(raw)
    if (type === 'boolean') return typeof raw === 'boolean' ? raw : null
    return typeof raw === 'string' && raw !== '' ? raw : null
  }

  const fieldValue = (field: Field): Computed =>
    once(`f:${field.key}`, () => {
      const stored = typed(own(pj, field.key), field.type)
      if (field.formula === undefined) return { value: stored ?? (field.default ?? null), error: false }
      if (field.overridable && stored !== null) return { value: stored, error: false }
      const result = evaluate(field.formula, () => undefined)
      if (result.error || field.type !== 'boolean') return result
      return { value: result.value !== 0, error: false }
    })

  const statValue = (row: StatRow): Num => finiteNumber(own(pj, row.key))
  const statModifier = (row: StatRow): Computed =>
    once(`m:${row.key}`, () => {
      const value = statValue(row)
      if (value === null) return { value: null, error: false }
      return evaluate(row.modifier, (ref) => (ref === 'valor' ? value : undefined))
    })

  const cellKey = (rowKey: string, index: number, column: Column) => (index === 0 ? rowKey : `${rowKey}__${column.key}`)
  const cellValue = (table: Extract<Table, { type: 'capacidades' }>, row: CapacidadRow, index: number): Computed => {
    const column = table.columns[index]
    return once(`c:${row.key}.${column.key}`, () => {
      if (column.formula === undefined) return { value: typed(own(pj, cellKey(row.key, index, column)), column.type), error: false }
      const stat = statRows.get(row.stat)
      const local = (ref: string): unknown => {
        if (ref === 'valor') return stat ? statValue(stat) ?? undefined : undefined
        if (ref === 'modificador') return stat ? (statModifier(stat).value ?? undefined) : undefined
        const at = table.columns.findIndex((c) => c.key === ref)
        return at >= 0 ? (cellValue(table, row, at).value ?? undefined) : undefined
      }
      const result = evaluate(column.formula, local)
      if (result.error || column.type !== 'boolean') return result
      return { value: result.value !== 0, error: false }
    })
  }

  function globalRef(ref: string): unknown {
    if (ref === 'nivel') return finiteNumber(own(pj, 'nivel')) ?? undefined
    const dot = ref.indexOf('.')
    if (dot > 0) {
      const rowKey = ref.slice(0, dot)
      const part = ref.slice(dot + 1)
      const stat = statRows.get(rowKey)
      if (stat) {
        if (part === 'valor') return statValue(stat) ?? undefined
        if (part === 'modificador') return statModifier(stat).value ?? undefined
        return undefined
      }
      const cap = capRows.get(rowKey)
      const at = cap ? cap.table.columns.findIndex((c) => c.key === part) : -1
      return cap && at >= 0 ? (cellValue(cap.table, cap.row, at).value ?? undefined) : undefined
    }
    const field = fields.get(ref)
    if (field) return fieldValue(field).value ?? undefined
    const stat = statRows.get(ref)
    if (stat) return statValue(stat) ?? undefined
    const cap = capRows.get(ref)
    if (cap && cap.table.columns.length > 0) return cellValue(cap.table, cap.row, 0).value ?? undefined
    return undefined
  }

  const cell = (table: Extract<Table, { type: 'capacidades' }>, row: CapacidadRow, index: number): Cell => {
    const column = table.columns[index]
    const computed = cellValue(table, row, index)
    return { key: column.key, label: column.label, type: column.type, ...(column.format ? { format: column.format } : {}), value: computed.value, text: textOf(computed.value, column.format), error: computed.error }
  }

  const coinList = (raw: unknown, denominations: { key: string; label: string; value: number }[]): CoinAmount[] => {
    const held = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
    const out: CoinAmount[] = []
    for (const d of denominations) {
      const amount = own(held, d.key)
      if (typeof amount === 'number' && Number.isInteger(amount) && amount > 0) out.push({ key: d.key, label: d.label, amount })
    }
    return out
  }
  const baseTotal = (list: CoinAmount[], denominations: { key: string; value: number }[]) =>
    list.reduce((sum, c) => sum + c.amount * (denominations.find((d) => d.key === c.key)?.value ?? 0), 0)

  const resolveItem = (item: Field | Table): ResolvedItem => {
    if (item.kind === 'field') {
      const computed = fieldValue(item)
      const empty = item.formula === undefined && (computed.value === null || computed.value === '')
      return { kind: 'field', key: item.key, label: item.label, type: item.type, ...(item.format ? { format: item.format } : {}), value: computed.value, text: textOf(computed.value, item.format), error: computed.error, empty }
    }
    if (item.type === 'stat') {
      return {
        kind: 'stat',
        key: item.key,
        label: item.label,
        empty: false,
        rows: item.rows.map((row) => {
          const value = statValue(row)
          const modifier = finiteNumber(statModifier(row).value)
          return { key: row.key, label: row.label, value, valueText: value === null ? '' : formatNumber(value), modifier, modifierText: modifier === null ? '' : formatNumber(modifier, 'signed') }
        }),
      }
    }
    if (item.type === 'capacidades') {
      return {
        kind: 'capacidades',
        key: item.key,
        label: item.label,
        columns: item.columns,
        empty: false,
        rows: item.rows.map((row) => {
          const stat = statRows.get(row.stat)
          const modifier = stat ? finiteNumber(statModifier(stat).value) : null
          const linked = stat ? (row.use === 'valor' ? statValue(stat) : modifier) : null
          return {
            key: row.key,
            label: row.label,
            stat: row.stat,
            statLabel: stat?.label ?? '',
            statModifierText: modifier === null ? '' : formatNumber(modifier, 'signed'),
            linked,
            cells: item.columns.map((_, index) => cell(item, row, index)),
          }
        }),
      }
    }
    if (item.type === 'monedas') {
      const denominations = [...item.rows].sort((a, b) => b.value - a.value).map((r) => ({ key: r.key, label: r.label, value: r.value }))
      const carried = coinList(own(pj, 'monedas'), denominations)
      const stored = coinList(own(pj, 'monedas_guardado'), denominations)
      return { kind: 'coins', key: item.key, label: item.label, denominations, carried, stored, carriedTotal: baseTotal(carried, denominations), storedTotal: baseTotal(stored, denominations), empty: carried.length === 0 && stored.length === 0 }
    }
    const rows = asRecords(own(pj, item.key))
    return { kind: 'rows', key: item.key, label: item.label, tableType: item.type, columns: item.columns, rows, empty: rows.length === 0 }
  }

  const sections: ResolvedSection[] = []
  for (const category of sheet.categories) {
    for (const section of category.sections) {
      const byKey = new Map(section.items.map((item) => [item.key, item]))
      const blocks: ResolvedBlock[] = section.blocks.map((block) => {
        const resolved = block.items.flatMap((key) => {
          const item = byKey.get(key)
          return item ? [resolveItem(item)] : []
        })
        const base = { key: block.key, ...(block.title ? { title: block.title } : {}), mode: block.mode, items: resolved }
        if (block.mode !== 'modal') return { ...base, empty: resolved.every((i) => i.empty) }
        const table = resolved.find((i): i is Extract<ResolvedItem, { kind: 'rows' }> => i.kind === 'rows')
        const groups = (block.filterCategories ?? [])
          .map((name) => ({ category: name, rows: (table?.rows ?? []).filter((row) => row.categoria === name) }))
          .filter((group) => group.rows.length > 0)
        return { ...base, groups, empty: groups.length === 0 }
      })
      sections.push({ key: section.key, label: section.label, category: category.label, blocks, empty: blocks.every((b) => b.empty) })
    }
  }
  return { sections }
}
