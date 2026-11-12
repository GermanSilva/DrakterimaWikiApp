/**
 * The one place a part of the sheet is removed. A part that may hold character data is confirmed first: the data stays in the
 * characters but stops being shown, and the removed definition moves to the discarded list (G7b, S26; see discard.ts) so the DM can
 * review it, restore it or delete it for good.
 */
import { discardedDataKeys } from '../sheet/discarded'
import type { DiscardedItem } from '../sheet/sheetModel'
import { addDiscarded, discardedBy, discardedEntries } from './discard'
import { getAt, isNode, removeFrom, setAt, type Node, type Path } from './draft'

export type RemovalKind = 'category' | 'section' | 'item' | 'block' | 'row' | 'column' | 'option' | 'actionCategory'

const NOUN: Record<RemovalKind, string> = {
  category: 'la categoría',
  section: 'la sección',
  item: 'el ítem',
  block: 'el bloque',
  row: 'la fila',
  column: 'la columna',
  option: 'la opción',
  actionCategory: 'la categoría de acciones',
}

export function kindOf(list: Path): RemovalKind {
  switch (list[list.length - 1]) {
    case 'sections':
      return 'section'
    case 'items':
      return 'item'
    case 'blocks':
      return 'block'
    case 'rows':
      return 'row'
    case 'columns':
      return 'column'
    case 'options':
      return 'option'
    default:
      return list.length > 1 ? 'actionCategory' : 'category'
  }
}

const nodes = (value: unknown): Node[] => (Array.isArray(value) ? value.filter(isNode) : [])
const storedItems = (section: Node): boolean => nodes(section.items).some((item) => item._new !== true)

/** True when the part, or something inside it, was already saved and so may hold data in the characters. */
export function holdsData(kind: RemovalKind, node: Node): boolean {
  if (kind === 'category') return nodes(node.sections).some(storedItems)
  if (kind === 'section') return storedItems(node)
  if (kind === 'block') return false
  return node._new !== true
}

export interface RemovalRequest {
  list: Path
  index: number
  kind: RemovalKind
  name: string
  holdsData: boolean
}

export function describeRemoval(draft: Node, list: Path, index: number): RemovalRequest | null {
  const node = getAt(draft, [...list, index])
  if (!isNode(node)) return null
  const kind = kindOf(list)
  const name = [node.label, node.title, node.key].find((v) => typeof v === 'string' && v !== '') as string | undefined
  return { list, index, kind, name: name ?? '', holdsData: holdsData(kind, node) }
}

const DISCARDS: ReadonlySet<RemovalKind> = new Set(['category', 'section', 'item', 'row'])

export const removalMessage = ({ kind, name }: RemovalRequest): string =>
  `Quitar ${NOUN[kind]} «${name}» de la plantilla: los datos ya cargados en los personajes se conservan, pero dejan de mostrarse.${
    DISCARDS.has(kind) ? ' Lo quitado pasa a «Campos descartados», donde podés revisar los datos de cada personaje, restaurarlo o eliminarlo.' : ''
  }`

const itemKeysIn = (node: Node, kind: RemovalKind): string[] => {
  if (kind === 'item') return typeof node.key === 'string' ? [node.key] : []
  const sections = kind === 'category' ? nodes(node.sections) : kind === 'section' ? [node] : []
  return sections.flatMap((s) => nodes(s.items).flatMap((i) => (typeof i.key === 'string' ? [i.key] : [])))
}

/**
 * Why removing `list[index]` must wait: it would discard data keys an entry that is already discarded claims (the same key, or a table
 * and a row of it). One purge would then delete data the other entry still shows. The DM restores or deletes the older one first.
 */
export function removalConflict(draft: Node, list: Path, index: number): string | null {
  const existing = discardedEntries(draft)
  if (existing.length === 0) return null
  const request = describeRemoval(draft, list, index)
  if (!request) return null
  for (const entry of discardedBy(draft, list, index, request.kind, new Date())) {
    const claimed = new Set([String(entry.item.key), ...discardedDataKeys(entry.item as unknown as DiscardedItem)])
    const clash = existing.find((e) => [String(e.item.key), ...discardedDataKeys(e.item as unknown as DiscardedItem)].some((k) => claimed.has(k)))
    if (clash) {
      const label = typeof clash.item.label === 'string' ? clash.item.label : String(clash.item.key)
      return `Ya hay un campo descartado con los mismos datos («${label}»). Restauralo o eliminalo antes de quitar «${request.name}».`
    }
  }
  return null
}

