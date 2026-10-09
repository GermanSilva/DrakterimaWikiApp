import { ENTITY_TABLES, type Campaign, type DataLayer, type EntityTable, type FlatEntity } from '../../../data'

export const EXPORT_FORMAT = 'drakterima-campaign-export'
export const EXPORT_VERSION = 1

/** Config documents included in the export (`session_screen` is DM-only, `loteria` is visible to members). */
const CONFIG_KEYS = ['loteria', 'session_screen'] as const

/** An export part failed; `part` names it so the message can tell the DM what went wrong. */
export class ExportError extends Error {
  readonly part: string
  constructor(part: string, cause: unknown) {
    super(`Export failed while reading ${part}`, { cause })
    this.name = 'ExportError'
    this.part = part
  }
}

async function part<T>(name: string, read: () => Promise<T>): Promise<T> {
  try {
    return await read()
  } catch (e) {
    throw new ExportError(name, e)
  }
}

export interface CampaignExport {
  format: typeof EXPORT_FORMAT
  version: typeof EXPORT_VERSION
  exportedAt: string
  campaign: Pick<Campaign, 'id' | 'slug' | 'name' | 'system' | 'branding' | 'regions' | 'character_custom_fields' | 'settings'>
  entities: Record<EntityTable, FlatEntity[]>
  /** `visible_to` of the `secreto` entities: table -> entity id -> character ids. */
  visibility: Partial<Record<EntityTable, Record<number, number[]>>>
  dmNotes: Awaited<ReturnType<DataLayer['dmNotes']['list']>>
  playerNotes: Awaited<ReturnType<DataLayer['playerNotes']['list']>>
  config: Record<string, { value: Record<string, unknown>; visibility: string; updated_at: string } | null>
  games: {
    pot: Awaited<ReturnType<DataLayer['games']['getPot']>>
    logs: Awaited<ReturnType<DataLayer['games']['listLogs']>>
  }
}

/**
 * Everything the DM can read about the campaign, through the existing repositories (so RLS and the
 * explicit column lists still apply). Deliberately NOT included: members, invites (their codes are
 * credentials), profiles, auth data and player availability. Any part that cannot be read aborts the
 * whole export with an `ExportError`: a silently partial backup would be worse than none.
 */
export async function buildCampaignExport(layer: DataLayer, campaign: Campaign, now: Date = new Date()): Promise<CampaignExport> {
  const campaignId = campaign.id
  const [lists, dmNotes, playerNotes, configRows, pot, logs] = await Promise.all([
    Promise.all(ENTITY_TABLES.map((table) => part(table, () => layer.entity(table).list(campaignId)))),
    part('notas del DM', () => layer.dmNotes.list(campaignId)),
    part('notas de jugadores', () => layer.playerNotes.list(campaignId)),
    Promise.all(CONFIG_KEYS.map((key) => part(`configuración ${key}`, () => layer.config.get(campaignId, key)))),
    part('pozo', () => layer.games.getPot(campaignId)),
    part('tiradas', () => layer.games.listLogs(campaignId)),
  ])

  const entities = Object.fromEntries(ENTITY_TABLES.map((table, i) => [table, lists[i]])) as Record<EntityTable, FlatEntity[]>

  const visibility: CampaignExport['visibility'] = {}
  await Promise.all(
    ENTITY_TABLES.map(async (table) => {
      const secretIds = entities[table].filter((e) => e.estado === 'secreto').map((e) => e.id)
      if (secretIds.length === 0) return
      visibility[table] = await part(`visibilidad de ${table}`, () => layer.visibility.getVisibility(table, secretIds))
    }),
  )

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    campaign: {
      id: campaign.id,
      slug: campaign.slug,
      name: campaign.name,
      system: campaign.system,
      branding: campaign.branding,
      regions: campaign.regions,
      character_custom_fields: campaign.character_custom_fields,
      settings: campaign.settings,
    },
    entities,
    visibility,
    dmNotes,
    playerNotes,
    config: Object.fromEntries(
      CONFIG_KEYS.map((key, i) => {
        const row = configRows[i]
        return [key, row ? { value: row.value, visibility: row.visibility, updated_at: row.updated_at } : null]
      }),
    ),
    games: { pot, logs },
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** `<slug>-YYYY-MM-DD.json`, with the DM's local date. */
export function exportFilename(slug: string, now: Date = new Date()): string {
  return `${slug}-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`
}

/** Hands `data` to the browser as a file download. */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // not synchronously: some browsers start the download after the click handler returns
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
