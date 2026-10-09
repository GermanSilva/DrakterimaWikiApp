/** Pure search / grouping rules of the notes page (no React, no data access). */

export interface NoteRow {
  type: string
  id: number
  text: string
  /** Opaque author key. */
  key: string
  /** Character name, '' when none. */
  label: string
  author?: string
}

export const TYPE_LABELS: Record<string, string> = {
  sesiones: 'Sesión',
  pjs: 'PJ',
  pnjs: 'PNJ',
  lugares: 'Lugar',
  facciones: 'Facción',
  lore: 'Lore',
  items: 'Ítem',
}

/** What the `[section]` chip writes into the query; matches both the label and the table key. */
export const CHIP_VALUE: Record<string, string> = {
  sesiones: 'sesion',
  pjs: 'pj',
  pnjs: 'pnj',
  lugares: 'lugar',
  facciones: 'faccion',
  lore: 'lore',
  items: 'item',
}

const TYPE_ORDER = Object.keys(TYPE_LABELS)

export const typeLabel = (type: string): string => TYPE_LABELS[type] ?? type

// U+0300..U+036F: the combining diacritical marks left over by NFD
const COMBINING_MARKS = /[̀-ͯ]/g
const normalizeChar = (ch: string): string => ch.toLowerCase().normalize('NFD').replace(COMBINING_MARKS, '')

/** Case- and accent-insensitive form used for every comparison. */
export const normalize = (s: string | null | undefined): string => (s ? normalizeChar(s) : '')

export interface ParsedQuery {
  /** First `[section]` of the query, trimmed; null when there is none. */
  sectionFilter: string | null
  /** The rest of the query without that bracket. */
  textFilter: string
}

const BRACKET = /\[([^\]]+)\]/
const BRACKET_STRIP = /\s*\[[^\]]*\]\s*/g

export function parseQuery(query: string): ParsedQuery {
  const match = query.match(BRACKET)
  return {
    sectionFilter: match ? match[1].trim() : null,
    textFilter: query.replace(/\[[^\]]*\]/, '').trim(),
  }
}

export const hasText = (n: { text: string }): boolean => n.text.trim() !== ''

/** `[sección] texto`: the bracket matches the type label or table key, the text matches name, body or (unbracketed) type label. */
export function filterNotes<T extends NoteRow>(notes: T[], parsed: ParsedQuery, nameOf: (type: string, id: number) => string): T[] {
  const section = parsed.sectionFilter ? normalize(parsed.sectionFilter) : null
  const text = normalize(parsed.textFilter)
  return notes.filter((n) => {
    const label = normalize(typeLabel(n.type))
    if (section && !label.includes(section) && !normalize(n.type).includes(section)) return false
    if (text) {
      const inLabel = !section && label.includes(text)
      if (!normalize(nameOf(n.type, n.id)).includes(text) && !normalize(n.text).includes(text) && !inLabel) return false
    }
    return true
  })
}

/** Types present in the notes, in the canonical order. */
export function typesPresent(notes: { type: string }[]): string[] {
  const present = new Set(notes.map((n) => n.type))
  return [...TYPE_ORDER.filter((t) => present.has(t)), ...[...present].filter((t) => !TYPE_ORDER.includes(t))]
}

export function isChipActive(query: string, type: string): boolean {
  const { sectionFilter } = parseQuery(query)
  return sectionFilter !== null && normalize(sectionFilter) === normalize(CHIP_VALUE[type] ?? type)
}

/** Clicking an active chip clears the bracket; otherwise the bracket is replaced by this type's. */
export function toggleChip(query: string, type: string): string {
  const rest = query.replace(BRACKET_STRIP, ' ').trim()
  if (isChipActive(query, type)) return rest
  return `[${CHIP_VALUE[type] ?? type}]${rest ? ` ${rest}` : ''}`
}

export interface AuthorGroup<T extends NoteRow> {
  key: string
  /** Display name of the author (never empty). */
  name: string
  /** Distinct character names the author wrote notes as. */
  characters: string[]
  notes: T[]
}

export const authorName = (n: NoteRow): string => n.author?.trim() || n.label || 'Jugador'

/** Groups by author key (two people with the same name stay apart), sorted by name; notes keep their order. */
export function groupByAuthor<T extends NoteRow>(notes: T[]): AuthorGroup<T>[] {
  const groups = new Map<string, AuthorGroup<T>>()
  for (const n of notes) {
    let g = groups.get(n.key)
    if (!g) {
      g = { key: n.key, name: authorName(n), characters: [], notes: [] }
      groups.set(n.key, g)
    }
    g.notes.push(n)
    if (n.label && !g.characters.includes(n.label)) g.characters.push(n.label)
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

export interface Segment {
  text: string
  match: boolean
}

/** Splits `text` around every accent/case-insensitive occurrence of `term`, keeping the original characters. */
export function highlightSegments(text: string, term: string): Segment[] {
  const needle = normalize(term)
  if (!text || !needle) return [{ text, match: false }]
  // normalized haystack plus, for each of its characters, the offset in `text` it came from
  let hay = ''
  const origin: number[] = []
  let offset = 0
  for (const ch of text) {
    const n = normalizeChar(ch)
    for (let i = 0; i < n.length; i++) origin.push(offset)
    hay += n
    offset += ch.length
  }
  origin.push(text.length)
  const segments: Segment[] = []
  let last = 0
  let idx = hay.indexOf(needle)
  while (idx !== -1) {
    const start = origin[idx]
    const end = origin[idx + needle.length]
    if (start > last) segments.push({ text: text.slice(last, start), match: false })
    segments.push({ text: text.slice(start, end), match: true })
    last = end
    idx = hay.indexOf(needle, idx + needle.length)
  }
  if (last < text.length) segments.push({ text: text.slice(last), match: false })
  return segments.length ? segments : [{ text, match: false }]
}
