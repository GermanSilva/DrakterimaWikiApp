import { describe, expect, it } from 'vitest'
import { createCampaignRepository } from './campaignRepository'
import { CAMPAIGN_COLUMNS, DM_NOTES_COLUMNS, join } from './columns'
import { createConfigRepository } from './configRepository'
import { createDisponibilidadRepository } from './disponibilidadRepository'
import { createPlayerAvailabilityRepository } from './playerAvailabilityRepository'
import { createDmNotesRepository } from './dmNotesRepository'
import { ConflictError } from './errors'
import { createGamesRepository } from './gamesRepository'
import { createPlayerNotesRepository } from './playerNotesRepository'
import { createReadStateRepository } from './readStateRepository'
import { createFakeClient, opsNamed } from './testing/fakeClient'
import { createVisibilityRepository } from './visibilityRepository'

describe('visibility repository', () => {
  it('reads through get_entity_visibility and indexes the result by id', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: [{ id: 1, visible_to: [10, 11] }, { id: 2, visible_to: [] }] })
    const out = await createVisibilityRepository(fake.db).getVisibility('pnjs', [1, 2])
    expect(fake.calls[0]).toMatchObject({ kind: 'rpc', name: 'get_entity_visibility', args: { p_entity_type: 'pnjs', p_ids: [1, 2] } })
    expect(out).toEqual({ 1: [10, 11], 2: [] })
  })

  it('writes through set_entity_visibility', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: [10] })
    expect(await createVisibilityRepository(fake.db).setVisibility('lore', 5, [10])).toEqual([10])
    expect(fake.calls[0]).toMatchObject({ kind: 'rpc', name: 'set_entity_visibility', args: { p_entity_type: 'lore', p_id: 5, p_visible_to: [10] } })
  })

  it('propagates the dm_only denial', async () => {
    const fake = createFakeClient()
    fake.enqueue({ error: { message: 'dm_only', code: '42501' } })
    await expect(createVisibilityRepository(fake.db).setVisibility('lore', 5, [])).rejects.toMatchObject({ kind: 'permission' })
  })
})

describe('visibility chunking', () => {
  it('splits getVisibility into calls of at most 1000 ids and merges the results', async () => {
    const fake = createFakeClient()
    const ids = Array.from({ length: 2500 }, (_, i) => i + 1)
    fake.enqueue({ data: [{ id: 1, visible_to: [9] }] }, { data: [{ id: 1001, visible_to: [] }] }, { data: [{ id: 2500, visible_to: [8] }] })
    const out = await createVisibilityRepository(fake.db).getVisibility('pnjs', ids)
    expect(fake.calls.map((c) => (c.args as { p_ids: number[] }).p_ids.length)).toEqual([1000, 1000, 500])
    expect(out).toEqual({ 1: [9], 1001: [], 2500: [8] })
    fake.assertDrained()
  })

  it('makes no call for an empty id list', async () => {
    const fake = createFakeClient()
    expect(await createVisibilityRepository(fake.db).getVisibility('pnjs', [])).toEqual({})
    expect(fake.calls).toHaveLength(0)
  })
})

describe('dm notes repository list', () => {
  it('lists the campaign, optionally filtered by entity type, with explicit columns', async () => {
    const fake = createFakeClient()
    const repo = createDmNotesRepository(fake.db)
    fake.enqueue({ data: [{ id: 1 }] }, { data: [] })
    await repo.list('c1', 'pnjs')
    expect(opsNamed(fake.calls[0], 'select')).toEqual([[join(DM_NOTES_COLUMNS)]])
    expect(opsNamed(fake.calls[0], 'eq')).toEqual([['campaign_id', 'c1'], ['entity_type', 'pnjs']])
    fake.enqueue({ data: [] })
    await repo.list('c1')
    expect(opsNamed(fake.calls[2], 'eq')).toEqual([['campaign_id', 'c1']])
  })
})

describe('dm notes repository', () => {
  it('get/upsert/remove use the entity_type + entity_id key and explicit columns', async () => {
    const fake = createFakeClient()
    const repo = createDmNotesRepository(fake.db)
    fake.enqueue({ data: null })
    expect(await repo.get('pnjs', 4)).toBeNull()
    expect(opsNamed(fake.calls[0], 'select')).toEqual([[join(DM_NOTES_COLUMNS)]])
    expect(opsNamed(fake.calls[0], 'eq')).toEqual([['entity_type', 'pnjs'], ['entity_id', 4]])

    fake.enqueue({ data: { notas: 'n' } })
    await repo.upsert('c1', 'pnjs', 4, { notas: 'n' })
    expect(opsNamed(fake.calls[1], 'upsert')).toEqual([
      [{ campaign_id: 'c1', entity_type: 'pnjs', entity_id: 4, notas: 'n' }, { onConflict: 'entity_type,entity_id' }],
    ])

    fake.enqueue({ data: [{ id: 1 }] })
    await repo.remove('pnjs', 4)
    expect(opsNamed(fake.calls[2], 'delete')).toHaveLength(1)
    expect(opsNamed(fake.calls[2], 'select')).toEqual([['id']])

    // zero rows: denied when the note is still readable; already gone is success (idempotent, retry-safe)
    fake.enqueue({ data: [] }, { data: [{ entity_type: 'pnjs' }] })
    await expect(repo.remove('pnjs', 4)).rejects.toMatchObject({ kind: 'permission' })
    fake.enqueue({ data: [] }, { data: [] })
    await expect(repo.remove('pnjs', 4)).resolves.toBeUndefined()
    fake.assertDrained()
  })
})

