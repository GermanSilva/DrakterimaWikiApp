import { DM_NOTES_TYPES, type DmNotesType, type EntityTable } from './columns'
import type { DmNotesRepository, DmNotesRow } from './dmNotesRepository'
import { DataError } from './errors'
import type { EntityRepository } from './entityRepository'
import { extractDmNotes, withoutDmNotes } from './mappers'
import type { FlatEntity } from './types'

export interface SaveEntityTarget {
  campaignId: string
  /** Omit to create; set to update (the flat object is then treated as a patch). */
  id?: number
  /** Optimistic version for updates, see UpdateOptions.base. */
  base?: Pick<FlatEntity, 'updated_at'> & Record<string, unknown>
}

export interface SavedEntity {
  entity: FlatEntity
  /** The stored DM notes row when any DM-private field was part of the form value, else null. */
  dmNotes: DmNotesRow | null
}

const isDmNotesType = (t: EntityTable): t is DmNotesType => (DM_NOTES_TYPES as readonly string[]).includes(t)

/**
 * Explicit write path for forms that mix public and DM-private fields (`notas`, `secreto`,
 * `ganchos`): writes the entity row without them, then upserts them into `entity_dm_notes`.
 *
 * Not atomic (two requests): if the notes write fails after the entity was saved, the error is
 * rethrown and the entity exists/updated; retrying with `id` set is safe (idempotent). Only the
 * DM can write notes, so call it from DM forms only. Entity types without DM notes
 * (map_points, homebrew_rules) reject DM-private fields with a validation error.
 */
export async function saveEntityWithDmNotes(
  repo: EntityRepository,
  dmNotesRepo: DmNotesRepository,
  target: SaveEntityTarget,
  flat: Record<string, unknown>,
): Promise<SavedEntity> {
  const notes = extractDmNotes(flat)
  const hasNotes = Object.keys(notes).length > 0
  if (hasNotes && !isDmNotesType(repo.table)) {
    throw new DataError('validation', `${repo.table} has no DM-private fields`)
  }
  const publicPart = withoutDmNotes(flat)
  const entity =
    target.id === undefined
      ? await repo.create(target.campaignId, publicPart)
      : await repo.update(target.id, publicPart, { base: target.base })

  if (!hasNotes || !isDmNotesType(repo.table)) return { entity, dmNotes: null }
  const row = await dmNotesRepo.upsert(target.campaignId, repo.table, entity.id, notes)
  return { entity, dmNotes: row }
}