const mapBlocks = (draft: Node, change: (block: Node) => Node): Node =>
  setAt(
    draft,
    ['categories'],
    nodes(draft.categories).map((category) => ({
      ...category,
      sections: nodes(category.sections).map((section) => ({ ...section, blocks: nodes(section.blocks).map(change) })),
    })),
  )

/** Tracks counting damage in a removed field: without superficial damage the track goes, without aggravated only that part. */
function withoutTrackRefs(draft: Node, gone: ReadonlySet<string>): Node {
  const list = (v: unknown): Node[] => (Array.isArray(v) ? v.filter(isNode) : [])
  return {
    ...draft,
    categories: list(draft.categories).map((c) => ({
      ...c,
      sections: list(c.sections).map((s) => ({
        ...s,
        items: (Array.isArray(s.items) ? s.items : []).map((item) => {
          if (!isNode(item) || !isNode(item.track)) return item
          const track = item.track
          if (typeof track.superficial === 'string' && gone.has(track.superficial)) return Object.fromEntries(Object.entries(item).filter(([name]) => name !== 'track'))
          if (typeof track.aggravated === 'string' && gone.has(track.aggravated)) return { ...item, track: { superficial: track.superficial } }
          return item
        }),
      })),
    })),
  }
}

/** The card without the removed items: a pin of a removed key goes, a removed max or stat line or excerpt is dropped. */
function cardWithout(card: Node, gone: ReadonlySet<string>): Node {
  const pinned = (Array.isArray(card.pinned) ? card.pinned : [])
    .filter((pin) => !(isNode(pin) && typeof pin.key === 'string' && gone.has(pin.key)))
    .map((pin) => (isNode(pin) && typeof pin.max === 'string' && gone.has(pin.max) ? Object.fromEntries(Object.entries(pin).filter(([name]) => name !== 'max')) : pin))
  return Object.fromEntries(
    Object.entries({ ...card, pinned }).filter(([name, value]) => !((name === 'statline' || name === 'excerpt') && typeof value === 'string' && gone.has(value))),
  )
}

/** The draft without any reference to the items `gone`: blocks stop showing them; roles, card pins and tracks bound to them are cleared. */
export function dropReferences(draft: Node, gone: ReadonlySet<string>): Node {
  let next = mapBlocks(draft, (block) => (Array.isArray(block.items) ? { ...block, items: block.items.filter((k) => !gone.has(k as string)) } : block))
  if (isNode(next.roles)) next = setAt(next, ['roles'], Object.fromEntries(Object.entries(next.roles).filter(([, key]) => !gone.has(key as string))))
  if (isNode(next.card)) next = setAt(next, ['card'], cardWithout(next.card, gone))
  return withoutTrackRefs(next, gone)
}

/**
 * The draft without the part. Blocks stop showing the removed items, roles and card pins bound to a removed item are cleared, and the
 * filter of a modal block forgets a removed action category, so the removal never leaves a dangling reference behind.
 */
export function removeNode(draft: Node, list: Path, index: number, now: Date = new Date()): Node {
  const node = getAt(draft, [...list, index])
  const kind = kindOf(list)
  let next = addDiscarded(removeFrom(draft, list, index), discardedBy(draft, list, index, kind, now))
  if (!isNode(node)) return next
  const gone = new Set(itemKeysIn(node, kind))
  if (gone.size > 0) next = dropReferences(next, gone)
  const table = getAt(draft, list.slice(0, -1))
  if (kind === 'actionCategory' && isNode(table)) {
    next = mapBlocks(next, (block) =>
      Array.isArray(block.items) && block.items.includes(table.key) && Array.isArray(block.filterCategories) ? { ...block, filterCategories: block.filterCategories.filter((k) => k !== node.key) } : block,
    )
  }
  return next
}