describe('campaign repository', () => {
  it('listMyCampaigns joins campaigns with my role, filtered by user', async () => {
    const fake = createFakeClient()
    fake.enqueue({
      data: [
        { role: 'player', campaign: { id: 'b', name: 'Beta', slug: 'beta' } },
        { role: 'dm', campaign: { id: 'a', name: 'Alpha', slug: 'alpha' } },
        { role: 'dm', campaign: null },
      ],
    })
    const out = await createCampaignRepository(fake.db).listMyCampaigns('u1')
    expect(fake.calls[0].name).toBe('campaign_members')
    expect(opsNamed(fake.calls[0], 'select')[0][0]).toBe(`role, campaign:campaigns(${join(CAMPAIGN_COLUMNS)})`)
    expect(opsNamed(fake.calls[0], 'eq')).toEqual([['user_id', 'u1']])
    expect(out.map((c) => [c.slug, c.role])).toEqual([['alpha', 'dm'], ['beta', 'player']])
  })

  it('getCampaignBySlug filters by slug with explicit columns', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: { id: 'a' } })
    await createCampaignRepository(fake.db).getCampaignBySlug('alpha')
    expect(opsNamed(fake.calls[0], 'select')).toEqual([[join(CAMPAIGN_COLUMNS)]])
    expect(opsNamed(fake.calls[0], 'eq')).toEqual([['slug', 'alpha']])
  })

  it('createCampaign and acceptInvite call their RPCs; business errors keep the reason', async () => {
    const fake = createFakeClient()
    const repo = createCampaignRepository(fake.db)
    fake.enqueue({ data: { id: 'a', slug: 'alpha' } })
    await repo.createCampaign('alpha', 'Alpha')
    expect(fake.calls[0]).toMatchObject({ kind: 'rpc', name: 'create_campaign', args: { p_slug: 'alpha', p_name: 'Alpha' } })

    // the previous call shape sends nothing else
    expect(fake.calls[0].args).toEqual({ p_slug: 'alpha', p_name: 'Alpha' })

    fake.enqueue({ data: { id: 'b', slug: 'beta' } })
    await repo.createCampaign('beta', 'Beta', { tagline: 'Lema', accent_color: '#102030', logo_url: 'https://cdn.test/b.png' })
    expect(fake.calls[1]).toMatchObject({
      name: 'create_campaign',
      args: { p_slug: 'beta', p_name: 'Beta', p_tagline: 'Lema', p_accent_color: '#102030', p_logo_url: 'https://cdn.test/b.png' },
    })

    fake.enqueue({ data: { joined: true, claimed: false, campaign_id: 'a', slug: 'alpha', role: 'player', character_id: null } })
    expect((await repo.acceptInvite('code')).joined).toBe(true)
    expect(fake.calls[2]).toMatchObject({ name: 'accept_invite', args: { p_code: 'code' } })

    fake.enqueue({ error: { message: 'invite_expired', code: 'P0001' } })
    await expect(repo.acceptInvite('old')).rejects.toMatchObject({ kind: 'business', message: 'invite_expired' })
  })

  it('listMembers embeds profiles; createInvite sends only writable columns', async () => {
    const fake = createFakeClient()
    const repo = createCampaignRepository(fake.db)
    fake.enqueue({ data: [] })
    await repo.listMembers('c1')
    expect(opsNamed(fake.calls[0], 'select')[0][0]).toContain('profile:profiles(id, display_name, avatar_url)')
    expect(opsNamed(fake.calls[0], 'eq')).toEqual([['campaign_id', 'c1']])

    fake.enqueue({ data: { code: 'abc' } })
    await repo.createInvite({ campaign_id: 'c1', role: 'player', character_id: 3 })
    expect(opsNamed(fake.calls[1], 'insert')).toEqual([[{ campaign_id: 'c1', role: 'player', character_id: 3 }]])
  })

  describe('invites', () => {
    it('listInvites reads the campaign invites newest first, paging to the end', async () => {
      const fake = createFakeClient()
      const repo = createCampaignRepository(fake.db)
      fake.enqueue({ data: [{ id: 'i1' }, { id: 'i2' }] }, { data: [] })
      expect((await repo.listInvites('c1')).map((i) => i.id)).toEqual(['i1', 'i2'])
      expect(fake.calls[0].name).toBe('campaign_invites')
      expect(opsNamed(fake.calls[0], 'eq')).toEqual([['campaign_id', 'c1']])
      expect(opsNamed(fake.calls[0], 'order')[0]).toEqual(['created_at', { ascending: false }])
    })

    it('revokeInvite deletes by id; an already revoked invite is not_found, a denied one is permission', async () => {
      const fake = createFakeClient()
      const repo = createCampaignRepository(fake.db)
      fake.enqueue({ data: [{ id: 'i1' }] })
      await repo.revokeInvite('i1')
      expect(opsNamed(fake.calls[0], 'delete')).toHaveLength(1)
      expect(opsNamed(fake.calls[0], 'eq')).toEqual([['id', 'i1']])

      fake.enqueue({ data: [] }, { data: [] })
      await expect(repo.revokeInvite('i1')).rejects.toMatchObject({ kind: 'not_found' })
      fake.enqueue({ data: [] }, { data: [{ id: 'i1' }] })
      await expect(repo.revokeInvite('i1')).rejects.toMatchObject({ kind: 'permission' })
    })

    it('previewInvite calls the read-only RPC and keeps the business reason of a bad code', async () => {
      const fake = createFakeClient()
      const repo = createCampaignRepository(fake.db)
      fake.enqueue({ data: { campaign_name: 'Alpha', character_name: 'Eldric' } })
      expect((await repo.previewInvite('abc')).character_name).toBe('Eldric')
      expect(fake.calls[0]).toMatchObject({ kind: 'rpc', name: 'preview_invite', args: { p_code: 'abc' } })

      fake.enqueue({ error: { message: 'invite_exhausted', code: 'P0001' } })
      await expect(repo.previewInvite('abc')).rejects.toMatchObject({ kind: 'business', reason: 'invite_exhausted' })
    })

    it('createInvite sends role, expiry, uses and character, and keeps the trigger reasons', async () => {
      const fake = createFakeClient()
      const repo = createCampaignRepository(fake.db)
      fake.enqueue({ data: { code: 'abc' } })
      await repo.createInvite({ campaign_id: 'c1', role: 'player', max_uses: 5, expires_at: '2026-10-16T00:00:00.000Z' })
      expect(opsNamed(fake.calls[0], 'insert')).toEqual([
        [{ campaign_id: 'c1', role: 'player', max_uses: 5, expires_at: '2026-10-16T00:00:00.000Z' }],
      ])
      for (const reason of ['character_already_owned', 'character_already_has_pending_invite'] as const) {
        fake.enqueue({ error: { message: reason, code: '23514' } })
        await expect(repo.createInvite({ campaign_id: 'c1', character_id: 3 })).rejects.toMatchObject({ kind: 'validation', reason })
      }
    })
  })

  it('leaveCampaign deletes my membership and fails when none was removed', async () => {
    const fake = createFakeClient()
    const repo = createCampaignRepository(fake.db)
    fake.enqueue({ data: [{ user_id: 'u1' }] })
    await repo.leaveCampaign('c1', 'u1')
    expect(opsNamed(fake.calls[0], 'eq')).toEqual([['campaign_id', 'c1'], ['user_id', 'u1']])
    fake.enqueue({ data: [] })
    await expect(repo.leaveCampaign('c1', 'u1')).rejects.toMatchObject({ kind: 'not_found' })
  })

  describe('member administration', () => {
    const LAST_DM = { message: 'cannot remove, demote or delete the account of the only DM of a campaign: transfer the DM role to another member or delete the campaign first', code: '23514' }

    it('updateMemberRole updates only the role of that membership and reports what it could not change', async () => {
      const fake = createFakeClient()
      const repo = createCampaignRepository(fake.db)
      fake.enqueue({ data: [{ user_id: 'u2' }] })
      await repo.updateMemberRole('c1', 'u2', 'dm')
      expect(opsNamed(fake.calls[0], 'update')).toEqual([[{ role: 'dm' }]])
      expect(opsNamed(fake.calls[0], 'eq')).toEqual([['campaign_id', 'c1'], ['user_id', 'u2']])

      fake.enqueue({ data: [] }, { data: [] })
      await expect(repo.updateMemberRole('c1', 'u2', 'dm')).rejects.toMatchObject({ kind: 'not_found' })
      fake.enqueue({ data: [] }, { data: [{ campaign_id: 'c1' }] })
      await expect(repo.updateMemberRole('c1', 'u2', 'dm')).rejects.toMatchObject({ kind: 'permission' })
    })

    it('demoting or removing the last DM surfaces the typed last_dm reason', async () => {
      const fake = createFakeClient()
      const repo = createCampaignRepository(fake.db)
      fake.enqueue({ error: LAST_DM })
      await expect(repo.updateMemberRole('c1', 'u1', 'player')).rejects.toMatchObject({ kind: 'validation', reason: 'last_dm' })
      fake.enqueue({ error: LAST_DM })
      await expect(repo.removeMember('c1', 'u1')).rejects.toMatchObject({ kind: 'validation', reason: 'last_dm' })
    })

    it('removeMember deletes that membership only and is not_found when they are already gone', async () => {
      const fake = createFakeClient()
      const repo = createCampaignRepository(fake.db)
      fake.enqueue({ data: [{ user_id: 'u2' }] })
      await repo.removeMember('c1', 'u2')
      expect(opsNamed(fake.calls[0], 'delete')).toHaveLength(1)
      expect(opsNamed(fake.calls[0], 'eq')).toEqual([['campaign_id', 'c1'], ['user_id', 'u2']])
      fake.enqueue({ data: [] }, { data: [] })
      await expect(repo.removeMember('c1', 'u2')).rejects.toMatchObject({ kind: 'not_found' })
    })

    it('setPjOwner writes only owner_id through the pjs update path (null releases)', async () => {
      const fake = createFakeClient()
      const repo = createCampaignRepository(fake.db)
      fake.enqueue({ data: { id: 7, owner_id: 'u2', data: {} } })
      await repo.setPjOwner(7, 'u2')
      expect(fake.calls[0]).toMatchObject({ kind: 'from', name: 'pjs' })
      expect(opsNamed(fake.calls[0], 'update')).toEqual([[{ owner_id: 'u2' }]])
      expect(opsNamed(fake.calls[0], 'eq')).toEqual([['id', 7]])
      fake.enqueue({ data: { id: 7, owner_id: null, data: {} } })
      await repo.setPjOwner(7, null)
      expect(opsNamed(fake.calls[1], 'update')).toEqual([[{ owner_id: null }]])
    })

    it('setPjOwner for a non-member surfaces owner_not_member', async () => {
      const fake = createFakeClient()
      fake.enqueue({ error: { message: 'character owner must be a member of the campaign', code: '23514' } })
      await expect(createCampaignRepository(fake.db).setPjOwner(7, 'stranger')).rejects.toMatchObject({ kind: 'validation', reason: 'owner_not_member' })
    })

    it('deleteCampaign calls the RPC with the typed slug; the refusals keep their reason', async () => {
      const fake = createFakeClient()
      const repo = createCampaignRepository(fake.db)
      await repo.deleteCampaign('c1', 'demo')
      expect(fake.calls[0]).toMatchObject({ kind: 'rpc', name: 'delete_campaign', args: { p_campaign_id: 'c1', p_confirm_slug: 'demo' } })
      fake.enqueue({ error: { message: 'slug_mismatch', code: 'P0001' } })
      await expect(repo.deleteCampaign('c1', 'x')).rejects.toMatchObject({ kind: 'business', reason: 'slug_mismatch' })
      fake.enqueue({ error: { message: 'dm_only', code: '42501' } })
      await expect(repo.deleteCampaign('c1', 'demo')).rejects.toMatchObject({ kind: 'permission', reason: 'dm_only' })
    })
  })

  describe('updateCampaign', () => {
    const stored = {
      id: 'c1',
      slug: 'demo',
      name: 'Demo',
      branding: { logo_url: 'https://x.test/a.png', accent_color: '#dc2626', future_key: { nested: true } },
      updated_at: 'v1',
    }

    it('sends only name and branding, merges branding onto the stored keys and guards on updated_at', async () => {
      const fake = createFakeClient()
      fake.enqueue({ data: stored }, { data: { ...stored, name: 'New', updated_at: 'v2' } })
      const out = await createCampaignRepository(fake.db).updateCampaign(
        'c1',
        { name: 'New', branding: { tagline: 'Hi', logo_url: null }, slug: 'hacked', settings: {} } as never,
        'v1',
      )
      expect(out.updated_at).toBe('v2')
      expect(opsNamed(fake.calls[1], 'update')).toEqual([[{ name: 'New', branding: { accent_color: '#dc2626', future_key: { nested: true }, tagline: 'Hi' } }]])
      expect(opsNamed(fake.calls[1], 'eq')).toEqual([['id', 'c1'], ['updated_at', 'v1']])
      expect(opsNamed(fake.calls[1], 'select')).toEqual([[join(CAMPAIGN_COLUMNS)]])
      fake.assertDrained()
    })

    it('leaves name out of the write when only branding changes', async () => {
      const fake = createFakeClient()
      fake.enqueue({ data: stored }, { data: stored })
      await createCampaignRepository(fake.db).updateCampaign('c1', { branding: { accent_color: '#112233' } })
      expect(Object.keys(opsNamed(fake.calls[1], 'update')[0][0] as object)).toEqual(['branding'])
    })

    it('does not write when the stored version is not the base', async () => {
      const fake = createFakeClient()
      fake.enqueue({ data: { ...stored, updated_at: 'v9' } })
      await expect(createCampaignRepository(fake.db).updateCampaign('c1', { name: 'New' }, 'v1')).rejects.toBeInstanceOf(ConflictError)
      expect(fake.calls).toHaveLength(1)
      fake.assertDrained()
    })

    it('reports a conflict when the row changes between the read and the write', async () => {
      const fake = createFakeClient()
      fake.enqueue({ data: stored }, { data: null }, { data: { ...stored, updated_at: 'v2' } })
      await expect(createCampaignRepository(fake.db).updateCampaign('c1', { name: 'New' }, 'v1')).rejects.toBeInstanceOf(ConflictError)
    })

    it('reports permission when the update matched nothing and the version is unchanged', async () => {
      const fake = createFakeClient()
      fake.enqueue({ data: stored }, { data: null }, { data: stored })
      await expect(createCampaignRepository(fake.db).updateCampaign('c1', { name: 'New' })).rejects.toMatchObject({ kind: 'permission' })
    })

    it('reports not_found when the campaign is not visible', async () => {
      const fake = createFakeClient()
      fake.enqueue({ data: null })
      await expect(createCampaignRepository(fake.db).updateCampaign('c1', { name: 'New' })).rejects.toMatchObject({ kind: 'not_found' })
    })

    it('writes regions and custom fields as whole arrays under the same guard, and never other columns', async () => {
      const fake = createFakeClient()
      const regions = [{ key: 'norte', label: 'Norte', color: '#112233' }]
      const fields = [{ key: 'lema', label: 'Lema', type: 'text' }]
      fake.enqueue({ data: stored }, { data: { ...stored, updated_at: 'v2' } })
      await createCampaignRepository(fake.db).updateCampaign('c1', { regions, character_custom_fields: fields, settings: {}, system: 'x' } as never, 'v1')
      expect(opsNamed(fake.calls[1], 'update')).toEqual([[{ regions, character_custom_fields: fields }]])
      expect(opsNamed(fake.calls[1], 'eq')).toEqual([['id', 'c1'], ['updated_at', 'v1']])
      fake.assertDrained()
    })

    it('conflicts on a stale base when writing regions, and rejects a non-array before any write', async () => {
      const fake = createFakeClient()
      fake.enqueue({ data: { ...stored, updated_at: 'v9' } })
      await expect(createCampaignRepository(fake.db).updateCampaign('c1', { regions: [] }, 'v1')).rejects.toBeInstanceOf(ConflictError)
      expect(fake.calls).toHaveLength(1)
      const fake2 = createFakeClient()
      fake2.enqueue({ data: stored })
      await expect(createCampaignRepository(fake2.db).updateCampaign('c1', { regions: {} as never })).rejects.toMatchObject({ kind: 'validation' })
      expect(fake2.calls).toHaveLength(1)
    })

    it('makes no write for an empty patch', async () => {
      const fake = createFakeClient()
      fake.enqueue({ data: stored })
      expect(await createCampaignRepository(fake.db).updateCampaign('c1', {}, 'v1')).toMatchObject({ id: 'c1' })
      expect(fake.calls).toHaveLength(1)
    })
  })

  it('last-DM protection (23514) surfaces as a validation error', async () => {
    const fake = createFakeClient()
    fake.enqueue({ error: { message: 'cannot remove the only DM', code: '23514' } })
    await expect(createCampaignRepository(fake.db).leaveCampaign('c1', 'u1')).rejects.toMatchObject({ kind: 'validation' })
  })
})

