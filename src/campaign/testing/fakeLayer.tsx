/* eslint-disable react-refresh/only-export-components -- test helper module, never hot-reloaded */
import type { ReactNode } from 'react'
import { vi } from 'vitest'
import { AuthContext } from '../../auth/AuthContext'
import { makeAuth, makeCampaign } from '../../app/testing/renderApp'
import type { DataLayer, FlatEntity, WikiIndexItem } from '../../data'
import { createFakeClient } from '../../data/testing/fakeClient'
import { UnreadPortContext, type UnreadPort } from '../../ports'
import { CampaignContext, type CampaignContextValue } from '../CampaignContext'
import { CampaignServicesProvider } from '../entities/CampaignServices'
import { ToastProvider } from '../toast'

export interface FakeLayerOptions {
  entities?: Record<string, FlatEntity[]>
  index?: Record<string, WikiIndexItem[]>
  dmNotes?: Record<string, { notas: string; secreto: string; ganchos: string }>
  visibility?: Record<number, number[]>
}

/** A DataLayer stand-in: lists come from plain objects, writes are spies. Realtime goes to the fake client. */
export function createFakeLayer(options: FakeLayerOptions = {}) {
  const fake = createFakeClient()
  const entityRepos = new Map<string, unknown>()
  const entityList = vi.fn(async (table: string) => options.entities?.[table] ?? [])
  const indexList = vi.fn(async (table: string) => options.index?.[table] ?? [])
  const saveEntityWithDmNotes = vi.fn(
    async (table: string, target: { id?: number }, flat: Record<string, unknown>) => ({
      entity: { id: target.id ?? 99, campaign_id: 'c1', updated_at: '2026-01-01T00:00:00Z', ...flat, _table: table } as FlatEntity,
      dmNotes: null,
    }),
  )
  const dmNotesGet = vi.fn(async (type: string, id: number) => {
    const row = options.dmNotes?.[`${type}:${id}`]
    return row ? { id: 1, campaign_id: 'c1', entity_type: type, entity_id: id, created_at: '', updated_at: '', ...row } : null
  })
  const dmNotesUpsert = vi.fn(async (_c: string, type: string, id: number, fields: Record<string, string>) => ({
    id: 1, campaign_id: 'c1', entity_type: type, entity_id: id, notas: '', secreto: '', ganchos: '', created_at: '', updated_at: '', ...fields,
  }))
  const getVisibility = vi.fn(async (_t: string, ids: number[]) => Object.fromEntries(ids.map((i) => [i, options.visibility?.[i] ?? []])))
  const setVisibility = vi.fn(async (_t: string, _id: number, ids: number[]) => ids)
  const entityRemove = vi.fn(async () => undefined)
  const entityGet = vi.fn(async (table: string, id: number) => options.entities?.[table]?.find((e) => e.id === id) ?? null)
  const layer = {
    client: fake.db,
    entity: (table: string) => {
      if (!entityRepos.has(table)) {
        entityRepos.set(table, { table, list: () => entityList(table), get: (id: number) => entityGet(table, id), remove: entityRemove })
      }
      return entityRepos.get(table)
    },
    wikiIndex: (table: string) => ({ table, list: () => indexList(table) }),
    saveEntityWithDmNotes,
    dmNotes: { get: dmNotesGet, upsert: dmNotesUpsert },
    visibility: { getVisibility, setVisibility },
    readState: { list: vi.fn(async () => []), markSeen: vi.fn(async () => undefined) },
    playerNotes: { list: vi.fn(async () => []), upsert: vi.fn(), update: vi.fn(), remove: vi.fn() },
  } as unknown as DataLayer
  return { layer, fake, spies: { entityGet, entityList, indexList, saveEntityWithDmNotes, dmNotesGet, dmNotesUpsert, getVisibility, setVisibility, entityRemove } }
}

export const fakeUnread = (): UnreadPort & { markRead: ReturnType<typeof vi.fn> } => ({
  isUnread: () => false,
  markRead: vi.fn(),
})

/** CampaignContext + services + toast (+ a fake unread port): enough for the entity hooks. */
export function CampaignTestProviders({
  layer,
  isDM = true,
  myCharacterIds = [],
  unread = fakeUnread(),
  children,
}: {
  layer: DataLayer
  isDM?: boolean
  myCharacterIds?: number[]
  unread?: UnreadPort
  children: ReactNode
}) {
  const value: CampaignContextValue = {
    campaign: makeCampaign({ id: 'c1' }),
    role: isDM ? 'dm' : 'player',
    isDM,
    myCharacterIds,
    reload: () => undefined,
  }
  return (
    <AuthContext.Provider value={makeAuth()}>
      <CampaignContext.Provider value={value}>
        <CampaignServicesProvider layer={layer} campaignId="c1">
          <ToastProvider>
            <UnreadPortContext.Provider value={unread}>{children}</UnreadPortContext.Provider>
          </ToastProvider>
        </CampaignServicesProvider>
      </CampaignContext.Provider>
    </AuthContext.Provider>
  )
}
