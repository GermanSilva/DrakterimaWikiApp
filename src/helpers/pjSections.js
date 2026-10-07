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

export const sameValue = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b))

/**
 * The form values that really differ from the entity, with the same notion of "equal" as the section
 * tracking: an untouched default (0, '', false, [], {}) equals a missing key, so opening and saving a
 * character does not write every default into it.
 *
 * @param {Record<string, unknown>} entity
 * @param {Record<string, unknown>} values
 * @returns {Record<string, unknown>}
 */
export function changedPjFields(entity, values) {
  /** @type {Record<string, unknown>} */
  const patch = {}
  for (const [key, value] of Object.entries(values)) {
    if (!sameValue(entity[key], value)) patch[key] = value
  }
  return patch
}

export function changedPjSections(oldPj, newPj) {
  const changed = new Set()
  const keys = new Set([...Object.keys(oldPj), ...Object.keys(newPj)])
  for (const key of keys) {
    if (UNTRACKED_FIELDS.includes(key) || sameValue(oldPj[key], newPj[key])) continue
    for (const section of FIELD_SECTIONS[key] ?? ['general']) changed.add(section)
  }
  return [...changed]
}

/** `hasDmNotes`: the viewer is the DM and the character has DM notes (the only viewer of the 'dm' section). */
function sectionShown(pj, sectionKey, hasDmNotes) {
  if (sectionKey === 'dm') return hasDmNotes
  return SECTION_SHOW[sectionKey]?.(pj) ?? true
}

function isSectionShown(pj, sectionKey, viewerId) {
  return sectionShown(pj, sectionKey, viewerId === 'dm' && !!pj.notas)
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

/**
 * Port-based variants (hub): `port.isUnread(type, id, updatedAt, section)` replaces the readState map,
 * and `hasDmNotes` replaces the `pj.notas` lookup (the DM notes live outside the entity row there).
 * `dmStamp` (hub): the time of the last DM-notes edit, read from the DM-only notes row; when it is given the
 * 'dm' section ignores `sections_updated.dm` (legacy data), so nobody but the DM ever learns when notes changed.
 */
export function isSectionUnreadVia(port, pj, sectionKey, hasDmNotes, dmStamp) {
  const updatedTs = sectionKey === 'dm' && dmStamp !== undefined ? dmStamp : pj.sections_updated?.[sectionKey]
  if (!updatedTs || !sectionShown(pj, sectionKey, hasDmNotes)) return false
  return port.isUnread('pjs', pj.id, updatedTs, sectionKey)
}

export function isPjUnreadVia(port, pj, hasDmNotes, dmStamp) {
  const keys = new Set(Object.keys(pj.sections_updated ?? {}))
  if (dmStamp !== undefined) keys.add('dm')
  return [...keys].some(k => isSectionUnreadVia(port, pj, k, hasDmNotes, dmStamp))
}
