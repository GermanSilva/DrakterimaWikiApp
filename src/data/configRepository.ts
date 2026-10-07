import { CAMPAIGN_CONFIG_COLUMNS, join } from './columns'
import { ConflictError, DataError, unwrap, unwrapWrite } from './errors'
import { fromTable } from './loose'
import type { Db } from './types'

export interface CampaignConfig {
  campaign_id: string
  key: string
  value: Record<string, unknown>
  visibility: 'members' | 'dm'
  updated_at: string
}

const SELECT = join(CAMPAIGN_CONFIG_COLUMNS)
const MAX_ATTEMPTS = 3

/**
 * Per-campaign config documents keyed by `key` ('loteria' readable by members, 'session_screen'
 * DM-only). Writes are DM-only (RLS).
 */
export function createConfigRepository(client: Db) {
  async function get(campaignId: string, key: string): Promise<CampaignConfig | null> {
    return unwrap<CampaignConfig | null>(
      await fromTable(client, 'campaign_config').select(SELECT).eq('campaign_id', campaignId).eq('key', key).maybeSingle(),
    )
  }

  return {
    get,

    /** Replaces the whole value document (last writer wins). */
    async set(
      campaignId: string,
      key: string,
      value: Record<string, unknown>,
      visibility: 'members' | 'dm' = 'members',
    ): Promise<CampaignConfig> {
      return unwrapWrite<CampaignConfig>(
        await fromTable(client, 'campaign_config')
          .upsert({ campaign_id: campaignId, key, value, visibility }, { onConflict: 'campaign_id,key' })
          .select(SELECT)
          .single(),
      )
    },

    /**
     * Shallow-merges top-level keys into the stored value, guarded by `updated_at` and retried on
     * a concurrent change (nested objects are replaced whole, not deep-merged). `visibility` only
     * applies when the row does not exist yet.
     *
     * `base` is the version the caller's patch was computed from: `updated_at` of the row it read, or `null` when it
     * read none. When the stored row is not at that version the patch is NOT applied and a `ConflictError` is thrown
     * (no retry: the caller's view is stale, merging blindly would lose the other writer's whole-key values, e.g. a
     * reordered list). Omitted: the unguarded merge-and-retry above.
     */
    async patch(
      campaignId: string,
      key: string,
      patch: Record<string, unknown>,
      visibility: 'members' | 'dm' = 'members',
      base?: string | null,
    ): Promise<CampaignConfig> {
      const guarded = base !== undefined
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const current = await get(campaignId, key)
        if (guarded && (current?.updated_at ?? null) !== base) throw new ConflictError()
        if (!current) {
          const res = await fromTable(client, 'campaign_config')
            .insert({ campaign_id: campaignId, key, value: patch, visibility })
            .select(SELECT)
            .single()
          if (res.error?.code === '23505') {
            if (guarded) throw new ConflictError() // someone created it first: our view (no row) is stale
            continue // re-read and merge
          }
          return unwrapWrite<CampaignConfig>(res)
        }
        const row = unwrap<CampaignConfig | null>(
          await fromTable(client, 'campaign_config')
            .update({ value: { ...current.value, ...patch } })
            .eq('campaign_id', campaignId)
            .eq('key', key)
            .eq('updated_at', current.updated_at)
            .select(SELECT)
            .maybeSingle(),
        )
        if (row) return row
        const latest = await get(campaignId, key)
        if (!latest) throw new DataError('not_found', `campaign_config/${key}: not found`)
        if (latest.updated_at === current.updated_at) {
          throw new DataError('permission', `campaign_config/${key}: update affected no rows (not permitted)`)
        }
        if (guarded) throw new ConflictError() // changed between our read and our write
      }
      throw new ConflictError()
    },
  }
}

export type ConfigRepository = ReturnType<typeof createConfigRepository>