describe('player notes / read state / disponibilidad', () => {
  it('player notes upsert on the composite key and omit user_id by default', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: { text: 'hi' } })
    await createPlayerNotesRepository(fake.db).upsert({ campaignId: 'c1', entityType: 'pnjs', entityId: 2, text: 'hi' })
    expect(opsNamed(fake.calls[0], 'upsert')).toEqual([
      [{ campaign_id: 'c1', entity_type: 'pnjs', entity_id: 2, text: 'hi' }, { onConflict: 'user_id,campaign_id,entity_type,entity_id' }],
    ])
  })

  it('markSeen upserts a seen_at on the full key', async () => {
    const fake = createFakeClient()
    await createReadStateRepository(fake.db).markSeen('c1', 'pjs', 3, 'equipo', new Date('2026-01-01T00:00:00Z'))
    expect(opsNamed(fake.calls[0], 'upsert')).toEqual([
      [
        { campaign_id: 'c1', entity_type: 'pjs', entity_id: 3, section: 'equipo', seen_at: '2026-01-01T00:00:00.000Z' },
        { onConflict: 'user_id,campaign_id,entity_type,entity_id,section' },
      ],
    ])
  })

  it('disponibilidad writes only writable columns', async () => {
    const fake = createFakeClient()
    const repo = createDisponibilidadRepository(fake.db)
    fake.enqueue({ data: { id: 1 } })
    await repo.create('c1', { tipo: 'sesion', hora_inicio: '18:00', id: 5, created_by: 'x', character_id: 3 } as never)
    expect(opsNamed(fake.calls[0], 'insert')).toEqual([[{ tipo: 'sesion', hora_inicio: '18:00', campaign_id: 'c1' }]])
  })
})

