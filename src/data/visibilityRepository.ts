import type { EntityTable } from './columns'
import { unwrap } from './errors'
import type { Db } from './types'

/**
 * `visible_to` (character ids that may see a `secreto` row) is not readable or writable through
 * table access. The DM reads and writes it through two SECURITY DEFINER RPCs. Max 1000 ids per call.
 */
/** Server-side limit of get_entity_visibility / set_entity_visibility. */
export const MAX_IDS_PER_CALL = 1000

export function createVisibilityRepository(client: Db) {
  return {
    /** DM only. Returns `{ [entityId]: characterIds }` for the ids found in campaigns the caller DMs. */
    async getVisibility(type: EntityTable, ids: number[]): Promise<Record<number, number[]>> {
      const result: Record<number, number[]> = {}
      // the RPC accepts at most MAX_IDS_PER_CALL ids: chunk and merge
      for (let i = 0; i < ids.length; i += MAX_IDS_PER_CALL) {
        const rows = unwrap(
          await client.rpc('get_entity_visibility', { p_entity_type: type, p_ids: ids.slice(i, i + MAX_IDS_PER_CALL) }),
        )
        for (const r of rows ?? []) result[r.id] = r.visible_to
      }
      return result
    },

    /** DM only. Every id must be a character (pjs) of the entity's campaign. Returns the stored list. */
    async setVisibility(type: EntityTable, id: number, characterIds: number[]): Promise<number[]> {
      const stored = unwrap(
        await client.rpc('set_entity_visibility', {
          p_entity_type: type,
          p_id: id,
          p_visible_to: characterIds,
        }),
      )
      return stored ?? []
    },
  }
}

export type VisibilityRepository = ReturnType<typeof createVisibilityRepository>
