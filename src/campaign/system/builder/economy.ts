/**
 * The economy of a sheet (S8): the coin table (denominations) and the economy tables (amounts per denomination). Economy is
 * CONFIGURED in Sistema (denominations, instances) and Juegos (reward destination); the sheet builder only places and displays the
 * tables. Both editors keep a draft of the whole sheet, so a write must never carry the other side's stale half:
 *
 *   - builder save   -> placement (where each table sits, blocks, card, roles) from the builder draft, the economy parts from the latest;
 *   - Sistema save   -> the economy parts from the Sistema draft, placement from the latest;
 *   - the reward destination always comes from the latest stored sheet (only Juegos changes it).
 *
 * The stored document shape does not change: these are pure functions over the same plain JSON the builder edits.
 */
import type { SheetError } from '../sheet/sheetModel'
import { getAt, isNode, parsePath, setAt, type Node, type Path } from './draft'
import { dropReferences } from './removal'

const nodes = (value: unknown): Node[] => (Array.isArray(value) ? value.filter(isNode) : [])
const text = (value: unknown): string => (typeof value === 'string' ? value : '')

export const isEconomyItem = (item: unknown): item is Node => isNode(item) && item.kind === 'table' && (item.type === 'monedas' || item.type === 'economia')

export interface EconomyItem {
  item: Node
  /** Path of the item inside the sheet. */
  path: Path
  category: Node
  section: Node
}

/** Every coin and economy table of the sheet, in sheet order, with the category and section that hold it. */
export function economyItems(sheet: Node | null | undefined): EconomyItem[] {
  if (!sheet) return []
  const found: EconomyItem[] = []
  nodes(sheet.categories).forEach((category, ci) =>
    nodes(category.sections).forEach((section, si) =>
      (Array.isArray(section.items) ? section.items : []).forEach((item: unknown, ii: number) => {
        if (isEconomyItem(item)) found.push({ item, path: ['categories', ci, 'sections', si, 'items', ii], category, section })
      }),
    ),
  )
  return found
}

/** The key of the table marked as the reward destination, or null. */
export const rewardKey = (sheet: Node | null | undefined): string | null => {
  const marked = economyItems(sheet).find((e) => e.item.rewardDestination === true)
  return marked ? text(marked.item.key) : null
}

/** The sheet with exactly one table (`key`) marked as the reward destination, or none (`null`). Untouched tables keep their bytes. */
export function setRewardByKey(sheet: Node, key: string | null): Node {
  let next = sheet
  for (const { item, path } of economyItems(sheet)) {
    const want = key !== null && item.key === key
    if (want && item.rewardDestination === true) continue
    if (!want && item.rewardDestination === undefined) continue
    const rest = Object.fromEntries(Object.entries(item).filter(([name]) => name !== 'rewardDestination'))
    next = setAt(next, path, want ? { ...rest, rewardDestination: true } : rest)
  }
  return next
}

const isEconomyDiscarded = (entry: Node): boolean => isEconomyItem(entry.item)

/** What Sistema owns of a sheet: denominations, instances (name, key, type) and the discarded economy tables. For key and dirty comparisons. */
export function economyProjection(sheet: Node | null | undefined): Node {
  return {
    instances: economyItems(sheet).map(({ item }) => ({
      key: item.key,
      type: item.type,
      label: item.label,
      ...(item.type === 'monedas' ? { rows: nodes(item.rows).map((r) => ({ key: r.key, label: r.label, value: r.value })) } : {}),
    })),
    discarded: nodes(sheet?.discarded).filter(isEconomyDiscarded),
  }
}

/** The sheet without the economy tables, their discarded entries and what refers to them: what the builder owns. For the builder's remount key. */
export function placementProjection(sheet: Node | null | undefined): Node | null {
  if (!sheet) return null
  const keys = new Set<string>([...economyItems(sheet).map((e) => text(e.item.key)), ...nodes(sheet.discarded).filter(isEconomyDiscarded).map((e) => text((e.item as Node).key))])
  const stripped: Node = {
    ...sheet,
    categories: nodes(sheet.categories).map((category) => ({
      ...category,
      sections: nodes(category.sections).map((section) => ({ ...section, items: (Array.isArray(section.items) ? section.items : []).filter((item: unknown) => !isEconomyItem(item)) })),
    })),
  }
  if (Array.isArray(sheet.discarded)) {
    const kept = nodes(sheet.discarded).filter((e) => !isEconomyDiscarded(e))
    if (kept.length > 0) stripped.discarded = kept
    else delete stripped.discarded
  }
  return dropReferences(stripped, keys)
}

/** True when the section or category (or the item) is, or holds, an economy table: removing it would delete an instance from the builder. */
export function holdsEconomy(node: Node): boolean {
  const itself: boolean = isEconomyItem(node)
  return itself || nodes(node.sections).some(holdsEconomy) || nodes(node.items).some(holdsEconomy)
}

/** A copy without the editor-only properties (`_new`, `_open`...) at any depth; unlike discarded's clean it keeps the rows added in this session. */
function stripEditorProps<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripEditorProps) as T
  if (isNode(value)) return Object.fromEntries(Object.entries(value).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, stripEditorProps(v)])) as T
  return value
}

