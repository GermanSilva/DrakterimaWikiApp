/* eslint-disable react-refresh/only-export-components -- test helper module, never hot-reloaded */
import type { ReactNode } from 'react'
import { vi } from 'vitest'
import { AuthContext } from '../../auth/AuthContext'
import { makeAuth, makeCampaign } from '../../app/testing/renderApp'
import { ConflictError, type DataLayer, type Disponibilidad, type FlatEntity, type GameLog, type GamePot, type PlayerNote, type WikiIndexItem } from '../../data'
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
  disponibilidad?: Disponibilidad[]
  /** The campaign pot row (null/undefined = no prize yet). */
  pot?: GamePot | null
  gameLogs?: GameLog[]
  playerNotes?: PlayerNote[]
  /** `campaign_config` rows by key (value + the `updated_at` version the guarded patch compares). */
  config?: Record<string, { value: Record<string, unknown>; updated_at?: string; visibility?: 'members' | 'dm' }>
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
  const dmNotesList = vi.fn(async (_campaignId?: string, entityType?: string) =>
    Object.entries(options.dmNotes ?? {}).filter(([key]) => !entityType || key.startsWith(`${entityType}:`)).map(([key, row]) => {
      const [type, id] = key.split(':')
      return { id: 1, campaign_id: 'c1', entity_type: type, entity_id: Number(id), created_at: '', updated_at: '', ...row }
    }),
  )
  const dmNotesUpsert = vi.fn(async (_c: string, type: string, id: number, fields: Record<string, string>) => ({
    id: 1, campaign_id: 'c1', entity_type: type, entity_id: id, notas: '', secreto: '', ganchos: '', created_at: '', updated_at: '', ...fields,
  }))
  const getVisibility = vi.fn(async (_t: string, ids: number[]) => Object.fromEntries(ids.map((i) => [i, options.visibility?.[i] ?? []])))
  const setVisibility = vi.fn(async (_t: string, _id: number, ids: number[]) => ids)
  const entityRemove = vi.fn(async () => undefined)
  const entityGet = vi.fn(async (table: string, id: number) => options.entities?.[table]?.find((e) => e.id === id) ?? null)
  // campaign_config: an in-memory store whose patch honours the `base` guard like the real repository (v1, v2, ...)
  const configRows = new Map(Object.entries(options.config ?? {}).map(([key, row]) => [key, { value: row.value, updated_at: row.updated_at ?? 'v1', visibility: row.visibility ?? 'dm' }]))
  let configVersion = 1
  const rowOf = (key: string) => {
    const row = configRows.get(key)
    return row ? { campaign_id: 'c1', key, ...row } : null
  }
  const configGet = vi.fn(async (_campaignId: string, key: string) => rowOf(key))
  const configPatch = vi.fn(async (_campaignId: string, key: string, patch: Record<string, unknown>, visibility: 'members' | 'dm' = 'members', base?: string | null) => {
    const current = configRows.get(key)
    if (base !== undefined && (current?.updated_at ?? null) !== base) throw new ConflictError()
    configVersion += 1
    configRows.set(key, { value: { ...(current?.value ?? {}), ...patch }, updated_at: `v${configVersion}`, visibility: current?.visibility ?? visibility })
    return rowOf(key)
  })
  const disponibilidadList = vi.fn(async () => options.disponibilidad ?? [])
  const potGet = vi.fn(async () => options.pot ?? null)
  const gameLogsList = vi.fn(async () => options.gameLogs ?? [])
  const playerNotesList = vi.fn(async () => options.playerNotes ?? [])
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
    dmNotes: { get: dmNotesGet, upsert: dmNotesUpsert, list: dmNotesList },
    visibility: { getVisibility, setVisibility },
    readState: { list: vi.fn(async () => []), markSeen: vi.fn(async () => undefined) },
    config: { get: configGet, patch: configPatch },
    disponibilidad: { list: disponibilidadList, create: vi.fn(), update: vi.fn(), remove: vi.fn(async () => undefined) },
    games: { getPot: potGet, listLogs: gameLogsList, playLoteria: vi.fn(), assignPotToCharacter: vi.fn(), removeLog: vi.fn(async () => undefined) },
    playerNotes: { list: playerNotesList, upsert: vi.fn(), update: vi.fn(), remove: vi.fn() },
  } as unknown as DataLayer
  return { layer, fake, spies: { disponibilidadList, potGet, gameLogsList, playerNotesList, configGet, configPatch, configRows, entityGet, entityList, indexList, saveEntityWithDmNotes, dmNotesGet, dmNotesList, dmNotesUpsert, getVisibility, setVisibility, entityRemove } }
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