const CAMPAIGN = '0b0f4a63-1f3e-4a4c-9d0a-2d6a4f7d1c11'

describe('player availability repository', () => {
  it('lists general rows plus the rows pinned to the campaign, with explicit columns and paging', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: [{ id: 1 }] }, { data: [] })
    const out = await createPlayerAvailabilityRepository(fake.db).list(CAMPAIGN)
    expect(out).toEqual([{ id: 1 }])
    expect(fake.calls[0].name).toBe('player_availability')
    expect(opsNamed(fake.calls[0], 'or')).toEqual([[`campaign_id.is.null,campaign_id.eq.${CAMPAIGN}`]])
    expect(opsNamed(fake.calls[0], 'select')[0][0]).not.toContain('*')
    expect(fake.calls.map((c) => opsNamed(c, 'range')[0])).toEqual([[0, 999], [1, 1000]])
  })

  it('refuses a campaign id that is not a uuid (it is interpolated into an or filter)', async () => {
    const fake = createFakeClient()
    await expect(createPlayerAvailabilityRepository(fake.db).list('x,campaign_id.not.is.null')).rejects.toMatchObject({ kind: 'validation' })
    expect(fake.calls).toHaveLength(0)
  })

  it('writes only writable columns (never user_id), maps "" to null and allows a general row', async () => {
    const fake = createFakeClient()
    const repo = createPlayerAvailabilityRepository(fake.db)
    fake.enqueue({ data: { id: 1 } }, { data: { id: 1 } })
    await repo.create({ tipo: 'no_disponible', fecha: '2026-01-01', campaign_id: '', id: 5, user_id: 'evil' } as never)
    expect(opsNamed(fake.calls[0], 'insert')).toEqual([[{ tipo: 'no_disponible', fecha: '2026-01-01', campaign_id: null }]])
    await repo.update(1, { campaign_id: CAMPAIGN, user_id: 'evil' } as never)
    expect(opsNamed(fake.calls[1], 'update')).toEqual([[{ campaign_id: CAMPAIGN }]])
  })

  it('update / remove with zero rows are permission when the row is readable, not_found otherwise', async () => {
    const fake = createFakeClient()
    const repo = createPlayerAvailabilityRepository(fake.db)
    fake.enqueue({ data: null }, { data: [{ id: 3 }] })
    await expect(repo.update(3, { fecha: '2026-01-01' })).rejects.toMatchObject({ kind: 'permission' })
    fake.enqueue({ data: [] }, { data: [] })
    await expect(repo.remove(3)).rejects.toMatchObject({ kind: 'not_found' })
  })

  it('busySlots calls the RPC with the campaign and maps a non-member refusal to a permission error', async () => {
    const fake = createFakeClient()
    const repo = createPlayerAvailabilityRepository(fake.db)
    fake.enqueue({ data: [{ user_id: 'u2', fecha_inicio: '2030-01-02', fecha_fin: '2030-01-02', hora_inicio: '14:00:00', hora_fin: '16:00:00' }] })
    expect(await repo.busySlots(CAMPAIGN)).toHaveLength(1)
    expect(fake.calls[0]).toMatchObject({ kind: 'rpc', name: 'campaign_busy_slots', args: { p_campaign_id: CAMPAIGN } })
    fake.enqueue({ error: { message: 'not_a_member', code: '42501' } })
    await expect(repo.busySlots(CAMPAIGN)).rejects.toMatchObject({ kind: 'permission', reason: 'not_a_member' })
    fake.enqueue({ data: null })
    expect(await repo.busySlots(CAMPAIGN)).toEqual([])
  })
})

