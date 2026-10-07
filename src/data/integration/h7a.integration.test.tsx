// @vitest-environment jsdom
import { randomBytes } from 'node:crypto'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest'
import { CampaignContext } from '../../campaign/CampaignContext'
import { CampaignServicesProvider } from '../../campaign/entities/CampaignServices'
import { useEntityActions } from '../../campaign/entities/useEntityActions'
import { ToastProvider } from '../../campaign/toast'
import { UnreadPortContext } from '../../ports'
import { WIKI_INDEX_COLUMNS, WIKI_INDEX_TABLES } from '../columns'
import { DataError } from '../errors'
import { createDataLayer, type DataLayer } from '../index'
import type { FlatEntity } from '../types'
import { createAdminClient, createTestUser, type TestUser } from './testUsers'

const env = inject('supabase')

/** H7a end to end: the wiki index list and the entity actions the hub hooks use, as DM and as a player. */
describe('H7a: wiki index + entity actions against the local Supabase stack', () => {
  let dm: TestUser
  let player: TestUser
  let dmData: DataLayer
  let playerData: DataLayer
  let campaignId = ''
  let pjId = 0
  const users: TestUser[] = []

  async function cleanup() {
    const admin = createAdminClient(env)
    if (campaignId) {
      const { error } = await admin.from('campaigns').delete().eq('id', campaignId)
      if (error) throw new Error(`delete campaign: ${error.message}`)
      campaignId = ''
    }
    for (const u of [...users]) {
      const { error } = await admin.auth.admin.deleteUser(u.id)
      if (error && error.status !== 404 && !/not found/i.test(error.message)) throw new Error(`delete user: ${error.message}`)
      users.splice(users.indexOf(u), 1)
    }
  }

  beforeAll(async () => {
    try {
      dm = await createTestUser(env, 'h7dm')
      users.push(dm)
      player = await createTestUser(env, 'h7pl')
      users.push(player)
      dmData = createDataLayer(dm.client)
      playerData = createDataLayer(player.client)
      const campaign = await dmData.campaigns.createCampaign(`h7a-${randomBytes(4).toString('hex')}`, 'H7a integration')
      campaignId = campaign.id
      const pj = await dmData.entity('pjs').create(campaignId, { nombre: 'Heroe' })
      pjId = pj.id
      const invite = await dmData.campaigns.createInvite({ campaign_id: campaignId, role: 'player', character_id: pj.id })
      await playerData.campaigns.acceptInvite(invite.code)
    } catch (e) {
      await cleanup().catch(() => undefined)
      throw e
    }
  })

  afterAll(cleanup)

  function actionsFor(layer: DataLayer, isDM: boolean) {
    const campaign = { id: campaignId, slug: 's', name: 'n' } as never
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CampaignContext.Provider value={{ campaign, role: isDM ? 'dm' : 'player', isDM, myCharacterIds: [], reload: () => undefined }}>
        <CampaignServicesProvider layer={layer} campaignId={campaignId}>
          <ToastProvider>
            <UnreadPortContext.Provider value={{ isUnread: () => false, markRead: () => undefined }}>{children}</UnreadPortContext.Provider>
          </ToastProvider>
        </CampaignServicesProvider>
      </CampaignContext.Provider>
    )
    return renderHook(() => useEntityActions('lore'), { wrapper })
  }

  it('the index list runs against the real schema for every wiki table and carries only index fields', async () => {
    for (const table of WIKI_INDEX_TABLES) {
      const rows = await dmData.wikiIndex(table).list(campaignId)
      expect(Array.isArray(rows), table).toBe(true)
    }
    const pjs = await dmData.wikiIndex('pjs').list(campaignId)
    expect(pjs).toHaveLength(1)
    expect(Object.keys(pjs[0]).sort()).toEqual(['estado', 'id', 'imagen_url', 'title'].filter((k) => k in pjs[0]).sort())
    expect(WIKI_INDEX_COLUMNS.pjs).not.toContain('data')
  })

  it('DM creates and updates through the hook: notes in entity_dm_notes, visibility via RPC, players never see the DM fields', async () => {
    const dmHook = actionsFor(dmData, true)
    let created: Awaited<ReturnType<typeof dmHook.result.current.create>> = null
    await act(async () => {
      created = await dmHook.result.current.create(
        { titulo: 'El Cisma', categoria: 'historia', descripcion: 'conocido', estado: 'secreto' },
        { dmNotes: { notas: 'verdad oculta' }, visibleTo: [pjId] },
      )
    })
    expect(created).not.toBeNull()
    const entity = (created as unknown as { entity: FlatEntity }).entity
    expect(entity).not.toHaveProperty('notas')

    // DM side
    expect((await dmData.dmNotes.get('lore', entity.id))?.notas).toBe('verdad oculta')
    expect((await dmData.visibility.getVisibility('lore', [entity.id]))[entity.id]).toEqual([pjId])

    // update: new note, visibility cleared, guarded by the base version. The base is the row as the UI
    // holds it (realtime/list), not the create result: set_entity_visibility bumped updated_at after it.
    const fresh = (await dmData.entity('lore').get(entity.id)) as FlatEntity
    let updated: unknown = null
    await act(async () => {
      updated = await dmHook.result.current.update(
        entity.id,
        { titulo: 'El Gran Cisma' },
        { base: fresh as never, dmNotes: { notas: 'otra verdad' }, visibleTo: [], currentVisibleTo: [pjId] },
      )
    })
    expect(updated).not.toBeNull()
    expect((await dmData.dmNotes.get('lore', entity.id))?.notas).toBe('otra verdad')
    expect((await dmData.visibility.getVisibility('lore', [entity.id]))[entity.id]).toEqual([])

    // make it visible to the player's character again and read as the player
    await act(async () => {
      await dmHook.result.current.update(entity.id, {}, { visibleTo: [pjId] })
    })
    const asPlayer = await playerData.entity('lore').get(entity.id)
    expect(asPlayer?.titulo).toBe('El Gran Cisma')
    expect(asPlayer).not.toHaveProperty('notas')
    const playerIndex = await playerData.wikiIndex('lore').list(campaignId)
    expect(playerIndex.map((r) => r.id)).toContain(entity.id)
    expect(JSON.stringify(playerIndex)).not.toContain('otra verdad')
    expect(await playerData.dmNotes.get('lore', entity.id)).toBeNull()
    expect(await playerData.visibility.getVisibility('lore', [entity.id])).toEqual({})
    await expect(playerData.dmNotes.upsert(campaignId, 'lore', entity.id, { notas: 'hack' })).rejects.toBeInstanceOf(DataError)
    expect((await dmData.dmNotes.get('lore', entity.id))?.notas).toBe('otra verdad')
  })

  it('a DM corrects a player note with update(); upsert-as-another-user is rejected by the insert policy', async () => {
    const target = await dmData.entity('lore').create(campaignId, { titulo: 'Para notas', estado: 'publicado' })
    await playerData.playerNotes.upsert({ campaignId, entityType: 'lore', entityId: target.id, text: 'mia', characterId: pjId })
    const fixed = await dmData.playerNotes.update(campaignId, player.id, 'lore', target.id, 'corregida por el DM')
    expect(fixed.text).toBe('corregida por el DM')
    expect((await playerData.playerNotes.list(campaignId)).find((n) => n.entity_id === target.id)?.text).toBe('corregida por el DM')
    await expect(
      dmData.playerNotes.upsert({ campaignId, entityType: 'lore', entityId: target.id, text: 'forzada', userId: player.id }),
    ).rejects.toMatchObject({ kind: 'permission' })
    // a player cannot correct someone else's note, and update never creates one
    await expect(playerData.playerNotes.update(campaignId, dm.id, 'lore', target.id, 'x')).rejects.toBeInstanceOf(DataError)
  })

  it('a player hook cannot write: nothing reaches the database', async () => {
    const hook = actionsFor(playerData, false)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let out: unknown = 'unset'
    await act(async () => {
      out = await hook.result.current.create({ titulo: 'Intruso', estado: 'publicado' })
    })
    errorSpy.mockRestore()
    expect(out).toBeNull() // RLS denied, surfaced as a toast
    expect((await dmData.entity('lore').list(campaignId)).some((l) => l.titulo === 'Intruso')).toBe(false)
  })
})
