import {
  PLAYER_AVAILABILITY_COLUMNS,
  PLAYER_AVAILABILITY_NULLABLE,
  PLAYER_AVAILABILITY_WRITE_COLUMNS,
  join,
} from './columns'
import { DataError, unwrap, unwrapWrite } from './errors'
import { fromTable } from './loose'
import { pagedList } from './pagedList'
import type { Db } from './types'
import { throwZeroRows } from './zeroRows'

/**
 * A player's availability. `campaign_id` null = general (applies to every campaign the user takes
 * part in); set = pinned to that one campaign.
 */
export interface PlayerAvailability {
  id: number
  user_id: string
  campaign_id: string | null
  tipo: 'personal' | 'no_disponible'
  fecha: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  hora_inicio: string | null
  hora_fin: string | null
  created_at: string
  updated_at: string
}

/** `user_id` is not part of the input: the server always assigns the caller. */
export type PlayerAvailabilityInput = Partial<
  Pick<PlayerAvailability, (typeof PLAYER_AVAILABILITY_WRITE_COLUMNS)[number]>
>

/**
 * A slot during which a participant of the asked campaign is booked by a session of ANOTHER
 * campaign. The other campaign is deliberately not identifiable.
 */
export interface BusySlot {
  user_id: string
  fecha_inicio: string
  fecha_fin: string
  hora_inicio: string
  hora_fin: string
}

const SELECT = join(PLAYER_AVAILABILITY_COLUMNS)

const nullable = new Set<string>(PLAYER_AVAILABILITY_NULLABLE)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Only the writable columns are ever sent ('' becomes NULL for the nullable ones). */
function writable(input: PlayerAvailabilityInput): Record<string, unknown> {
  return Object.fromEntries(
    PLAYER_AVAILABILITY_WRITE_COLUMNS.filter((k) => input[k] !== undefined).map((k) => [
      k,
      nullable.has(k) && input[k] === '' ? null : input[k],
    ]),
  )
}

export function createPlayerAvailabilityRepository(client: Db) {
  return {
    /**
     * Rows relevant to one campaign that the caller may see: general rows (campaign_id null) and rows
     * pinned to THIS campaign. Row-level security decides whose rows come back (the caller's own,
     * general rows of users who share a campaign with them, pinned rows of campaign members). A
     * general row of a user who only shares ANOTHER campaign with the caller can therefore appear;
     * callers that render a campaign calendar filter by that campaign's members.
     */
    async list(campaignId: string): Promise<PlayerAvailability[]> {
      // The id is interpolated into a PostgREST `or` filter: refuse anything that is not a uuid.
      if (!UUID.test(campaignId)) throw new DataError('validation', 'player_availability: invalid campaign id')
      return pagedList<PlayerAvailability>(
        () =>
          fromTable(client, 'player_availability')
            .select(SELECT)
            .or(`campaign_id.is.null,campaign_id.eq.${campaignId}`)
            .order('id', { ascending: true }),
        'player_availability',
      )
    },

    async create(input: PlayerAvailabilityInput): Promise<PlayerAvailability> {
      return unwrapWrite<PlayerAvailability>(
        await fromTable(client, 'player_availability').insert(writable(input)).select(SELECT).single(),
      )
    },

    async update(id: number, patch: PlayerAvailabilityInput): Promise<PlayerAvailability> {
      const row = unwrap<PlayerAvailability | null>(
        await fromTable(client, 'player_availability').update(writable(patch)).eq('id', id).select(SELECT).maybeSingle(),
      )
      if (!row) return throwZeroRows(client, 'player_availability', { id }, `player_availability/${id}`)
      return row
    },

    async remove(id: number): Promise<void> {
      const rows = unwrap<unknown[]>(await fromTable(client, 'player_availability').delete().eq('id', id).select('id'))
      if (rows.length === 0) await throwZeroRows(client, 'player_availability', { id }, `player_availability/${id}`)
    },

    /** Other campaigns' session slots that book the participants of `campaignId` (members only; 42501 otherwise). */
    async busySlots(campaignId: string): Promise<BusySlot[]> {
      return unwrap<BusySlot[] | null>(await client.rpc('campaign_busy_slots', { p_campaign_id: campaignId })) ?? []
    },
  }
}

export type PlayerAvailabilityRepository = ReturnType<typeof createPlayerAvailabilityRepository>