describe('config repository', () => {
  const current = { campaign_id: 'c1', key: 'loteria', value: { a: 1 }, visibility: 'members', updated_at: 'v1' }

  it('patch merges top-level keys under an updated_at guard', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: current }, { data: { ...current, value: { a: 1, b: 2 }, updated_at: 'v2' } })
    const out = await createConfigRepository(fake.db).patch('c1', 'loteria', { b: 2 })
    expect(opsNamed(fake.calls[1], 'update')).toEqual([[{ value: { a: 1, b: 2 } }]])
    expect(opsNamed(fake.calls[1], 'eq')).toEqual([['campaign_id', 'c1'], ['key', 'loteria'], ['updated_at', 'v1']])
    expect(out.value).toEqual({ a: 1, b: 2 })
  })

  it('patch creates the row (with the requested visibility) when missing', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: null }, { data: { ...current, visibility: 'dm' } })
    await createConfigRepository(fake.db).patch('c1', 'session_screen', { cards: [] }, 'dm')
    expect(opsNamed(fake.calls[1], 'insert')).toEqual([[{ campaign_id: 'c1', key: 'session_screen', value: { cards: [] }, visibility: 'dm' }]])
  })

  it('patch re-reads and merges when the insert loses to a concurrent creator (23505)', async () => {
    const fake = createFakeClient()
    fake.enqueue(
      { data: null }, // get: row missing
      { error: { message: 'duplicate key', code: '23505' } }, // insert lost the race
      { data: current }, // re-read finds the other writer's row
      { data: { ...current, value: { a: 1, b: 2 }, updated_at: 'v2' } }, // guarded update
    )
    const out = await createConfigRepository(fake.db).patch('c1', 'loteria', { b: 2 })
    expect(out.value).toEqual({ a: 1, b: 2 })
    expect(opsNamed(fake.calls[3], 'update')).toEqual([[{ value: { a: 1, b: 2 } }]])
    fake.assertDrained()
  })

  it('patch reports not_found when the row vanishes mid-update', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: current }, { data: null }, { data: null })
    await expect(createConfigRepository(fake.db).patch('c1', 'loteria', { b: 2 })).rejects.toMatchObject({ kind: 'not_found' })
    fake.assertDrained()
  })

  it('patch reports permission when the update matched nothing but the version is unchanged', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: current }, { data: null }, { data: current })
    await expect(createConfigRepository(fake.db).patch('c1', 'loteria', { b: 2 })).rejects.toMatchObject({ kind: 'permission' })
    fake.assertDrained()
  })

  it('patch with a base writes only when the stored version is the base', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: current }, { data: { ...current, value: { a: 1, b: 2 }, updated_at: 'v2' } })
    const out = await createConfigRepository(fake.db).patch('c1', 'loteria', { b: 2 }, 'members', 'v1')
    expect(out.updated_at).toBe('v2')
    expect(opsNamed(fake.calls[1], 'eq')).toEqual([['campaign_id', 'c1'], ['key', 'loteria'], ['updated_at', 'v1']])
    fake.assertDrained()
  })

  it('patch with a stale base throws ConflictError without writing', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: { ...current, updated_at: 'v9' } })
    await expect(createConfigRepository(fake.db).patch('c1', 'loteria', { b: 2 }, 'members', 'v1')).rejects.toBeInstanceOf(ConflictError)
    expect(fake.calls).toHaveLength(1) // only the read
    fake.assertDrained()
  })

  it('patch with base null conflicts when the row already exists, and creates it when it does not', async () => {
    const exists = createFakeClient()
    exists.enqueue({ data: current })
    await expect(createConfigRepository(exists.db).patch('c1', 'session_screen', { cards: [] }, 'dm', null)).rejects.toBeInstanceOf(ConflictError)
    const missing = createFakeClient()
    missing.enqueue({ data: null }, { data: { ...current, key: 'session_screen', visibility: 'dm' } })
    await createConfigRepository(missing.db).patch('c1', 'session_screen', { cards: [] }, 'dm', null)
    expect(opsNamed(missing.calls[1], 'insert')).toHaveLength(1)
  })

  it('patch with a base does not retry when the insert or the update loses a race', async () => {
    const insertRace = createFakeClient()
    insertRace.enqueue({ data: null }, { error: { message: 'duplicate key', code: '23505' } })
    await expect(createConfigRepository(insertRace.db).patch('c1', 'k', { a: 1 }, 'dm', null)).rejects.toBeInstanceOf(ConflictError)
    insertRace.assertDrained()
    const updateRace = createFakeClient()
    updateRace.enqueue({ data: current }, { data: null }, { data: { ...current, updated_at: 'w1' } })
    await expect(createConfigRepository(updateRace.db).patch('c1', 'loteria', { b: 2 }, 'members', 'v1')).rejects.toBeInstanceOf(ConflictError)
    updateRace.assertDrained()
  })

  it('patch gives up with ConflictError when every attempt loses the race', async () => {
    const fake = createFakeClient()
    for (let i = 0; i < 3; i++) {
      fake.enqueue({ data: { ...current, updated_at: `v${i}` } }, { data: null }, { data: { ...current, updated_at: `w${i}` } })
    }
    await expect(createConfigRepository(fake.db).patch('c1', 'loteria', { b: 2 })).rejects.toBeInstanceOf(ConflictError)
  })

  it('set upserts the whole document', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: current })
    await createConfigRepository(fake.db).set('c1', 'loteria', { z: 1 })
    expect(opsNamed(fake.calls[0], 'upsert')).toEqual([
      [{ campaign_id: 'c1', key: 'loteria', value: { z: 1 }, visibility: 'members' }, { onConflict: 'campaign_id,key' }],
    ])
  })
})

