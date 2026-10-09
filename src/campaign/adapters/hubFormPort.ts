import type { WikiIndexItem } from '../../data'
import type { CharacterField, FormPort, Region, SesionRef } from '../../ports'

/** Shown when a campaign has no regions configured yet (H10 adds the editor): forms still need a value. */
export const FALLBACK_REGIONS: Region[] = [{ key: 'otro', label: 'Otro' }]

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

type RawEntry = Record<string, unknown>

export interface ReadRegions {
  /** Valid regions, in stored order (empty when none is valid: no synthetic fallback here). */
  regions: Region[]
  /** The stored object of each valid region, by key. */
  raw: Map<string, RawEntry>
  /** Stored entries the parser rejected (malformed or duplicate key), verbatim. */
  rejected: unknown[]
}

/** Parses `campaigns.regions` without the synthetic fallback and reports what it could not read. */
export function readRegions(raw: unknown): ReadRegions {
  const out: ReadRegions = { regions: [], raw: new Map(), rejected: [] }
  if (!Array.isArray(raw)) return out
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      out.rejected.push(entry)
      continue
    }
    const { key, label, color } = entry as RawEntry
    if (typeof key !== 'string' || key.trim() === '' || typeof label !== 'string' || label.trim() === '' || out.raw.has(key)) {
      out.rejected.push(entry)
      continue
    }
    out.raw.set(key, entry as RawEntry)
    out.regions.push({ key, label, ...(typeof color === 'string' && HEX_COLOR.test(color) ? { color } : {}) })
  }
  return out
}

/**
 * `campaigns.regions` is jsonb written by the DM: only entries with a non-empty string key and label
 * survive, a color only when it is exactly `#rrggbb` (it ends up in inline styles), keys are unique.
 */
export function parseRegions(raw: unknown): Region[] {
  const { regions } = readRegions(raw)
  return regions.length > 0 ? regions : FALLBACK_REGIONS
}

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export interface ReadCharacterFields {
  fields: CharacterField[]
  /** The stored object of each valid field, by key. */
  raw: Map<string, RawEntry>
  /** Stored entries the parser rejected (malformed, unsafe or duplicate key), verbatim. */
  rejected: unknown[]
}

/** Parses `campaigns.character_custom_fields` and reports what it could not read. */
export function readCharacterFields(raw: unknown): ReadCharacterFields {
  const out: ReadCharacterFields = { fields: [], raw: new Map(), rejected: [] }
  if (!Array.isArray(raw)) return out
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      out.rejected.push(entry)
      continue
    }
    const { key, label } = entry as RawEntry
    if (typeof key !== 'string' || key.trim() === '' || UNSAFE_KEYS.has(key) || out.raw.has(key)) {
      out.rejected.push(entry)
      continue
    }
    out.raw.set(key, entry as RawEntry)
    out.fields.push({ key, label: typeof label === 'string' && label.trim() !== '' ? label : key })
  }
  return out
}

/**
 * `campaigns.character_custom_fields` is jsonb written by the DM: `[{ key, label, type }]`. Only entries with
 * a non-empty string key (unique, never an Object.prototype name) survive; the label falls back to the key.
 * Every field is edited as text.
 */
export function parseCharacterFields(raw: unknown): CharacterField[] {
  return readCharacterFields(raw).fields
}

export interface HubFormPortDeps {
  isDM: boolean
  regions: unknown
  /** `campaigns.character_custom_fields`. */
  characterFields?: unknown
  /** Characters the signed-in user owns in this campaign. */
  myCharacterIds?: readonly number[]
  /** The pjs of the wiki index (id + nombre): the "visible para" checklist. */
  pjs: readonly WikiIndexItem[]
  /** Only the session forms need it; the layout-level port passes none. */
  sesiones?: readonly SesionRef[]
}

export function createHubFormPort({ isDM, regions, pjs, sesiones = [], characterFields, myCharacterIds = [] }: HubFormPortDeps): FormPort {
  return {
    isDM,
    ownCharacterIds: isDM ? [] : [...myCharacterIds],
    characterFields: parseCharacterFields(characterFields),
    playerAccess: false,
    regions: parseRegions(regions),
    characters: pjs.map((pj) => ({ id: pj.id, nombre: pj.title })),
    sesiones: [...sesiones],
  }
}
