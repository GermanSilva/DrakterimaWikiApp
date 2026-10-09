// Parses and normalises a legacy Firestore JSON export (see App.jsx exportData / exportArticles).
// Pure: takes a JSON string or an already parsed object, returns plain data plus issues.
import { isPlainObject, toId } from './validate.mjs'

/** Collections keyed by a numeric id (doc id = String(id) in Firestore). */
export const NUMERIC_ID_COLLECTIONS = [
  'sesiones',
  'pjs',
  'pnjs',
  'lugares',
  'facciones',
  'lore',
  'items',
  'mapas',
  'map_points',
  'homebrew_rules',
  'disponibilidad',
]

/** Collections keyed by a string id (composite ids, 'current', 'loteria', ...). */
export const STRING_ID_COLLECTIONS = ['player_notes', 'game_logs', 'game_pot', 'game_config', 'read_state', 'login_logs']

/** The export written by exportArticles carries only these. */
export const ARTICLE_COLLECTIONS = ['sesiones', 'pjs', 'pnjs', 'lugares', 'facciones', 'lore', 'items', 'player_notes']

/** A complete export (exportData) also carries these. Missing ones mean a partial export. */
export const REQUIRED_COLLECTIONS = [
  ...ARTICLE_COLLECTIONS,
  'mapas',
  'map_points',
  'homebrew_rules',
  'disponibilidad',
  'game_logs',
  'game_pot',
  'game_config',
]

export const ALL_COLLECTIONS = [...NUMERIC_ID_COLLECTIONS, ...STRING_ID_COLLECTIONS]

export class LegacyFormatError extends Error {}

/**
 * @param {string|object} input JSON text or parsed export
 * @param {{ collector: ReturnType<import('./validate.mjs').createCollector>, allowPartial?: boolean }} opts
 * @returns {{ data: Record<string, object[]>, present: Set<string>, counts: Record<string, number>, unknown: string[] }}
 */
export function parseLegacy(input, { collector, allowPartial = false }) {
  let raw = input
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input)
    } catch {
      // the parser message can quote the input, which may contain secrets: report a generic one
      throw new LegacyFormatError('the export is not valid JSON')
    }
  }
  if (!isPlainObject(raw)) throw new LegacyFormatError('the export must be a JSON object of arrays')

  const data = {}
  const present = new Set()
  const counts = {}

  for (const name of ALL_COLLECTIONS) {
    if (raw[name] === undefined) {
      data[name] = []
      counts[name] = 0
      continue
    }
    if (!Array.isArray(raw[name])) {
      collector.fatal('collection_not_array', { table: name })
      data[name] = []
      counts[name] = 0
      continue
    }
    present.add(name)
    counts[name] = raw[name].length
    const numeric = NUMERIC_ID_COLLECTIONS.includes(name)
    const seen = new Set()
    const docs = []
    for (const [index, doc] of raw[name].entries()) {
      if (!isPlainObject(doc)) {
        collector.fatal('doc_not_object', { table: name, id: index })
        continue
      }
      if (numeric) {
        const id = toId(doc.id)
        if (id === null) {
          collector.fatal('invalid_id', { table: name, id: index, field: 'id' })
          continue
        }
        if (seen.has(id)) {
          collector.fatal('duplicate_id', { table: name, id })
          continue
        }
        seen.add(id)
        docs.push({ ...doc, id })
      } else {
        // composite / singleton docs: uniqueness matters for the ones imported row by row
        if (typeof doc.id === 'string' || typeof doc.id === 'number') {
          const key = String(doc.id)
          if (seen.has(key) && name !== 'login_logs') {
            collector.fatal('duplicate_id', { table: name, id: key })
            continue
          }
          seen.add(key)
        }
        docs.push({ ...doc })
      }
    }
    data[name] = docs
  }

  const missing = REQUIRED_COLLECTIONS.filter((c) => !present.has(c))
  for (const table of missing) {
    if (allowPartial) collector.warn('partial_export_missing_collection', { table })
    else collector.fatal('partial_export_missing_collection', { table })
  }
  if (!present.has('read_state')) collector.info('optional_collection_missing', { table: 'read_state' })

  const unknown = Object.keys(raw).filter((k) => !ALL_COLLECTIONS.includes(k))
  if (unknown.length > 0) collector.warn('unknown_collections_ignored', { count: unknown.length })

  return { data, present, counts, unknown }
}
