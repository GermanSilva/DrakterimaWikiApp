import { useMemo } from 'react'
import { REGION_COLOR } from '../../constants'
import { regionLabel as LEGACY_LABEL } from '../../helpers'
import type { Region } from '../../ports'
import { parseRegions } from '../adapters/hubFormPort'
import { useCampaign } from '../CampaignContext'

export interface RegionInfo {
  label: string
  /** CSS color of the region (campaign config, else the legacy palette, else undefined). */
  color: string | undefined
  /** Key of the legacy tag palette (`magral`...), or `neutral` for any other region. */
  tagClass: string
}

const LEGACY_TAG = new Set(['magral', 'nezor', 'heladas', 'islas'])

/** Region of the campaign config -> label/color/tag. Unknown keys (imported data) fall back to the legacy names. */
export function useRegionInfo(): (key: string | null | undefined) => RegionInfo {
  const { campaign } = useCampaign()
  const regions = useMemo<Region[]>(() => parseRegions(campaign.regions), [campaign.regions])
  return useMemo(
    () => (key) => {
      const k = key ?? ''
      const found = regions.find((r) => r.key === k)
      // Own-property lookups only: a data key like "constructor" must not resolve to Object.prototype.
      const legacy = LEGACY_LABEL as Record<string, string>
      const colors = REGION_COLOR as Record<string, string>
      return {
        label: found?.label ?? (Object.hasOwn(legacy, k) ? legacy[k] : undefined) ?? k,
        color: found?.color ?? (Object.hasOwn(colors, k) ? colors[k] : undefined),
        tagClass: LEGACY_TAG.has(k) ? k : 'neutral',
      }
    },
    [regions],
  )
}

/** Regions of the campaign config (or the single fallback), for the region filter pills. */
export function useRegionOptions(): Region[] {
  const { campaign } = useCampaign()
  return useMemo(() => parseRegions(campaign.regions), [campaign.regions])
}