describe('games repository', () => {
  it('calls the RPCs with the expected names and args', async () => {
    const fake = createFakeClient()
    const repo = createGamesRepository(fake.db)
    fake.enqueue({ data: { roll: 12, prize: {}, prize_target: 'pot' } })
    await repo.playLoteria('c1')
    expect(fake.calls[0]).toMatchObject({ kind: 'rpc', name: 'play_loteria', args: { p_campaign_id: 'c1' } })
    fake.enqueue({ data: { roll: 12, prize: {}, prize_target: 'player' } })
    await repo.playLoteria('c1', 4)
    expect(fake.calls[1].args).toEqual({ p_campaign_id: 'c1', p_character_id: 4 })

    fake.enqueue({ data: { campaign_id: 'c1', gp: 0 } })
    await repo.assignPotToCharacter('c1', 4, { gp: 5 })
    expect(fake.calls[2]).toMatchObject({ name: 'assign_pot_to_character', args: { p_campaign_id: 'c1', p_character_id: 4, p_coins: { gp: 5 } } })
  })

  it('maps RPC business errors', async () => {
    const fake = createFakeClient()
    fake.enqueue({ error: { message: 'already_played_today', code: 'P0001' } })
    await expect(createGamesRepository(fake.db).playLoteria('c1', 4)).rejects.toMatchObject({
      kind: 'business',
      message: 'already_played_today',
    })
  })

  it('reads pot and logs with explicit columns', async () => {
    const fake = createFakeClient()
    const repo = createGamesRepository(fake.db)
    fake.enqueue({ data: null })
    await repo.getPot('c1')
    fake.enqueue({ data: [] })
    await repo.listLogs('c1')
    for (const call of fake.calls) expect(opsNamed(call, 'select')[0][0]).not.toContain('*')
    expect(fake.calls.map((c) => c.name)).toEqual(['game_pot', 'game_logs'])
  })
})

