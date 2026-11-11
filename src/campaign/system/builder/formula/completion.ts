/** The pure part of the reference autocomplete (S42 b): where a `{` is being typed, what matches, and how an insertion edits the text. */
import { FORMULA_FUNCTIONS } from '../../formula/functionCatalogue'
import type { ScopeEntry, ScopeGroup } from '../../sheet/formulaScope'

export interface Completion {
  /** Offset of the `{` being typed. */
  start: number
  /** What was typed after it. */
  query: string
  /** The caret is inside the arguments of a table function (suma, lookup...), where a table is a valid reference. */
  inTable: boolean
}

const TABLE_FUNCTIONS = new Set(FORMULA_FUNCTIONS.filter((f) => f.group === 'tabla').map((f) => f.name))

/** True when the innermost open parenthesis of `before` belongs to a table function. Strings and references are skipped. */
function insideTableFunction(before: string): boolean {
  const open: string[] = []
  for (let i = 0; i < before.length; i++) {
    const ch = before[i]
    if (ch === '"') {
      const end = before.indexOf('"', i + 1)
      if (end === -1) return false
      i = end
    } else if (ch === '{') {
      const end = before.indexOf('}', i)
      if (end === -1) return false
      i = end
    } else if (ch === '(') {
      open.push(/([a-z]+)\s*$/.exec(before.slice(0, i))?.[1] ?? '')
    } else if (ch === ')') {
      open.pop()
    }
  }
  return TABLE_FUNCTIONS.has(open[open.length - 1] ?? '')
}

/** The reference being typed at the caret (an unclosed `{` with only reference characters after it), or null. */
export function completionAt(text: string, caret: number): Completion | null {
  const before = text.slice(0, caret)
  const start = before.lastIndexOf('{')
  if (start < 0) return null
  const query = before.slice(start + 1)
  if (!/^[a-z0-9_.]*$/.test(query)) return null
  return { start, query, inTable: insideTableFunction(before.slice(0, start)) }
}

export const plain = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** The entries to offer: tables only inside a table function; the query matches the reference or the label (accents and case ignored). */
export function matchEntries(entries: readonly ScopeEntry[], completion: Completion): ScopeEntry[] {
  const wanted = plain(completion.query)
  return entries.filter((e) => (!e.tableOnly || completion.inTable) && (wanted === '' || plain(e.ref).includes(wanted) || plain(e.label).includes(wanted)))
}

/** The text after inserting `ref` over what was typed (and the `}` already there, if any), with the caret after the closed brace. */
export function applyCompletion(text: string, completion: Completion, caret: number, ref: string): { text: string; caret: number } {
  const tail = text.slice(caret)
  const rest = tail.startsWith('}') ? tail.slice(1) : tail
  const inserted = `{${ref}}`
  return { text: text.slice(0, completion.start) + inserted + rest, caret: completion.start + inserted.length }
}

export const GROUP_ORDER: readonly ScopeGroup[] = ['campos', 'atributos', 'capacidades', 'locales', 'tablas']

/** Heading of a group; the locals depend on where the formula is (a Stat row has one local value, a table row has columns). */
export function groupLabel(group: ScopeGroup, rowIsStat: boolean): string {
  switch (group) {
    case 'campos':
      return 'Campos'
    case 'atributos':
      return 'Atributos'
    case 'capacidades':
      return 'Capacidades'
    case 'locales':
      return rowIsStat ? 'De esta fila (locales)' : 'Columnas de esta fila (locales)'
    case 'tablas':
      return 'Tablas'
  }
}
