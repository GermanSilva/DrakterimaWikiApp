/* eslint-disable react-refresh/only-export-components -- test helper module, never hot-reloaded */
import type { ReactNode } from 'react'
import { vi } from 'vitest'
import { AuthContext } from '../../auth/AuthContext'
import { makeAuth, makeCampaign } from '../../app/testing/renderApp'
import { ConflictError, DataError, type ActionInput, type ActionPatch, type Campaign, type CampaignAction, type PjActionLink, type CampaignPatch, type BusySlot, type CampaignPresence, type DataLayer, type Disponibilidad, type Member, type FlatEntity, type GameLog, type GamePot, type Invite, type NewInvite, type PlayerAvailability, type PlayerNote, type WikiIndexItem } from '../../data'
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
  /** Session slots. */
  disponibilidad?: Disponibilidad[]
  /** Player availability rows as the server would return them for the campaign. */
  playerAvailability?: PlayerAvailability[]
  /** Campaign members (DM included) as `campaigns.listMembers` returns them. */
  members?: Member[]
  /** Slots of OTHER campaigns' sessions booking members of this one (`campaign_busy_slots`). */
  busySlots?: BusySlot[]
  /** The campaign pot row (null/undefined = no prize yet). */
  pot?: GamePot | null
  gameLogs?: GameLog[]
  /** Last connections as the DM would read them (`campaign_presence`). */
  presence?: CampaignPresence[]
  playerNotes?: PlayerNote[]
  /** Invites as `campaigns.listInvites` returns them (DM only). */
  invites?: Invite[]
  /** Stored campaign row behind `campaigns.updateCampaign` (match it with the campaign the loader returns). */
  campaign?: Partial<Campaign>
  /**
   * Entity writes persist: `saveEntityWithDmNotes` on an existing id merges the patch into the stored row (new `updated_at` w1, w2...),
   * answers ConflictError when `base.updated_at` is not the stored one, and `get` / `list` read the stored rows.
   */
  persistEntities?: boolean
  /** Shared action collection entries and the character links (`layer.actions`). */
  actions?: CampaignAction[]
  actionLinks?: PjActionLink[]
  /** `campaign_config` rows by key (value + the `updated_at` version the guarded patch compares). */
  config?: Record<string, { value: Record<string, unknown>; updated_at?: string; visibility?: 'members' | 'dm' }>
}

