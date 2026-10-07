import { changedPjFields } from './pjSections'

/**
 * Form values whose seeded default derives from another field. When the source changed in this save, the derived
 * value is written explicitly: the diff baseline is built from the OLD row, so it would otherwise treat the
 * (now stale) default as "unedited" and drop it. Today: the current HP defaults to the maximum.
 *
 * @param {Record<string, unknown>} patch
 * @param {Record<string, unknown>} flat the full value the form produced
 * @returns {Record<string, unknown>}
 */
export function withDerivedDefaults(patch, flat) {
  if ('stat_hp' in patch && !('stat_hp_current' in patch) && flat.stat_hp_current !== undefined) {
    return { ...patch, stat_hp_current: flat.stat_hp_current }
  }
  return patch
}

const NUMERIC_STATS = [
  'stat_str', 'stat_dex', 'stat_con', 'stat_int', 'stat_wis', 'stat_cha',
  'stat_hp', 'stat_hp_temp', 'stat_ac', 'stat_ac_temp', 'stat_speed', 'stat_proficiency_bonus',
]

/**
 * The character as the session edit modal saves it: numeric inputs arrive as strings, the current HP defaults to
 * the maximum.
 *
 * @param {Record<string, unknown>} draft
 */
export function coerceSessionPj(draft) {
  const out = { ...draft }
  for (const key of NUMERIC_STATS) out[key] = parseInt(draft[key]) || 0
  out.stat_hp_current = parseInt(draft.stat_hp_current ?? draft.stat_hp) || 0
  return out
}

/**
 * The fields the session edit modal really changed: the draft (seeded with the whole character, edited in one card's
 * fields) is diffed against the same character after the same coercion, so untouched numbers, defaults and the
 * fields of the other cards never travel. A max-HP change also writes the current HP (see `withDerivedDefaults`).
 *
 * @param {Record<string, unknown>} pj the character as loaded
 * @param {Record<string, unknown>} draft the modal's state
 * @returns {Record<string, unknown>}
 */
export function buildSessionPjPatch(pj, draft) {
  const flat = coerceSessionPj(draft)
  return withDerivedDefaults(changedPjFields(coerceSessionPj(pj), flat), flat)
}
