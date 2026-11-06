/** New nodes of the sheet draft, and the key rules for a node while it is new (the key follows the name until typed by hand). */
import { getAt, isNode, keySpaces, slugKey, updateAt, type Node, type Path } from './draft'

export const TABLE_TYPES = ['stat', 'capacidades', 'habilidad', 'libre', 'monedas', 'economia'] as const
export type TableType = (typeof TABLE_TYPES)[number]

/** Where the key of a node must be unique: one of the sheet-wide namespaces, or among the siblings of its list. */
export type KeyScope = 'global' | 'categories' | 'sections' | 'siblings'

const keysOfList = (list: unknown, skip: number): string[] =>
  Array.isArray(list) ? list.flatMap((n, i) => (i !== skip && isNode(n) && typeof n.key === 'string' ? [n.key] : [])) : []

/** The keys a node at `path` has to avoid. */
function takenFor(draft: Node, path: Path, scope: KeyScope): Set<string> {
  if (scope === 'siblings') {
    const parent = path.slice(0, -1)
    const list = getAt(draft, parent)
    return new Set(keysOfList(list, path[path.length - 1] as number))
  }
  const spaces = keySpaces(draft)
  const own = getAt(draft, path)
  const taken = scope === 'global' ? spaces.global : scope === 'categories' ? spaces.categories : spaces.sections
  const copy = new Set(taken)
  if (isNode(own) && typeof own.key === 'string') copy.delete(own.key)
  return copy
}

const extraReserved = (scope: KeyScope, path: Path): string[] => (scope === 'sections' && path.length > 0 ? ['dm'] : [])

/** Renames a node; a new node whose key was not typed by hand gets the key its name makes. */
export function renameNode(draft: Node, path: Path, field: 'label' | 'title', value: string, scope: KeyScope): Node {
  return updateAt(draft, path, (current) => {
    const node = isNode(current) ? current : {}
    const next: Node = { ...node }
    if (field === 'title' && value === '') delete next.title
    else next[field] = value
    if (node._new === true && node._keyEdited !== true) next.key = slugKey(value, takenFor(draft, path, scope), scope === 'global', extraReserved(scope, path))
    return next
  })
}

/** Sets the key typed by the DM on a new node; it stops following the name. */
export const setKey = (draft: Node, path: Path, key: string): Node => updateAt(draft, path, (current) => ({ ...(isNode(current) ? current : {}), key, _keyEdited: true }))

const fresh = (draft: Node, label: string, scope: 'global' | 'categories' | 'sections', extra: string[] = []) => {
  const spaces = keySpaces(draft)
  return { key: slugKey(label, spaces[scope], scope === 'global', extra), label }
}

export const newCategory = (draft: Node): Node => ({ _new: true, ...fresh(draft, 'Nueva categoría', 'categories'), sections: [] })

export const newSection = (draft: Node): Node => ({ _new: true, ...fresh(draft, 'Nueva sección', 'sections', ['dm']), items: [], blocks: [] })

export const newField = (draft: Node): Node => ({ _new: true, _open: true, kind: 'field', ...fresh(draft, 'Nuevo campo', 'global'), type: 'short', editableBy: 'dm' })

/** A seeded column keeps its conventional key (the detail reads `nombre` and `categoria`) whatever the DM calls it. */
const newColumn = (label: string, key: string): Node => ({ _new: true, _keyEdited: true, key, label, type: 'short', editableBy: 'dm' })

export function newTable(draft: Node, type: TableType): Node {
  const base = { _new: true, _open: true, kind: 'table', type, ...fresh(draft, 'Nueva tabla', 'global') }
  switch (type) {
    case 'stat':
      return { ...base, rows: [] }
    case 'capacidades':
      return { ...base, columns: [], rows: [] }
    case 'habilidad':
      return { ...base, editableBy: 'dm', columns: [newColumn('Nombre', 'nombre'), newColumn('Categoría', 'categoria')] }
    case 'libre':
      return { ...base, editableBy: 'dm', columns: [newColumn('Nombre', 'nombre')] }
    case 'monedas':
      return { ...base, rows: [] }
    case 'economia':
      return { ...base, editableBy: 'dm' }
  }
}

/** A block of a section; `siblings` are the blocks it already has (block keys are unique per section). */
export function newBlock(siblings: unknown): Node {
  return { _new: true, key: slugKey('Nuevo bloque', new Set(keysOfList(siblings, -1)), false), title: 'Nuevo bloque', mode: 'plano', items: [] }
}

const labelsOfList = (list: unknown): Set<string> => new Set(keysOfList(list, -1))

/** An option of an options field or column (`siblings` are the options it already has). */
export function newOption(siblings: unknown): Node {
  const label = `Opción ${(Array.isArray(siblings) ? siblings.length : 0) + 1}`
  return { _new: true, key: slugKey(label, labelsOfList(siblings), false), label }
}

export function newColumnNode(siblings: unknown): Node {
  return { _new: true, key: slugKey('Nueva columna', labelsOfList(siblings), false), label: 'Nueva columna', type: 'short', editableBy: 'dm' }
}

export function newActionCategory(siblings: unknown): Node {
  return { _new: true, key: slugKey('Nueva categoría de acciones', labelsOfList(siblings), false), label: 'Nueva categoría de acciones' }
}

export const newStatRow = (draft: Node): Node => ({ _new: true, ...fresh(draft, 'Nuevo stat', 'global'), modifier: '{valor}', editableBy: 'dm' })

export const newCapacidadRow = (draft: Node, stat: string): Node => ({ _new: true, ...fresh(draft, 'Nueva capacidad', 'global'), stat, use: 'modificador', editableBy: 'dm' })

/** A denomination worth ten times the largest one (or 1 for the first), so the values stay distinct. */
export function newCoinRow(draft: Node, siblings: unknown): Node {
  const values = Array.isArray(siblings) ? siblings.flatMap((r) => (isNode(r) && typeof r.value === 'number' ? [r.value] : [])) : []
  return { _new: true, ...fresh(draft, 'Nueva moneda', 'global'), value: values.length === 0 ? 1 : Math.min(Math.max(...values) * 10, 1_000_000_000) }
}

/** Two fresh options for a field or column that just became an options one. */
export const initialOptions = (): Node[] => [newOption([]), newOption([{ key: 'opcion_1' }])]
