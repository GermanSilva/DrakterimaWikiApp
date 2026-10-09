import { vi } from 'vitest'
import { makeCampaign, makeData, renderApp } from '../../app/testing/renderApp'
import type { CampaignWithRole, DataLayer, FlatEntity } from '../../data'

/** jsdom has no IntersectionObserver: a recording stub so tests can scroll the title out of view. */
export const observers: { callback: IntersectionObserverCallback; target: Element | null }[] = []

function installIntersectionObserver() {
  class StubObserver {
    private entry: { callback: IntersectionObserverCallback; target: Element | null }
    constructor(callback: IntersectionObserverCallback) {
      this.entry = { callback, target: null }
      observers.push(this.entry)
    }
    observe(target: Element) {
      this.entry.target = target
    }
    disconnect() {
      const i = observers.indexOf(this.entry)
      if (i >= 0) observers.splice(i, 1)
    }
    unobserve() {}
    takeRecords() {
      return []
    }
  }
  vi.stubGlobal('IntersectionObserver', StubObserver)
}

export interface RenderSectionOptions {
  layer: DataLayer
  isDM?: boolean
  /** `campaigns.regions` jsonb. */
  regions?: unknown
  /** Characters the signed-in user owns (a player's own pjs). */
  characterIds?: number[]
  /** `campaigns.character_custom_fields` jsonb. */
  customFields?: unknown
  /** Extra fields of the campaign the loader returns (name, branding, updated_at...). */
  campaign?: Partial<CampaignWithRole>
}

/**
 * Renders the REAL router + campaign layout (shell, ports, form host) around a section page, with a
 * fake data layer and the viewer's role. `path` is the full URL, e.g. `/c/demo/sesiones/3`.
 */
export function renderSection(path: string, { layer, isDM = true, regions = [], characterIds = [], customFields = [], campaign: campaignOver = {} }: RenderSectionOptions) {
  window.scrollTo = vi.fn() as typeof window.scrollTo
  installIntersectionObserver()
  const campaign = makeCampaign({ role: isDM ? 'dm' : 'player', regions: regions as never, character_custom_fields: customFields as never, ...campaignOver })
  const data = makeData({
    layer,
    listMyCampaigns: vi.fn(async () => [campaign]),
    listMyCharacterIds: vi.fn(async () => characterIds),
  })
  return renderApp(path, { data })
}

export const entity = (id: number, over: Record<string, unknown> = {}): FlatEntity => ({
  id,
  campaign_id: 'c1',
  created_at: '2026-01-01T10:00:00Z',
  updated_at: '2026-01-02T10:00:00Z',
  estado: 'publicado',
  ...over,
})
