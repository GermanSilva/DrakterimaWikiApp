import { SECTION_FIELDS } from '../pages/pj/pjConstants'

/**
 * What a player may change on the character they own. This mirrors `guard_pj_player_update()`
 * (supabase/migrations/20261006120200_campaign_hub_security.sql, `allowed_columns` / `allowed_data_keys`):
 * anything else makes the database reject the whole update with 42501. `pjOwnerFields.test.ts` compares these
 * lists with the migration, so they cannot drift apart silently.
 *
 * The UI shows an owner only these fields and `pickOwnerPatch` filters the payload too, so a form bug can
 * never turn into a rejected save (or into an escalation attempt that only the server stops).
 */

/** Promoted columns an owner may write (nivel, estado, owner_id, monedas, ... are DM only). */
export const OWNER_COLUMNS = ['nombre', 'jugador', 'clase', 'raza', 'region', 'imagen_url'] as const

/** `data` keys an owner may write (identity, looks, personality, narrative, campaign custom fields). */
export const OWNER_DATA_KEYS = [
  'trasfondo_dnd',
  'alineamiento',
  'edad',
  'altura',
  'peso',
  'ojos',
  'piel',
  'pelo',
  'apariencia',
  'personalidad',
  'ideales',
  'vinculos',
  'defectos',
  'trasfondo',
  'motivo',
  'custom_fields',
] as const

/** `sections_updated` (unread metadata) is writable by the owner too: the guard lists it. */
export const OWNER_META_COLUMNS = ['sections_updated'] as const

/**
 * Sections whose unread stamp may be written into `pjs.sections_updated` (the database accepts exactly these
 * as NEW keys from a non-DM). 'dm' is not one of them: the DM-notes dot comes from `entity_dm_notes.updated_at`
 * (DM only), so no member can learn when the DM edited a note. `pjOwnerFields.test.ts` compares this with the migration.
 */
export const STAMPABLE_SECTIONS: readonly string[] = [...Object.keys(SECTION_FIELDS).filter((k) => k !== 'dm'), 'general']

const ALLOWED: ReadonlySet<string> = new Set([...OWNER_COLUMNS, ...OWNER_DATA_KEYS, ...OWNER_META_COLUMNS])

export const isOwnerEditable = (key: string): boolean => ALLOWED.has(key)

/** The part of a patch an owner is allowed to send (everything else is dropped, never sent). */
export function pickOwnerPatch(patch: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(patch).filter(([key]) => ALLOWED.has(key)))
}
