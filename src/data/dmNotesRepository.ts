import { DM_NOTES_COLUMNS, join, type DmNotesType } from './columns'
import { DataError, unwrap, unwrapWrite } from './errors'
import { fromTable } from './loose'
import type { DmNotesFields } from './mappers'
import { pagedList } from './pagedList'
import type { Db } from './types'
import { throwZeroRows } from './zeroRows'

export interface DmNotesRow {
  id: number
  campaign_id: string
  entity_type: DmNotesType
  entity_id: number
  notas: string
  secreto: string
  ganchos: string
  created_at: string
  updated_at: string
}

const SELECT = join(DM_NOTES_COLUMNS)

/**
 * DM-private fields (`notas`, `secreto`, `ganchos`) of entities. RLS: DM only, every operation;
 * the table is not published to Realtime, so these are fetched on demand.
 */
export function createDmNotesRepository(client: Db) {
  return {
    async list(campaignId: string): Promise<DmNotesRow[]> {
      return pagedList<DmNotesRow>(
        () => fromTable(client, 'entity_dm_notes').select(SELECT).eq('campaign_id', campaignId).order('id', { ascending: true }),
        'entity_dm_notes',
      )
    },

    async get(type: DmNotesType, entityId: number): Promise<DmNotesRow | null> {
      return unwrap<DmNotesRow | null>(
        await fromTable(client, 'entity_dm_notes')
          .select(SELECT)
          .eq('entity_type', type)
          .eq('entity_id', entityId)
          .maybeSingle(),
      )
    },

    /** Upserts only the provided fields; the others keep their stored value (or '' on first write). */
    async upsert(campaignId: string, type: DmNotesType, entityId: number, fields: DmNotesFields): Promise<DmNotesRow> {
      return unwrapWrite<DmNotesRow>(
        await fromTable(client, 'entity_dm_notes')
          .upsert(
            { campaign_id: campaignId, entity_type: type, entity_id: entityId, ...fields },
            { onConflict: 'entity_type,entity_id' },
          )
          .select(SELECT)
          .single(),
      )
    },

    /**
     * Idempotent: a note that is already gone (never existed, or a retried delete that the server had
     * already committed) is success. A note that still exists but could not be deleted is `permission`.
     */
    async remove(type: DmNotesType, entityId: number): Promise<void> {
      const rows = unwrap<unknown[]>(
        await fromTable(client, 'entity_dm_notes').delete().eq('entity_type', type).eq('entity_id', entityId).select('id'),
      )
      if (rows.length > 0) return
      try {
        await throwZeroRows(client, 'entity_dm_notes', { entity_type: type, entity_id: entityId }, `dm notes ${type}/${entityId}`)
      } catch (e) {
        if (e instanceof DataError && e.kind === 'not_found') return
        throw e
      }
    },
  }
}

export type DmNotesRepository = ReturnType<typeof createDmNotesRepository>
