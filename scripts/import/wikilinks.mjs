// Wiki-link audit. Text is never rewritten: ids are preserved by the import, so links keep working.
// Syntax: [[{3G}Label]] = collection letter G (see COLLECTION_LETTER in src/components/wikiHelpers.js).
import { LETTER_TABLE } from './schema.mjs'

const WIKI_LINK = /\[\[\{(\d+)([A-Z])\}/g
const WIKI_LINK_NO_LETTER = /\[\[\{\d+\}/g

function* stringsOf(value) {
  if (typeof value === 'string') yield value
  else if (Array.isArray(value)) for (const v of value) yield* stringsOf(v)
  else if (value && typeof value === 'object') for (const v of Object.values(value)) yield* stringsOf(v)
}

/**
 * @param {{ tables: Record<string, object[]>, dmNotes: object[] }} output
 * @returns {{ total: number, resolved: number, dangling: number, noLetter: number,
 *   byLetter: Record<string, { total: number, resolved: number, dangling: number }>, unknownLetters: Record<string, number> }}
 */
export function auditWikiLinks(output) {
  const idsByTable = Object.fromEntries(Object.entries(output.tables).map(([t, rows]) => [t, new Set(rows.map((r) => r.id))]))
  const stats = { total: 0, resolved: 0, dangling: 0, noLetter: 0, byLetter: {}, unknownLetters: {} }

  const scan = (text) => {
    for (const m of text.matchAll(WIKI_LINK)) {
      const id = Number(m[1])
      const letter = m[2]
      const table = LETTER_TABLE[letter]
      if (!table) {
        stats.unknownLetters[letter] = (stats.unknownLetters[letter] ?? 0) + 1
        continue
      }
      const entry = (stats.byLetter[letter] ??= { total: 0, resolved: 0, dangling: 0 })
      entry.total += 1
      stats.total += 1
      if (idsByTable[table]?.has(id)) {
        entry.resolved += 1
        stats.resolved += 1
      } else {
        entry.dangling += 1
        stats.dangling += 1
      }
    }
    stats.noLetter += (text.match(WIKI_LINK_NO_LETTER) ?? []).length
  }

  for (const rows of Object.values(output.tables)) for (const row of rows) for (const s of stringsOf(row)) scan(s)
  for (const note of output.dmNotes) for (const s of stringsOf(note)) scan(s)
  return stats
}
