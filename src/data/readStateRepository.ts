import { READ_STATE_COLUMNS, join } from './columns'
import { unwrap } from './errors'
import { fromTable } from './loose'
import { pagedList } from './pagedList'
import type { Db } from './types'

export type ReadStateType = 'sesiones' | 'pjs' | 'pnjs' | 'lugares' | 'facciones' | 'lore' | 'items'

export interface ReadState {
  user_id: string
  campaign_id: string
  entity_type: ReadStateType
  entity_id: number
  /** '' for a whole entity, a PJ section key ('stats', 'equipo', ...) otherwise. */
  section: string
  seen_at: string
}

const SELECT = join(READ_STATE_COLUMNS)
const CONFLICT = 'user_id,campaign_id,entity_type,entity_id,section'

/** Per-user unread tracking. RLS: strictly the caller's own rows. */
export function createReadStateRepository(client: Db) {
  return {
    /** The caller's rows in a campaign (RLS scopes them to the caller). */
    async list(campaignId: string): Promise<ReadState[]> {
      return pagedList<ReadState>(
        () =>
          fromTable(client, 'read_state')
            .select(SELECT)
            .eq('campaign_id', campaignId)
            .order('entity_type', { ascending: true })
            .order('entity_id', { ascending: true })
            .order('section', { ascending: true }),
        'read_state',
      )
    },

    /** `seen_at` uses the client clock, like the `sections_updated` values it is compared with. */
    async markSeen(
      campaignId: string,
      entityType: ReadStateType,
      entityId: number,
      section = '',
      seenAt: Date = new Date(),
    ): Promise<void> {
      unwrap(
        await fromTable(client, 'read_state').upsert(
          {
            campaign_id: campaignId,
            entity_type: entityType,
            entity_id: entityId,
            section,
            seen_at: seenAt.toISOString(),
          },
          { onConflict: CONFLICT },
        ),
      )
    },
  }
}

export type ReadStateRepository = ReturnType<typeof createReadStateRepository>
