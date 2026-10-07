import { WIKI_INDEX_COLUMNS, WIKI_TITLE_COLUMN, join, type WikiIndexTable } from './columns'
import { fromTable } from './loose'
import { pagedList } from './pagedList'
import type { TableSource } from './realtime'
import type { Db } from './types'

/** One row of the campaign wiki index: just enough to resolve a link, show a tooltip or fill the picker. */
export interface WikiIndexItem {
  id: number
  /** `nombre` or `titulo`, whichever the table uses ('' when empty). */
  title: string
  imagen_url: string | null
  estado: string
}

export interface WikiIndexRepository {
  readonly table: WikiIndexTable
  list(campaignId: string): Promise<WikiIndexItem[]>
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '')

/**
 * Maps a raw row (REST or Realtime payload) to an index item. Only the index columns are read, so a
 * Realtime payload that carries more (the whole row, `data`...) never widens what the index keeps.
 * Absent columns are skipped so the result can be merged onto a previous copy (UPDATE payloads).
 */
export function toWikiIndexItem(table: WikiIndexTable, row: Record<string, unknown>): WikiIndexItem {
  const item: Partial<WikiIndexItem> = { id: Number(row.id) }
  const titleColumn = WIKI_TITLE_COLUMN[table]
  if (titleColumn in row) item.title = text(row[titleColumn])
  if ('imagen_url' in row) item.imagen_url = typeof row.imagen_url === 'string' ? row.imagen_url : null
  if ('estado' in row) item.estado = text(row.estado) || 'publicado'
  return item as WikiIndexItem
}

/** Read-only, explicit-column listing of one wiki table (see WIKI_INDEX_COLUMNS). */
export function createWikiIndexRepository(client: Db, table: WikiIndexTable): WikiIndexRepository {
  const select = join(WIKI_INDEX_COLUMNS[table])
  return {
    table,
    async list(campaignId) {
      const rows = await pagedList<Record<string, unknown>>(
        () => fromTable(client, table).select(select).eq('campaign_id', campaignId).order('id', { ascending: true }),
        `${table} wiki index`,
      )
      return rows.map((row) => toWikiIndexItem(table, row))
    },
  }
}

/** Realtime source for useCampaignTable (same channel shape as the entity tables). */
export function wikiIndexSource(repo: WikiIndexRepository): TableSource<WikiIndexItem> {
  return {
    table: repo.table,
    list: (campaignId) => repo.list(campaignId),
    fromRow: (row) => toWikiIndexItem(repo.table, row),
    keyOfItem: (item) => String(item.id),
    keyOfRow: (row) => String(row.id),
  }
}
