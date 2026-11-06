/** Turns the path-addressed errors of `validateSheet` into Spanish sentences placed on the part of the draft they are about. */
import { parseFormula } from '../formula/formula'
import type { SheetError } from '../sheet/sheetModel'
import { getAt, isNode, parsePath, type Path } from './draft'
import { formulaErrorEs, sheetErrorEs } from './messagesEs'
import { ROLE_LABEL } from './roleLabels'

export interface DisplayError {
  /** "Categoría «General» › Sección «Perfil»": where, by the names the DM gave. Empty for sheet-wide errors. */
  where: string
  /** The property ("Nombre", "Fórmula"...); empty when the whole part is wrong. */
  field: string
  text: string
}

/** The lists whose entries have a panel of their own in the builder. */
const PANEL_LISTS = new Set(['categories', 'sections', 'items', 'blocks', 'columns', 'rows', 'options'])

/** The deepest part of the draft with its own panel that contains `path` (the sheet itself, `[]`, when none does). */
export function ownerOf(path: Path): Path {
  let owner = -1
  for (let i = 1; i < path.length; i++) if (typeof path[i] === 'number' && typeof path[i - 1] === 'string' && PANEL_LISTS.has(path[i - 1] as string)) owner = i
  if (owner >= 0) return path.slice(0, owner + 1)
  return path[0] === 'roles' ? ['roles'] : []
}

const NOUN: Record<string, string> = { sections: 'Sección', items: 'Ítem', blocks: 'Bloque', columns: 'Columna', rows: 'Fila', options: 'Opción' }

const FIELD: Record<string, string> = {
  key: 'Clave', label: 'Nombre', title: 'Título', formula: 'Fórmula', modifier: 'Fórmula del modificador', type: 'Tipo', editableBy: 'Editable por',
  default: 'Valor por defecto', options: 'Opciones', display: 'Mostrar como', format: 'Formato', min: 'Mínimo', max: 'Máximo', items: 'Ítems', mode: 'Modo',
  filterCategories: 'Categorías que muestra', columns: 'Columnas', rows: 'Filas', stat: 'Stat asociado', use: 'Usa', value: 'Valor', reset: 'Reinicio',
  scope: 'Pertenece a', sortBy: 'Orden', direction: 'Dirección', calc: 'Cálculo', table: 'Tabla', column: 'Columna', op: 'Operación', overridable: 'Reemplazable',
  hidden: 'Oculto', searchable: 'Buscable', rewardDestination: 'Destino de recompensa', categories: 'Categorías de acciones', sections: 'Secciones',
  blocks: 'Bloques', kind: 'Tipo de ítem',
}

const nameOf = (node: unknown, index: number): string => {
  if (isNode(node)) for (const value of [node.label, node.title, node.key]) if (typeof value === 'string' && value.trim() !== '') return value.trim()
  return `n.º ${index + 1}`
}

function formulaProblem(draft: unknown, path: string): string {
  const value = getAt(draft, parsePath(path))
  if (typeof value !== 'string') return 'Falta la fórmula.'
  const parsed = parseFormula(value)
  return parsed.ok ? 'La fórmula tiene caracteres de control.' : `Fórmula no válida: ${formulaErrorEs(parsed.error)}`
}

export function describeSheetError(draft: unknown, error: SheetError): DisplayError {
  const path = parsePath(error.path)
  const parts: string[] = []
  path.forEach((step, i) => {
    if (typeof step !== 'number' || typeof path[i - 1] !== 'string') return
    const list = path[i - 1] as string
    if (!PANEL_LISTS.has(list)) return
    const noun = list === 'categories' ? (i === 1 ? 'Categoría' : 'Categoría de acciones') : NOUN[list]
    parts.push(`${noun} «${nameOf(getAt(draft, path.slice(0, i + 1)), step)}»`)
  })
  const last = path[path.length - 1]
  const name = typeof last === 'string' ? last : path.length >= 2 ? (path[path.length - 2] as string) : ''
  const lastIsPanel = typeof last === 'number' && PANEL_LISTS.has(path[path.length - 2] as string)
  if (path[0] === 'roles' && typeof last === 'string' && last !== 'roles') {
    return { where: 'Roles', field: ROLE_LABEL[last as keyof typeof ROLE_LABEL] ?? last, text: sheetErrorEs(error.message) }
  }
  const sheetWide = path.length === 1 && path[0] === 'categories'
  return {
    where: parts.join(' › '),
    field: lastIsPanel || sheetWide || path.length === 0 ? '' : (FIELD[name] ?? name),
    text: error.message === 'invalid formula' ? formulaProblem(draft, error.path) : sheetErrorEs(error.message),
  }
}

export function displayLine(e: DisplayError): string {
  const what = e.field !== '' ? `${e.field}: ${e.text}` : e.text
  if (e.where === '') return what
  return e.field !== '' ? `${e.where} › ${what}` : `${e.where}: ${what}`
}
