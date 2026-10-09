import { DISPONIBILIDAD_COLUMNS, DISPONIBILIDAD_NULLABLE, DISPONIBILIDAD_WRITE_COLUMNS, join } from './columns'
import { unwrap, unwrapWrite } from './errors'
import { fromTable } from './loose'
import { pagedList } from './pagedList'
import type { Db } from './types'
import { throwZeroRows } from './zeroRows'

/** A DM-created session slot. Personal availability lives in player_availability. */
export interface Disponibilidad {
  id: number
  campaign_id: string
  tipo: 'sesion'
  fecha_inicio: string | null
  fecha_fin: string | null
  hora_inicio: string | null
  hora_fin: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type DisponibilidadInput = Partial<
  Pick<Disponibilidad, (typeof DISPONIBILIDAD_WRITE_COLUMNS)[number]>
>

const SELECT = join(DISPONIBILIDAD_COLUMNS)

const nullable = new Set<string>(DISPONIBILIDAD_NULLABLE)

/** Only the writable columns are ever sent ('' becomes NULL for the nullable ones); no jsonb `data`. */
function writable(input: DisponibilidadInput): Record<string, unknown> {
  return Object.fromEntries(
    DISPONIBILIDAD_WRITE_COLUMNS.filter((k) => input[k] !== undefined).map((k) => [k, nullable.has(k) && input[k] === '' ? null : input[k]]),
  )
}

export function createDisponibilidadRepository(client: Db) {
  return {
    async list(campaignId: string): Promise<Disponibilidad[]> {
      return pagedList<Disponibilidad>(
        () =>
          fromTable(client, 'disponibilidad').select(SELECT).eq('campaign_id', campaignId).order('id', { ascending: true }),
        'disponibilidad',
      )
    },

    async create(campaignId: string, input: DisponibilidadInput): Promise<Disponibilidad> {
      return unwrapWrite<Disponibilidad>(
        await fromTable(client, 'disponibilidad')
          .insert({ ...writable(input), campaign_id: campaignId })
          .select(SELECT)
          .single(),
      )
    },

    async update(id: number, patch: DisponibilidadInput): Promise<Disponibilidad> {
      const row = unwrap<Disponibilidad | null>(
        await fromTable(client, 'disponibilidad').update(writable(patch)).eq('id', id).select(SELECT).maybeSingle(),
      )
      if (!row) return throwZeroRows(client, 'disponibilidad', { id }, `disponibilidad/${id}`)
      return row
    },

    async remove(id: number): Promise<void> {
      const rows = unwrap<unknown[]>(await fromTable(client, 'disponibilidad').delete().eq('id', id).select('id'))
      if (rows.length === 0) await throwZeroRows(client, 'disponibilidad', { id }, `disponibilidad/${id}`)
    },
  }
}

export type DisponibilidadRepository = ReturnType<typeof createDisponibilidadRepository>
