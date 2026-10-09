import type { CharacterField, Region } from '../../../ports'
import { readCharacterFields, readRegions } from '../../adapters/hubFormPort'

/**
 * `campaigns.regions` and `campaigns.character_custom_fields` are replaced as whole arrays, but the editors only
 * own a few properties of each entry. These merges write the editor's values over the entry as stored (matched by
 * key), so unknown properties and non-text types survive, and re-append the entries the parsers could not read,
 * verbatim and at the end, instead of silently deleting them.
 *
 * One exception: a rejected entry that reuses the key of a valid stored entry the editor is removing (or replacing)
 * is dropped. Kept, it would become the readable entry on the next read and bypass the in-use guard that the
 * removal went through. Rejected entries that are unreadable for any other reason are always kept.
 */

const isObject = (entry: unknown): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null && !Array.isArray(entry)

/** Rejected entries to keep: drops those whose key belongs to a valid stored entry that is no longer in the edit. */
function keepRejected(rejected: readonly unknown[], storedKeys: ReadonlySet<string>, editedKeys: ReadonlySet<string>): unknown[] {
  return rejected.filter((entry) => {
    if (!isObject(entry) || typeof entry.key !== 'string') return true
    return !(storedKeys.has(entry.key) && !editedKeys.has(entry.key))
  })
}

/** Regions to store: the edited ones merged over their stored objects, then the unreadable stored entries. */
export function mergeRegions(storedRaw: unknown, edited: readonly Region[]): unknown[] {
  const { raw, rejected } = readRegions(storedRaw)
  const merged = edited.map((region) => {
    const base = { ...raw.get(region.key) }
    delete base.color // the colour is the editor's: it comes back only when the DM left one
    return { ...base, key: region.key, label: region.label, ...(region.color ? { color: region.color } : {}) }
  })
  return [...merged, ...keepRejected(rejected, new Set(raw.keys()), new Set(edited.map((r) => r.key)))]
}

/** Character fields to store: edited key/label over the stored object (its type is kept), then the unreadable ones. */
export function mergeCharacterFields(storedRaw: unknown, edited: readonly Pick<CharacterField, 'key' | 'label'>[]): unknown[] {
  const { raw, rejected } = readCharacterFields(storedRaw)
  const merged = edited.map((field) => {
    const stored = raw.get(field.key)
    return { ...stored, key: field.key, label: field.label, type: stored && 'type' in stored ? stored.type : 'text' }
  })
  return [...merged, ...keepRejected(rejected, new Set(raw.keys()), new Set(edited.map((f) => f.key)))]
}

/** How many stored entries the editors cannot read (kept untouched on save). */
export const unreadableRegions = (storedRaw: unknown): number => readRegions(storedRaw).rejected.length
export const unreadableCharacterFields = (storedRaw: unknown): number => readCharacterFields(storedRaw).rejected.length