export interface MergeInput {
  /** The sheet whose placement is kept (its blocks, card, roles, order and sections). */
  placement: Node
  /** The sheet whose economy parts are written (denominations, instances, discarded economy tables). */
  economy: Node
  /** The sheet `economy` started from: an economy table it has and `economy` no longer has was deleted there; one it never had was made elsewhere. */
  base: Node | null
  /** The freshest stored sheet: the only authority for the reward destination. */
  latest: Node | null
}

export interface MergeResult {
  sheet: Node
  /** Why the merge must not be written (Spanish), or null. */
  blocked: string | null
}

/**
 * `placement` with its economy parts replaced by those of `economy` (see the file header for the two directions). A table that
 * `economy` created is placed in the section it names (the first section when that one is gone); one that `economy` deleted
 * is dropped together with the blocks, card pins and roles that referred to it; the rest of the economy tables are replaced in
 * place, so their position stays the placement owner's.
 */
export function mergeEconomy({ placement, economy, base, latest }: MergeInput): MergeResult {
  const source = new Map(economyItems(economy).map((e) => [text(e.item.key), e]))
  const baseKeys = new Set(economyItems(base).map((e) => text(e.item.key)))
  const destination = rewardKey(latest)
  const gone = new Set<string>()
  const placed = new Set<string>()
  let blocked: string | null = null

  const categories: Node[] = nodes(placement.categories).map((category) => ({
    ...category,
    sections: nodes(category.sections).map((section) => ({
      ...section,
      items: (Array.isArray(section.items) ? section.items : []).flatMap((item: unknown) => {
        if (!isEconomyItem(item)) return [item]
        const key = text(item.key)
        const from = source.get(key)
        if (from) {
          placed.add(key)
          return [stripEditorProps(from.item)]
        }
        if (baseKeys.has(key)) {
          gone.add(key)
          if (key === destination) blocked = `«${text(item.label) || key}» pasó a ser el destino de recompensa mientras editabas. Elegí otro en Juegos antes de eliminarla.`
          return []
        }
        placed.add(key)
        return [item]
      }),
    })),
  }))

  // tables the economy owner created: into the section they name, else the first one
  const fresh = [...source.entries()].filter(([key]) => !placed.has(key))
  if (fresh.length > 0) {
    const allSections = categories.flatMap((c) => nodes(c.sections).map((s) => ({ s })))
    for (const [, from] of fresh) {
      const target = allSections.find(({ s }) => s.key === from.section.key) ?? allSections[0]
      if (!target) {
        blocked ??= 'La plantilla no tiene secciones donde ubicar la instancia.'
        continue
      }
      target.s.items = [...(target.s.items as unknown[]), stripEditorProps(from.item)]
    }
  }

  let sheet: Node = { ...placement, categories }
  if (gone.size > 0) sheet = dropReferences(sheet, gone)

  // the reward destination is the latest stored one, whoever wrote the table
  for (const { item, path } of economyItems(sheet)) {
    const want = text(item.key) === destination
    if (want && item.rewardDestination === true) continue
    if (!want && item.rewardDestination === undefined) continue
    if (!want && item.rewardDestination === false) continue
    const rest = Object.fromEntries(Object.entries(item).filter(([name]) => name !== 'rewardDestination'))
    sheet = setAt(sheet, path, want ? { ...rest, rewardDestination: true } : rest)
  }

  // discarded: the economy tables' entries come from the economy owner, in the placement's order; the rest stay the placement's
  if (placement.discarded !== undefined || economy.discarded !== undefined) {
    const theirs = nodes(economy.discarded).filter(isEconomyDiscarded)
    const live = new Set(economyItems(sheet).map((e) => text(e.item.key)))
    const wanted = theirs.filter((e) => !live.has(text((e.item as Node).key)))
    const used = new Set<string>()
    const merged: Node[] = []
    for (const entry of nodes(placement.discarded)) {
      if (!isEconomyDiscarded(entry)) {
        merged.push(entry)
        continue
      }
      const key = text((entry.item as Node).key)
      const replacement = wanted.find((e) => text((e.item as Node).key) === key)
      if (replacement) {
        merged.push(replacement)
        used.add(key)
      }
    }
    for (const entry of wanted) if (!used.has(text((entry.item as Node).key))) merged.push(entry)
    if (merged.length > 0) sheet = { ...sheet, discarded: merged }
    else {
      const { discarded: _drop, ...rest } = sheet
      void _drop
      sheet = rest
    }
  }
  return { sheet, blocked }
}

/** The validation errors of a sheet that belong to coin and economy tables (including the rules about having a coin table). */
export function economyErrors(sheet: Node, errors: readonly SheetError[]): SheetError[] {
  return errors.filter((error) => {
    const path = parsePath(error.path)
    const at = path.indexOf('items')
    if (at >= 0 && typeof path[at + 1] === 'number') return isEconomyItem(getAt(sheet, path.slice(0, at + 2)))
    return path.length === 1 && path[0] === 'categories' && /coin table|economy table/.test(error.message)
  })
}