/** A DataLayer stand-in: lists come from plain objects, writes are spies. Realtime goes to the fake client. */
export function createFakeLayer(options: FakeLayerOptions = {}) {
  const fake = createFakeClient()
  const entityRepos = new Map<string, unknown>()
  const stored = new Map(Object.entries(options.entities ?? {}).map(([table, rows]) => [table, [...rows]]))
  let writeSeq = 0
  const entityList = vi.fn(async (table: string) => (options.persistEntities ? [...(stored.get(table) ?? [])] : (options.entities?.[table] ?? [])))
  const indexList = vi.fn(async (table: string) => options.index?.[table] ?? [])
  const saveEntityWithDmNotes = vi.fn(
    async (table: string, target: { id?: number; base?: { updated_at?: string } }, flat: Record<string, unknown>) => {
      const rows = stored.get(table) ?? []
      const current = options.persistEntities && target.id !== undefined ? rows.find((r) => r.id === target.id) : undefined
      if (current) {
        if (target.base?.updated_at !== undefined && target.base.updated_at !== current.updated_at) throw new ConflictError()
        const next = { ...current, ...flat, updated_at: `w${++writeSeq}` } as FlatEntity
        stored.set(table, rows.map((r) => (r === current ? next : r)))
        return { entity: next, dmNotes: null }
      }
      return {
        entity: { id: target.id ?? 99, campaign_id: 'c1', updated_at: '2026-01-01T00:00:00Z', ...flat, _table: table } as FlatEntity,
        dmNotes: null,
      }
    },
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
  const entityGet = vi.fn(async (table: string, id: number) => (options.persistEntities ? stored.get(table) : options.entities?.[table])?.find((e) => e.id === id) ?? null)
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
  // campaigns.updateCampaign: an in-memory row (versions u1, u2, ...) that honours the `base` guard and the branding merge like the repository
  let campaignRow = { ...makeCampaign({ id: 'c1' }), ...options.campaign } as Campaign
  let campaignVersion = 0
  const updateCampaign = vi.fn(async (_id: string, patch: CampaignPatch, base?: string) => {
    if (base !== undefined && campaignRow.updated_at !== base) throw new ConflictError()
    const branding: Record<string, unknown> = { ...campaignRow.branding }
    for (const [key, value] of Object.entries(patch.branding ?? {})) {
      if (value === null) delete branding[key]
      else branding[key] = value
    }
    campaignRow = { ...campaignRow, name: patch.name ?? campaignRow.name, branding, regions: patch.regions ?? campaignRow.regions, character_custom_fields: patch.character_custom_fields ?? campaignRow.character_custom_fields, updated_at: `u${++campaignVersion}` }
    return campaignRow
  })
  // campaigns.setSystemProfile: same version guard as updateCampaign; stores the document it was given
  const setSystemProfile = vi.fn(async (_id: string, profile: unknown, base: string) => {
    if (campaignRow.updated_at !== base) throw new ConflictError()
    campaignRow = { ...campaignRow, system_profile: profile as Campaign['system_profile'], updated_at: `u${++campaignVersion}` }
    return campaignRow
  })
  // campaigns.purgeDiscardedItem / rekeyDiscardedItem: same version guard; the fake keeps the document (the characters' data is the database's business, see 32_sheet_discarded.test.sql)
  const purgeDiscardedItem = vi.fn(async (_id: string, key: string, base: string) => {
    if (campaignRow.updated_at !== base) throw new ConflictError()
    const profile = JSON.parse(JSON.stringify(campaignRow.system_profile ?? {})) as { sheet?: { discarded?: { item: { key: string } }[] } }
    if (profile.sheet?.discarded) {
      profile.sheet.discarded = profile.sheet.discarded.filter((e) => e.item.key !== key)
      if (profile.sheet.discarded.length === 0) delete profile.sheet.discarded
    }
    campaignRow = { ...campaignRow, system_profile: profile as Campaign['system_profile'], updated_at: `u${++campaignVersion}` }
    return campaignRow
  })
  const rekeyDiscardedItem = vi.fn(async (_id: string, _key: string, _renames: Record<string, string>, profile: unknown, base: string) => {
    if (campaignRow.updated_at !== base) throw new ConflictError()
    campaignRow = { ...campaignRow, system_profile: profile as Campaign['system_profile'], updated_at: `u${++campaignVersion}` }
    return campaignRow
  })
  // invites: an in-memory table; create/revoke change what the next list returns, like the real repository
  let inviteRows = [...(options.invites ?? [])]
  let inviteSeq = 0
  const invitesList = vi.fn(async () => [...inviteRows])
  const invitesCreate = vi.fn(async (invite: NewInvite) => {
    inviteSeq += 1
    const row: Invite = {
      id: `new-${inviteSeq}`, campaign_id: invite.campaign_id, code: `newcode${inviteSeq}`, role: invite.role ?? 'player',
      character_id: invite.character_id ?? null, max_uses: invite.max_uses ?? 1, uses: 0, expires_at: invite.expires_at ?? null,
      created_by: 'user-1', created_at: '2026-10-09T12:00:00Z',
    }
    inviteRows = [row, ...inviteRows]
    return row
  })
  const invitesRevoke = vi.fn(async (id: string) => {
    if (!inviteRows.some((i) => i.id === id)) throw new DataError('not_found', 'invite: not found')
    inviteRows = inviteRows.filter((i) => i.id !== id)
  })
  const disponibilidadList = vi.fn(async () => options.disponibilidad ?? [])
  const playerAvailabilityList = vi.fn(async () => options.playerAvailability ?? [])
  // members: an in-memory roster; role changes and kicks change what the next list returns, like the repository
  let memberRows = [...(options.members ?? [])]
  const membersList = vi.fn(async () => [...memberRows])
  const updateMemberRole = vi.fn(async (_campaignId: string, userId: string, role: 'dm' | 'player') => {
    if (!memberRows.some((m) => m.user_id === userId)) throw new DataError('not_found', 'membership: not found')
    memberRows = memberRows.map((m) => (m.user_id === userId ? { ...m, role } : m))
  })
  const removeMember = vi.fn(async (_campaignId: string, userId: string) => {
    if (!memberRows.some((m) => m.user_id === userId)) throw new DataError('not_found', 'membership: not found')
    memberRows = memberRows.filter((m) => m.user_id !== userId)
  })
  const setPjOwner = vi.fn(async (characterId: number, userId: string | null) => void [characterId, userId])
  const deleteCampaign = vi.fn(async (campaignId: string, slug: string) => void [campaignId, slug])
  const busySlotsList = vi.fn(async () => options.busySlots ?? [])
  const potGet = vi.fn(async () => options.pot ?? null)
  const gameLogsList = vi.fn(async () => options.gameLogs ?? [])
  const presenceTouch = vi.fn(async (campaignId?: string) => void campaignId)
  const presenceList = vi.fn(async (campaignId?: string) => {
    void campaignId
    return options.presence ?? []
  })
  const playerNotesList = vi.fn(async () => options.playerNotes ?? [])
  // actions: an in-memory collection; writes change what the next list returns, like the repository
  let actionRows = [...(options.actions ?? [])]
  let linkRows = [...(options.actionLinks ?? [])]
  let actionSeq = 1000
  const actionsList = vi.fn(async (campaignId?: string) => {
    void campaignId
    return [...actionRows]
  })
  const actionLinksList = vi.fn(async (campaignId?: string) => {
    void campaignId
    return [...linkRows]
  })
  const listLinkedActions = vi.fn(async (pjId: number) =>
    linkRows.flatMap((link) => {
      const action = actionRows.find((a) => a.id === link.action_id)
      return link.pj_id === pjId && action ? [{ action, link }] : []
    }),
  )
  const createAction = vi.fn(async (campaignId: string, input: ActionInput) => {
    actionSeq += 1
    const row = {
      id: actionSeq, campaign_id: campaignId, description: '', extras: {}, private_to_pj: null, function: null, created_by: 'user-1',
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', ...input,
    } as CampaignAction
    actionRows = [...actionRows, row]
    return row
  })
  const updateAction = vi.fn(async (id: number, patch: ActionPatch) => {
    const current = actionRows.find((a) => a.id === id)
    if (!current) throw new DataError('not_found', `campaign_actions/${id}: not found`)
    const row = { ...current, ...patch, updated_at: '2026-01-02T00:00:00Z' } as CampaignAction
    actionRows = actionRows.map((a) => (a.id === id ? row : a))
    return row
  })
  const removeAction = vi.fn(async (id: number) => {
    actionRows = actionRows.filter((a) => a.id !== id)
    linkRows = linkRows.filter((l) => l.action_id !== id)
  })
  const linkAction = vi.fn(async (campaignId: string, pjId: number, actionId: number, state: Record<string, unknown> = {}) => {
    const row: PjActionLink = { pj_id: pjId, action_id: actionId, campaign_id: campaignId, state, created_at: '2026-01-01T00:00:00Z', updated_at: 'l1' }
    linkRows = [...linkRows, row]
    return row
  })
  const unlinkAction = vi.fn(async (pjId: number, actionId: number) => {
    linkRows = linkRows.filter((l) => !(l.pj_id === pjId && l.action_id === actionId))
  })
  const updateLinkState = vi.fn(async (pjId: number, actionId: number, patch: Record<string, unknown>) => {
    const current = linkRows.find((l) => l.pj_id === pjId && l.action_id === actionId)
    if (!current) throw new DataError('not_found', `pj_action_links/${pjId}/${actionId}: not found`)
    const row = { ...current, state: { ...current.state, ...patch }, updated_at: `${current.updated_at}+` }
    linkRows = linkRows.map((l) => (l === current ? row : l))
    return row
  })
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
    disponibilidad: {
      list: disponibilidadList,
      create: vi.fn(async (campaignId: string, input: object) => ({ id: 900, campaign_id: campaignId, created_by: null, created_at: '', updated_at: '', ...input })),
      update: vi.fn(async (id: number, patch: object) => ({ id, campaign_id: 'c1', created_by: null, created_at: '', updated_at: '', ...patch })),
      remove: vi.fn(async () => undefined),
    },
    playerAvailability: {
      list: playerAvailabilityList,
      create: vi.fn(async (input: object) => ({ id: 901, user_id: 'user-1', created_at: '', updated_at: '', ...input })),
      update: vi.fn(async (id: number, patch: object) => ({ id, user_id: 'user-1', created_at: '', updated_at: '', ...patch })),
      remove: vi.fn(async () => undefined),
      busySlots: busySlotsList,
    },
    campaigns: { listMembers: membersList, updateMemberRole, removeMember, setPjOwner, deleteCampaign, updateCampaign, setSystemProfile, purgeDiscardedItem, rekeyDiscardedItem, listInvites: invitesList, createInvite: invitesCreate, revokeInvite: invitesRevoke },
    systems: { listAvailableBases: vi.fn(async () => []), listAllSystems: vi.fn(async () => []), getSystemDocument: vi.fn(async () => null), branchSystem: vi.fn(), renameSystem: vi.fn(), createOriginFromCampaign: vi.fn(), promoteSystem: vi.fn(), archiveSystem: vi.fn() },
    games: { getPot: potGet, listLogs: gameLogsList, playLoteria: vi.fn(), assignPotToCharacter: vi.fn(), removeLog: vi.fn(async () => undefined) },
    presence: { touch: presenceTouch, list: presenceList },
    actions: { listActions: actionsList, listLinks: actionLinksList, listLinkedActions, createAction, updateAction, removeAction, link: linkAction, unlink: unlinkAction, updateLinkState },
    playerNotes: { list: playerNotesList, upsert: vi.fn(), update: vi.fn(), remove: vi.fn() },
  } as unknown as DataLayer
  return { layer, fake, spies: { updateMemberRole, removeMember, setPjOwner, deleteCampaign, updateCampaign, setSystemProfile, purgeDiscardedItem, rekeyDiscardedItem, invitesList, invitesCreate, invitesRevoke, presenceTouch, presenceList, membersList, busySlotsList, disponibilidadList, playerAvailabilityList, potGet, gameLogsList, playerNotesList, actionsList, actionLinksList, listLinkedActions, createAction, updateAction, removeAction, linkAction, unlinkAction, updateLinkState, configGet, configPatch, configRows, entityGet, entityList, indexList, saveEntityWithDmNotes, dmNotesGet, dmNotesList, dmNotesUpsert, getVisibility, setVisibility, entityRemove } }
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
