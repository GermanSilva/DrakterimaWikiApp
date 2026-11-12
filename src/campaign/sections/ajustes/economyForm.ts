/**
 * Sistema › Economía, the draft side (S8, S12, S14, S28). The draft is the sheet document itself, edited with the same pure
 * helpers the sheet builder uses (keys follow the name while new and are fixed once saved; removal goes through the discarded-fields
 * path of removal.ts), so a denomination or an instance behaves exactly like it did in the builder.
 */
import { appendAt, getAt, isNode, keySpaces, moveIn, slugKey, updateAt, type Node, type Path } from '../../system/builder/draft'
import { economyItems, type EconomyItem } from '../../system/builder/economy'
import { newCoinRow, newTable, renameNode, setKey } from '../../system/builder/factories'
import { SHEET_LIMITS } from '../../system/sheet/sheetModel'

const nodes = (value: unknown): Node[] => (Array.isArray(value) ? value.filter(isNode) : [])
const text = (value: unknown): string => (typeof value === 'string' ? value : '')

export const DENOMINATION_LIMIT = SHEET_LIMITS.denominations

/** The coin table (the one that defines the denominations), or undefined when the sheet has none. */
export const coinTable = (sheet: Node | null): EconomyItem | undefined => economyItems(sheet).find((e) => e.item.type === 'monedas')

export const denominations = (sheet: Node | null): Node[] => nodes(coinTable(sheet)?.item.rows)

const numberOf = (row: Node): number | null => (typeof row.value === 'number' && Number.isFinite(row.value) && row.value > 0 ? row.value : null)

const compact = (n: number): string => String(Number(n.toFixed(2)))

/** "1 oro = 10 plata = 100 bronce": the largest denomination against each of the others, from the values. Null with fewer than two valid ones. */
export function coinSummary(rows: readonly Node[]): string | null {
  const valid = rows.filter((r) => numberOf(r) !== null).sort((a, b) => (numberOf(b) as number) - (numberOf(a) as number))
  if (valid.length < 2) return null
  const name = (r: Node) => text(r.label).trim() || text(r.key)
  const top = numberOf(valid[0]) as number
  return [`1 ${name(valid[0])}`, ...valid.slice(1).map((r) => `${compact(top / (numberOf(r) as number))} ${name(r)}`)].join(' = ')
}

/** "100 bronce": what a denomination is worth in the base one (the smallest, worth 1). */
export function equivalence(rows: readonly Node[], row: Node): string {
  const value = numberOf(row)
  if (value === null) return '—'
  const base = [...rows].filter((r) => numberOf(r) !== null).sort((a, b) => (numberOf(a) as number) - (numberOf(b) as number))[0]
  return `${compact(value)} ${base ? text(base.label).trim() || text(base.key) : ''}`.trim()
}

const rowsPath = (sheet: Node): Path | null => {
  const coin = coinTable(sheet)
  return coin ? [...coin.path, 'rows'] : null
}

export function addDenomination(sheet: Node): Node {
  const path = rowsPath(sheet)
  return path ? appendAt(sheet, path, newCoinRow(sheet, getAt(sheet, path))) : sheet
}

const at = (sheet: Node, index: number): Path | null => {
  const path = rowsPath(sheet)
  return path ? [...path, index] : null
}

export function renameDenomination(sheet: Node, index: number, label: string): Node {
  const path = at(sheet, index)
  return path ? renameNode(sheet, path, 'label', label, 'global') : sheet
}

export function setDenominationKey(sheet: Node, index: number, key: string): Node {
  const path = at(sheet, index)
  return path ? setKey(sheet, path, key) : sheet
}

/** A whole number stays a number; anything else is kept as typed so the validator reports it next to the field. */
export function setDenominationValue(sheet: Node, index: number, raw: string): Node {
  const path = at(sheet, index)
  if (!path) return sheet
  const trimmed = raw.trim()
  return updateAt(sheet, path, (row) => ({ ...(isNode(row) ? row : {}), value: /^\d{1,12}$/.test(trimmed) ? Number(trimmed) : raw }))
}

export function moveDenomination(sheet: Node, index: number, delta: -1 | 1): Node {
  const path = rowsPath(sheet)
  return path ? moveIn(sheet, path, index, delta) : sheet
}

export interface SectionChoice {
  key: string
  label: string
  /** The category and the section by their names: "General › Equipo". */
  where: string
  path: Path
}

export function sectionChoices(sheet: Node | null): SectionChoice[] {
  if (!sheet) return []
  return nodes(sheet.categories).flatMap((category, ci) =>
    nodes(category.sections).map((section, si) => ({
      key: text(section.key),
      label: text(section.label),
      where: `${text(category.label)} › ${text(section.label)}`,
      path: ['categories', ci, 'sections', si] as Path,
    })),
  )
}

/** The section a new instance defaults to: the one holding the coin table, else the first. */
export const defaultSection = (sheet: Node | null): string => coinTable(sheet)?.section.key ? text(coinTable(sheet)?.section.key) : (sectionChoices(sheet)[0]?.key ?? '')

/**
 * A new instance in the section `sectionKey`. The first one of a sheet is its coin table (the one that defines the denominations);
 * the next ones are economy tables, which hold amounts per denomination.
 */
export function addInstance(sheet: Node, name: string, sectionKey: string): Node {
  const choices = sectionChoices(sheet)
  const target = choices.find((c) => c.key === sectionKey) ?? choices[0]
  if (!target) return sheet
  const { _open: _drop, ...table } = newTable(sheet, coinTable(sheet) ? 'economia' : 'monedas')
  void _drop
  return appendAt(sheet, [...target.path, 'items'], { ...table, label: name, key: slugKey(name, keySpaces(sheet).global, true) })
}

export const renameInstance = (sheet: Node, path: Path, label: string): Node => renameNode(sheet, path, 'label', label, 'global')
export const setInstanceKey = (sheet: Node, path: Path, key: string): Node => setKey(sheet, path, key)
