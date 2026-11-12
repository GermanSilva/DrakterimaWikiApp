/**
 * Test harness for the Ajustes pages that save the system document more than once. `renderSection` serves a static campaign on every
 * reload, so a second save would be built over the first row's stale copy; here the campaign the hub lists is the row the fake
 * data layer holds NOW, as the real database would return it. The Ajustes tabs and their lazy chunks are the real ones.
 */
import { vi } from 'vitest'
import { makeCampaign, makeData, renderApp } from '../../../app/testing/renderApp'
import type { Campaign } from '../../../data'
import { createFakeLayer } from '../../testing/fakeLayer'
import { observers } from '../../testing/renderSection' // importing it registers the preload of the lazy section chunks
import { dnd5eProfile } from '../../system/systemProfile'

export type Json = Record<string, unknown>

void observers

class NoObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

export interface EconomyHarness extends ReturnType<typeof createFakeLayer> {
  /** The system document the database holds now. */
  stored: () => Json
  /** The sheet inside it. */
  sheet: () => Json
}

export function renderEconomy(sheet: Json | null, { tab = 'sistema', config = {}, extra = {}, pjs = [] }: { tab?: string; config?: Json; extra?: Json; pjs?: Json[] } = {}): EconomyHarness {
  window.scrollTo = vi.fn() as typeof window.scrollTo
  vi.stubGlobal('IntersectionObserver', NoObserver)
  const system = { ...dnd5eProfile(), ...extra, ...(sheet ? { sheet } : {}) } as unknown as Record<string, unknown>
  const first = { name: 'Drakterima', system_profile: system }
  const made = createFakeLayer({ campaign: first as never, entities: { pjs: pjs as never[] }, pot: null, config: config as never })
  let row: Campaign | null = null
  const write = made.spies.setSystemProfile.getMockImplementation()!
  made.spies.setSystemProfile.mockImplementation(async (...args: Parameters<typeof write>) => {
    row = await write(...args)
    return row
  })
  const base = makeCampaign({ role: 'dm', name: first.name, system_profile: system as never })
  const data = makeData({
    layer: made.layer,
    listMyCampaigns: vi.fn(async () => [row ? { ...base, system_profile: row.system_profile, updated_at: row.updated_at } : base]),
    listMyCharacterIds: vi.fn(async () => []),
  })
  renderApp(`/c/demo/ajustes?tab=${tab}`, { data })
  const stored = () => (row?.system_profile ?? system) as Json
  return { ...made, stored, sheet: () => stored().sheet as Json }
}

/** The keys of the tables marked as the reward destination. */
export const destinations = (sheet: Json): string[] =>
  (sheet.categories as Json[]).flatMap((c) => (c.sections as Json[]).flatMap((s) => (s.items as Json[]).filter((i) => i.rewardDestination === true).map((i) => String(i.key))))

/** The items of a section of a sheet. */
export const sectionItems = (sheet: Json, sectionKey: string): Json[] =>
  (sheet.categories as Json[]).flatMap((c) => c.sections as Json[]).find((s) => s.key === sectionKey)!.items as Json[]