describe('disponibilidad coercion and zero-row handling', () => {
  it("writes '' as null for nullable columns", async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: { id: 1 } })
    await createDisponibilidadRepository(fake.db).create('c1', { tipo: 'sesion', fecha_inicio: '', hora_inicio: '' })
    expect(opsNamed(fake.calls[0], 'insert')[0][0]).toEqual({ tipo: 'sesion', fecha_inicio: null, hora_inicio: null, campaign_id: 'c1' })
  })

  it('update with zero rows is permission when the row exists, not_found otherwise', async () => {
    const fake = createFakeClient()
    const repo = createDisponibilidadRepository(fake.db)
    fake.enqueue({ data: null }, { data: [{ id: 3 }] })
    await expect(repo.update(3, { hora_fin: '23:00' })).rejects.toMatchObject({ kind: 'permission' })
    fake.enqueue({ data: null }, { data: [] })
    await expect(repo.update(3, { hora_fin: '23:00' })).rejects.toMatchObject({ kind: 'not_found' })
  })

  it('removeLog and leaveCampaign disambiguate zero rows too', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: [] }, { data: [{ id: 1 }] })
    await expect(createGamesRepository(fake.db).removeLog(1)).rejects.toMatchObject({ kind: 'permission' })
    fake.enqueue({ data: [] }, { data: [{ user_id: 'u1' }] })
    await expect(createCampaignRepository(fake.db).leaveCampaign('c1', 'u1')).rejects.toMatchObject({ kind: 'permission' })
  })

  it('writes that return no row are written_not_visible (config, invite, dm notes)', async () => {
    const fake = createFakeClient()
    const gone = { error: { message: 'no rows', code: 'PGRST116' } }
    fake.enqueue(gone)
    await expect(createCampaignRepository(fake.db).createInvite({ campaign_id: 'c1' })).rejects.toMatchObject({ kind: 'written_not_visible' })
    fake.enqueue(gone)
    await expect(createConfigRepository(fake.db).set('c1', 'k', {})).rejects.toMatchObject({ kind: 'written_not_visible' })
    fake.enqueue(gone)
    await expect(createDmNotesRepository(fake.db).upsert('c1', 'pnjs', 1, { notas: 'n' })).rejects.toMatchObject({ kind: 'written_not_visible' })
  })

  it('list functions page with range until an empty page', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: Array.from({ length: 1000 }, (_, i) => ({ id: i })) }, { data: [] })
    const out = await createDisponibilidadRepository(fake.db).list('c1')
    expect(out).toHaveLength(1000)
    expect(fake.calls.map((c) => opsNamed(c, 'range')[0])).toEqual([[0, 999], [1000, 1999]])
    fake.assertDrained()
  })
})

