import { PLAYER_NOTE_COLUMNS, join } from './columns'
import { unwrap, unwrapWrite } from './errors'
import { fromTable } from './loose'
import { pagedList } from './pagedList'
import type { Db } from './types'
import { throwZeroRows } from './zeroRows'

export type PlayerNoteType = 'sesiones' | 'pjs' | 'pnjs' | 'lugares' | 'facciones' | 'lore' | 'items'

export interface PlayerNote {
  campaign_id: string
  user_id: string
  entity_type: PlayerNoteType
  entity_id: number
  character_id: number | null
  text: string
  created_at: string
  updated_at: string
}

export interface PlayerNoteInput {
  campaignId: string
  entityType: PlayerNoteType
  entityId: number
  text: string
  /** PJ shown next to the note (must be one of the author's characters; informational). */
  characterId?: number | null
  /** Author. Omit to write as the signed-in user; the DM passes it to correct a player's note. */
  userId?: string
}

const SELECT = join(PLAYER_NOTE_COLUMNS)
const CONFLICT = 'user_id,campaign_id,entity_type,entity_id'

/** Successor of `savePlayerNote`. RLS: authors see their own notes, the DM sees and edits all. */
export function createPlayerNotesRepository(client: Db) {
  return {
    async list(campaignId: string): Promise<PlayerNote[]> {
      return pagedList<PlayerNote>(
        () =>
          fromTable(client, 'player_notes')
            .select(SELECT)
            .eq('campaign_id', campaignId)
            .order('entity_type', { ascending: true })
            .order('entity_id', { ascending: true })
            .order('user_id', { ascending: true }),
        'player_notes',
      )
    },

    async upsert(input: PlayerNoteInput): Promise<PlayerNote> {
      const row: Record<string, unknown> = {
        campaign_id: input.campaignId,
        entity_type: input.entityType,
        entity_id: input.entityId,
        text: input.text,
      }
      if (input.characterId !== undefined) row.character_id = input.characterId
      if (input.userId !== undefined) row.user_id = input.userId
      return unwrapWrite<PlayerNote>(
        await fromTable(client, 'player_notes').upsert(row, { onConflict: CONFLICT }).select(SELECT).single(),
      )
    },

    async remove(campaignId: string, userId: string, entityType: PlayerNoteType, entityId: number): Promise<void> {
      const rows = unwrap<unknown[]>(
        await fromTable(client, 'player_notes')
          .delete()
          .eq('campaign_id', campaignId)
          .eq('user_id', userId)
          .eq('entity_type', entityType)
          .eq('entity_id', entityId)
          .select('entity_id'),
      )
      if (rows.length === 0) {
        await throwZeroRows(
          client,
          'player_notes',
          { campaign_id: campaignId, user_id: userId, entity_type: entityType, entity_id: entityId },
          'player note',
        )
      }
    },
  }
}

export type PlayerNotesRepository = ReturnType<typeof createPlayerNotesRepository>
