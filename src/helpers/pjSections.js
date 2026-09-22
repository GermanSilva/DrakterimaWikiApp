import { SECTION_FIELDS, SECTION_SHOW, UNTRACKED_FIELDS } from '../pages/pj/pjConstants'

const FIELD_SECTIONS = {}
for (const [section, fields] of Object.entries(SECTION_FIELDS)) {
  for (const field of fields) (FIELD_SECTIONS[field] ??= []).push(section)
}

// Empty defaults (undefined/null/''/false/0/[]/{}) compare equal, so backfilled form defaults
// on legacy docs don't count as edits. Keys are sorted to ignore ordering.
function canon(v) {
  if (Array.isArray(v)) return v.length ? v.map(canon) : undefined
  if (v && typeof v === 'object') {
    const entries = Object.keys(v).sort().map(k => [k, canon(v[k])]).filter(([, x]) => x !== undefined)
    return entries.length ? Object.fromEntries(entries) : undefined
  }
  return v === '' || v === null || v === false || v === 0 ? undefined : v
}

const sameValue = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b))

export function changedPjSections(oldPj, newPj) {
  const changed = new Set()
  const keys = new Set([...Object.keys(oldPj), ...Object.keys(newPj)])
  for (const key of keys) {
    if (UNTRACKED_FIELDS.includes(key) || sameValue(oldPj[key], newPj[key])) continue
    for (const section of FIELD_SECTIONS[key] ?? ['general']) changed.add(section)
  }
  return [...changed]
}

function isSectionShown(pj, sectionKey, viewerId) {
  if (sectionKey === 'dm') return viewerId === 'dm' && !!pj.notas
  return SECTION_SHOW[sectionKey]?.(pj) ?? true
}

export function isSectionUnread(pj, sectionKey, viewerId, readState) {
  const updatedTs = pj.sections_updated?.[sectionKey]
  if (!viewerId || !updatedTs || !isSectionShown(pj, sectionKey, viewerId)) return false
  const entry = readState[`${viewerId}_pjs_${pj.id}_${sectionKey}`]
  if (!entry) return true
  return new Date(updatedTs) > new Date(entry.seenAt)
}

export function isPjUnread(pj, viewerId, readState) {
  return Object.keys(pj.sections_updated ?? {}).some(k => isSectionUnread(pj, k, viewerId, readState))
}