describe('player notes repository: update (DM correcting another user\'s note)', () => {
  it('UPDATEs the existing row by its full key and never inserts', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: { text: 'nueva', user_id: 'u2' } })
    const note = await createPlayerNotesRepository(fake.db).update('c1', 'u2', 'lore', 4, 'nueva')
    expect(note).toMatchObject({ text: 'nueva' })
    const ops = fake.calls[0].ops.map(([m]) => m)
    expect(ops).toContain('update')
    expect(ops).not.toContain('upsert')
    expect(opsNamed(fake.calls[0], 'update')[0]).toEqual([{ text: 'nueva' }])
    expect(opsNamed(fake.calls[0], 'match')[0]).toEqual([{ campaign_id: 'c1', user_id: 'u2', entity_type: 'lore', entity_id: 4 }])
  })

  it('zero rows is permission when the note is readable, not_found otherwise', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: null }, { data: [{ campaign_id: 'c1' }] })
    await expect(createPlayerNotesRepository(fake.db).update('c1', 'u2', 'lore', 4, 'x')).rejects.toMatchObject({ kind: 'permission' })
    fake.enqueue({ data: null }, { data: [] })
    await expect(createPlayerNotesRepository(fake.db).update('c1', 'u2', 'lore', 4, 'x')).rejects.toMatchObject({ kind: 'not_found' })
  })
})
