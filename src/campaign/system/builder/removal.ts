/**
 * The one place a part of the sheet is removed (G7b hooks its discarded-fields review in here). A part that may hold
 * character data is confirmed first: the data stays in the characters but stops being shown.
 */
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

export const removalMessage = ({ kind, name }: RemovalRequest): string =>
  `Quitar ${NOUN[kind]} «${name}» de la plantilla: los datos ya cargados en los personajes se conservan, pero dejan de mostrarse.`

const itemKeysIn = (node: Node, kind: RemovalKind): string[] => {
  if (kind === 'item') return typeof node.key === 'string' ? [node.key] : []
  const sections = kind === 'category' ? nodes(node.sections) : kind === 'section' ? [node] : []
  return sections.flatMap((s) => nodes(s.items).flatMap((i) => (typeof i.key === 'string' ? [i.key] : [])))
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

/**
 * The draft without the part. Blocks stop showing the removed items, roles bound to a removed field are cleared, and the
 * filter of a modal block forgets a removed action category, so the removal never leaves a dangling reference behind.
 */
export function removeNode(draft: Node, list: Path, index: number): Node {
  const node = getAt(draft, [...list, index])
  const kind = kindOf(list)
  let next = removeFrom(draft, list, index)
  if (!isNode(node)) return next
  const gone = new Set(itemKeysIn(node, kind))
  if (gone.size > 0) {
    next = mapBlocks(next, (block) => (Array.isArray(block.items) ? { ...block, items: block.items.filter((k) => !gone.has(k as string)) } : block))
    if (isNode(next.roles)) next = setAt(next, ['roles'], Object.fromEntries(Object.entries(next.roles).filter(([, key]) => !gone.has(key as string))))
  }
  const table = getAt(draft, list.slice(0, -1))
  if (kind === 'actionCategory' && isNode(table)) {
    next = mapBlocks(next, (block) =>
      Array.isArray(block.items) && block.items.includes(table.key) && Array.isArray(block.filterCategories) ? { ...block, filterCategories: block.filterCategories.filter((k) => k !== node.key) } : block,
    )
  }
  return next
}
