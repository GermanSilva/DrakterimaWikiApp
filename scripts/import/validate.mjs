// Validation primitives (CHECK-aware) and the issue collector shared by the whole pipeline.
//
// Issue policy:
//  - fatal():   always an error (non-numeric / duplicate ids, unusable input).
//  - problem(): data that would violate a CHECK/FK. Error in 'strict' mode (the import aborts),
//               warning in 'lenient' mode (the caller skips or clamps and the report says so).
//  - warn()/info(): never abort.
// Issues carry codes and locations only (table, id, field, count), never row text.
import { ESTADOS, LINK_TYPE_TABLE } from './schema.mjs'

export function createCollector(mode = 'strict') {
  if (mode !== 'strict' && mode !== 'lenient') throw new Error(`unknown mode: ${String(mode)}`)
  const issues = []
  const add = (severity, code, loc = {}) => {
    const issue = { severity, code }
    for (const k of ['table', 'id', 'field', 'count']) if (loc[k] !== undefined) issue[k] = loc[k]
    issues.push(issue)
  }
  return {
    mode,
    issues,
    fatal: (code, loc) => add('error', code, loc),
    problem: (code, loc) => add(mode === 'strict' ? 'error' : 'warning', code, loc),
    warn: (code, loc) => add('warning', code, loc),
    info: (code, loc) => add('info', code, loc),
    errors: () => issues.filter((i) => i.severity === 'error'),
  }
}

/** Positive integer id from a number or a digit string; null when it is anything else. */
export function toId(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : null
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value.trim())) {
    const n = Number(value.trim())
    return Number.isSafeInteger(n) ? n : null
  }
  return null
}

export const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
export const isEmpty = (v) => v === undefined || v === null || v === ''

export function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

export const isValidTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(s)

/** ISO string for a timestamp-like value, or null. */
export function toIso(value) {
  if (isEmpty(value)) return null
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** nivel CHECK: integer 1..20. Returns { value, ok }. Out-of-range values are clamped. */
export function checkNivel(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n)) return { value: 1, ok: false }
  const clamped = Math.min(20, Math.max(1, Math.round(n)))
  return { value: clamped, ok: clamped === n }
}

export const isEstado = (v) => ESTADOS.includes(v)

/** map_points x/y CHECK: [0,1]. Returns { value, ok }. */
export function checkUnit(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n)) return { value: 0.5, ok: false }
  const clamped = Math.min(1, Math.max(0, n))
  return { value: clamped, ok: clamped === n }
}

/** link_type / link_id pair rule: both null or both set, with a known type. Returns 'ok' | 'half' | 'type'. */
export function checkLinkPair(linkType, linkId) {
  const noType = linkType === null || linkType === undefined
  const noId = linkId === null || linkId === undefined
  if (noType && noId) return 'ok'
  if (noType !== noId) return 'half'
  return Object.hasOwn(LINK_TYPE_TABLE, linkType) ? 'ok' : 'type'
}

/**
 * Cross-row rules over transformed output (mutates `output.tables` and `output.dmNotes`):
 * one default map, orphan map_points, link_id in the target table, visible_to subset of pjs.
 * Fixes are applied in both modes; in strict mode the issues are errors so the caller aborts.
 */
export function validateOutput(output, collector) {
  const { tables } = output
  const idsOf = (t) => new Set((tables[t] ?? []).map((r) => r.id))

  // one default map (partial unique index mapas_one_default_per_campaign)
  const defaults = (tables.mapas ?? []).filter((m) => m.is_default)
  if (defaults.length > 1) {
    collector.problem('multiple_default_maps', { table: 'mapas', count: defaults.length })
    defaults.sort((a, b) => a.id - b.id)
    for (const m of defaults.slice(1)) m.is_default = false
  }

  // map_points -> mapas FK
  const mapIds = idsOf('mapas')
  const keptPoints = []
  for (const p of tables.map_points ?? []) {
    if (!mapIds.has(p.map_id)) collector.problem('orphan_map_point', { table: 'map_points', id: p.id, field: 'map_id' })
    else keptPoints.push(p)
  }
  if (tables.map_points) tables.map_points = keptPoints

  // link_id must exist in the target table (no FK in the schema, but a dangling pin is a dead link)
  const targetIds = {}
  for (const p of tables.map_points ?? []) {
    if (p.link_type == null) continue
    const target = LINK_TYPE_TABLE[p.link_type]
    targetIds[target] ??= idsOf(target)
    if (!targetIds[target].has(p.link_id)) {
      collector.problem('dangling_map_link', { table: 'map_points', id: p.id, field: 'link_id' })
      p.link_type = null
      p.link_id = null
    }
  }

  // visible_to must reference characters that are imported
  const pjIds = idsOf('pjs')
  for (const [table, rows] of Object.entries(tables)) {
    for (const row of rows) {
      if (!row.visible_to?.length) continue
      const bad = row.visible_to.filter((id) => !pjIds.has(id))
      if (bad.length > 0) {
        collector.problem('visibility_unknown_pj', { table, id: row.id, field: 'visible_to', count: bad.length })
        row.visible_to = row.visible_to.filter((id) => pjIds.has(id))
      }
    }
  }

  // dm notes must still point at a kept entity
  const keptIds = {}
  output.dmNotes = output.dmNotes.filter((n) => (keptIds[n.entity_type] ??= idsOf(n.entity_type)).has(n.entity_id))
}
