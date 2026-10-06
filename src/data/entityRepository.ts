import { ENTITY_SELECT, MERGED_OBJECT_COLUMNS, type EntityTable } from './columns'
import { ConflictError, DataError, unwrap, unwrapWrite } from './errors'
import { fromTable } from './loose'
import { assertNoDmNotes, fromRow, splitFlat, toInsertRow, type EntityRow } from './mappers'
import { pagedList } from './pagedList'
import type { Db, FlatEntity } from './types'
import { throwZeroRows } from './zeroRows'

const MAX_GUARDED_ATTEMPTS = 3

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export interface UpdateOptions {
  /**
   * The entity the caller edited (typically from realtime state). ONLY its `updated_at` is used:
   * as the optimistic version. If the row changed since, the call throws ConflictError instead of
   * overwriting. Its field values are never written: the merge base is always the current server
   * `data`, so client-only keys on the flat object cannot leak into the row. Without `base` the
   * repository reads the current version itself and retries on a concurrent change.
   */
  base?: Pick<FlatEntity, 'updated_at'> & Record<string, unknown>
}

export interface EntityRepository {
  readonly table: EntityTable
  list(campaignId: string): Promise<FlatEntity[]>
  get(id: number): Promise<FlatEntity | null>
  create(campaignId: string, flat: Record<string, unknown>): Promise<FlatEntity>
  update(id: number, patch: Record<string, unknown>, options?: UpdateOptions): Promise<FlatEntity>
  remove(id: number): Promise<void>
}

type Version = { updated_at: string; current: Record<string, unknown> }

/**
 * Generic repository for the 10 wiki entity tables.
 *
 * Patch semantics (no whole-row overwrite):
 *  - Only the promoted columns present in the patch are sent.
 *  - `data` (and the whole-object jsonb columns in MERGED_OBJECT_COLUMNS, e.g. pjs.monedas) can
 *    only be replaced as a unit by PostgREST. When a patch touches them the repository reads the
 *    CURRENT server value, shallow-merges only the patched keys onto it and writes it guarded by
 *    `updated_at` (optimistic concurrency). A concurrent edit therefore surfaces as a retry (no
 *    `base`) or a ConflictError (with `base`), never as a silent loss. Plain-column patches are
 *    last-writer-wins per column.
 *  - A patch key set to `undefined` is ignored; to clear a `data` key set it to `null`.
 *  - DM-private keys (`notas`, `secreto`, `ganchos`) are rejected with a validation error (use
 *    saveEntityWithDmNotes); `visible_to` is stripped (use the visibility RPCs).
 */
export function createEntityRepository(client: Db, table: EntityTable): EntityRepository {
  const select = ENTITY_SELECT[table]
  const mergedColumns = MERGED_OBJECT_COLUMNS[table] ?? []
  const toFlat = (row: unknown) => fromRow(table, row as EntityRow)

  async function readVersion(id: number, columns: string[]): Promise<Version | null> {
    const cols = ['updated_at', ...columns].join(', ')
    const row = unwrap<Record<string, unknown> | null>(
      await fromTable(client, table).select(cols).eq('id', id).maybeSingle(),
    )
    return row ? { updated_at: row.updated_at as string, current: row } : null
  }

  const repo: EntityRepository = {
    table,

    list(campaignId) {
      return pagedList<unknown>(
        () => fromTable(client, table).select(select).eq('campaign_id', campaignId).order('id', { ascending: true }),
        table,
      ).then((rows) => rows.map(toFlat))
    },

    async get(id) {
      const row = unwrap<unknown>(await fromTable(client, table).select(select).eq('id', id).maybeSingle())
      return row ? toFlat(row) : null
    },

    async create(campaignId, flat) {
      const payload = toInsertRow(table, campaignId, flat) // validates before any request
      const row = unwrapWrite<unknown>(await fromTable(client, table).insert(payload).select(select).single())
      return toFlat(row)
    },

    async update(id, patch, options = {}) {
      assertNoDmNotes(patch)
      const { columns, data: dataPatch } = splitFlat(table, patch)
      const touchesData = Object.keys(dataPatch).length > 0
      const mergedPatched = mergedColumns.filter((c) => isPlainObject(columns[c]))
      const guarded = touchesData || mergedPatched.length > 0

      if (!guarded) {
        if (Object.keys(columns).length === 0) {
          const current = await repo.get(id)
          if (!current) throw new DataError('not_found', `${table}/${id}: not found`)
          return current
        }
        const row = unwrap<unknown>(await fromTable(client, table).update(columns).eq('id', id).select(select).maybeSingle())
        if (!row) return throwZeroRows(client, table, { id }, `${table}/${id}`)
        return toFlat(row)
      }

      const callerVersion = typeof options.base?.updated_at === 'string' ? options.base.updated_at : null
      const readCols = [...(touchesData ? ['data'] : []), ...mergedPatched]

      for (let attempt = 0; attempt < MAX_GUARDED_ATTEMPTS; attempt++) {
        const server = await readVersion(id, readCols)
        if (!server) throw new DataError('not_found', `${table}/${id}: not found`)
        const guard = attempt === 0 && callerVersion ? callerVersion : server.updated_at
        if (guard !== server.updated_at) throw new ConflictError() // the caller's copy is stale

        const payload: Record<string, unknown> = { ...columns }
        for (const col of mergedPatched) {
          const stored = server.current[col]
          payload[col] = { ...(isPlainObject(stored) ? stored : {}), ...(columns[col] as Record<string, unknown>) }
        }
        if (touchesData) {
          const stored = server.current.data
          payload.data = { ...(isPlainObject(stored) ? stored : {}), ...dataPatch }
        }

        const row = unwrap<unknown>(
          await fromTable(client, table)
            .update(payload)
            .eq('id', id)
            .eq('updated_at', guard)
            .select(select)
            .maybeSingle(),
        )
        if (row) return toFlat(row)

        // Zero rows: RLS denial (row visible but not writable) or a concurrent edit.
        const after = await readVersion(id, [])
        if (!after) throw new DataError('not_found', `${table}/${id}: not found`)
        if (after.updated_at === guard) {
          throw new DataError('permission', `${table}/${id}: update affected no rows (not permitted)`)
        }
        if (callerVersion) throw new ConflictError()
        // changed under us: loop re-reads and re-merges only our keys onto the fresh values
      }
      throw new ConflictError()
    },

    async remove(id) {
      const rows = unwrap<unknown[]>(await fromTable(client, table).delete().eq('id', id).select('id'))
      if (rows.length === 0) await throwZeroRows(client, table, { id }, `${table}/${id}`)
    },
  }
  return repo
}
