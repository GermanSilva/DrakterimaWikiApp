import { GAME_LOG_COLUMNS, GAME_POT_COLUMNS, join } from './columns'
import { unwrap } from './errors'
import { fromTable } from './loose'
import { pagedList } from './pagedList'
import type { Coins, Db } from './types'
import { throwZeroRows } from './zeroRows'

export interface LoteriaResult {
  roll: number
  prize: Coins
  prize_target: 'player' | 'pot'
}

export interface GamePot extends Coins {
  campaign_id: string
  updated_at: string
}

export interface GameLog {
  id: number
  campaign_id: string
  actor_type: 'player' | 'dm'
  character_id: number | null
  game: string
  play_date: string
  roll: number
  prize: Partial<Coins>
  prize_target: 'player' | 'pot'
  created_at: string
}

const POT_SELECT = join(GAME_POT_COLUMNS)
const LOG_SELECT = join(GAME_LOG_COLUMNS)

/**
 * Mini-games. The lottery roll is decided server-side by `play_loteria` (the UI animates to the
 * returned roll). Failures are DataErrors whose `reason` is the stable code: not_a_member,
 * character_required, not_your_character, dm_only (raised with 42501, kind 'permission') and
 * already_played_today, insufficient_pot, character_not_found (P0001, kind 'business').
 */
export function createGamesRepository(client: Db) {
  return {
    /** Players pass their character id; the DM passes none (the prize goes to the pot). */
    async playLoteria(campaignId: string, characterId?: number): Promise<LoteriaResult> {
      const args = characterId === undefined
        ? { p_campaign_id: campaignId }
        : { p_campaign_id: campaignId, p_character_id: characterId }
      return unwrap(await client.rpc('play_loteria', args)) as unknown as LoteriaResult
    },

    /** DM only: moves coins from the pot to a character; returns the updated pot. */
    async assignPotToCharacter(campaignId: string, characterId: number, coins: Partial<Coins>): Promise<GamePot> {
      return unwrap(
        await client.rpc('assign_pot_to_character', {
          p_campaign_id: campaignId,
          p_character_id: characterId,
          p_coins: coins,
        }),
      ) as unknown as GamePot
    },

    async getPot(campaignId: string): Promise<GamePot | null> {
      return unwrap<GamePot | null>(
        await fromTable(client, 'game_pot').select(POT_SELECT).eq('campaign_id', campaignId).maybeSingle(),
      )
    },

    /** DM sees all logs, a player the logs of their own characters (RLS). Newest first. */
    async listLogs(campaignId: string): Promise<GameLog[]> {
      return pagedList<GameLog>(
        () =>
          fromTable(client, 'game_logs')
            .select(LOG_SELECT)
            .eq('campaign_id', campaignId)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false }),
        'game_logs',
      )
    },

    /** DM only. */
    async removeLog(id: number): Promise<void> {
      const rows = unwrap<unknown[]>(await fromTable(client, 'game_logs').delete().eq('id', id).select('id'))
      if (rows.length === 0) await throwZeroRows(client, 'game_logs', { id }, `game_logs/${id}`)
    },
  }
}

export type GamesRepository = ReturnType<typeof createGamesRepository>
