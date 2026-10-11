import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDataLayer, type DataLayer } from '../index'
import { createAdminClient, createTestUser, type TestUser } from './testUsers'

const env = inject('supabase')

/**
 * H10c: the invite flow through the REAL data layer, RLS and RPCs. Preview must be read-only and
 * leak nothing beyond what the code holder is meant to see; accept consumes exactly one use;
 * revoke is a DM-only delete that makes the code dead.
 */
describe('invites: preview, accept and revoke against the local stack', () => {
  let dm: TestUser
  let guest: TestUser
  let stranger: TestUser
  let dmData: DataLayer
  let guestData: DataLayer
  let strangerData: DataLayer
  let campaignId = ''
  let otherCampaignId = ''
  let freePjId = 0
  const created: TestUser[] = []

  async function newUser(label: string, hubOwner = false) {
    const user = await createTestUser(env, label, { hubOwner })
    created.push(user)
    return user
  }

  async function cleanup() {
    const admin = createAdminClient(env)
    for (const id of [campaignId, otherCampaignId]) if (id) await admin.from('campaigns').delete().eq('id', id)
    campaignId = ''
    otherCampaignId = ''
    for (const u of created.splice(0)) await admin.auth.admin.deleteUser(u.id)
  }

  const usesOf = async (code: string) => {
    const { data, error } = await createAdminClient(env).from('campaign_invites').select('uses').eq('code', code).single()
    if (error) throw error
    return data.uses
  }

  beforeAll(async () => {
    try {
      dm = await newUser('inv-dm', true)
      guest = await newUser('inv-guest')
      stranger = await newUser('inv-stranger')
      dmData = createDataLayer(dm.client)
      guestData = createDataLayer(guest.client)
      strangerData = createDataLayer(stranger.client)
      const campaign = await dmData.campaigns.createCampaign(`h10c-${randomBytes(4).toString('hex')}`, 'H10c integration')
      campaignId = campaign.id
      const other = await dmData.campaigns.createCampaign(`h10c-${randomBytes(4).toString('hex')}`, 'H10c other secret name')
      otherCampaignId = other.id
      await dmData.campaigns.updateCampaign(campaignId, { branding: { logo_url: 'https://cdn.test/logo.png' } })
      freePjId = (await dmData.entity('pjs').create(campaignId, { nombre: 'Eldric' })).id
      await dmData.entity('pjs').create(campaignId, { nombre: 'Someone Else' })
    } catch (e) {
      await cleanup().catch(() => undefined)
      throw e
    }
  })

  afterAll(cleanup)

  it('previews a plain invite without consuming it, then accept consumes exactly one use', async () => {
    const invite = await dmData.campaigns.createInvite({ campaign_id: campaignId, role: 'player', max_uses: 2 })
    const preview = await guestData.campaigns.previewInvite(invite.code)
    expect(preview).toMatchObject({
      campaign_name: 'H10c integration', role: 'player', character_name: null, logo_url: 'https://cdn.test/logo.png',
      is_member: false, nothing_to_do: false,
    })
    // nothing leaks beyond the seven documented fields
    expect(Object.keys(preview).sort()).toEqual([
      'campaign_name', 'campaign_slug', 'character_name', 'is_member', 'logo_url', 'nothing_to_do', 'role',
    ])
    await guestData.campaigns.previewInvite(invite.code)
    expect(await usesOf(invite.code)).toBe(0)
    expect(await dmData.campaigns.listMembers(campaignId)).toHaveLength(1)

    const accepted = await guestData.campaigns.acceptInvite(invite.code)
    expect(accepted).toMatchObject({ joined: true, role: 'player' })
    expect(await usesOf(invite.code)).toBe(1)

    // now a member: the preview says there is nothing to do
    expect(await guestData.campaigns.previewInvite(invite.code)).toMatchObject({ is_member: true, nothing_to_do: true })
  })

  it('a claim invite previews only its character, and nobody but the DM can list the invites', async () => {
    const invite = await dmData.campaigns.createInvite({ campaign_id: campaignId, role: 'player', character_id: freePjId })
    const preview = await strangerData.campaigns.previewInvite(invite.code)
    expect(preview.character_name).toBe('Eldric')
    expect(JSON.stringify(preview)).not.toContain('Someone Else')
    expect(JSON.stringify(preview)).not.toContain(invite.code)
    expect(JSON.stringify(preview)).not.toContain('other secret name')
    expect(await strangerData.campaigns.listInvites(campaignId)).toEqual([])
    expect(await guestData.campaigns.listInvites(campaignId)).toEqual([]) // a plain member neither
  })

  it('DM triggers: a second live invite for the same character, and an owned character, are refused with their reasons', async () => {
    await expect(dmData.campaigns.createInvite({ campaign_id: campaignId, character_id: freePjId })).rejects.toMatchObject({
      reason: 'character_already_has_pending_invite',
    })
    const invites = await dmData.campaigns.listInvites(campaignId)
    const claim = invites.find((i) => i.character_id === freePjId)!
    await strangerData.campaigns.acceptInvite(claim.code)
    await expect(dmData.campaigns.createInvite({ campaign_id: campaignId, character_id: freePjId })).rejects.toMatchObject({
      reason: 'character_already_owned',
    })
  })

  it('a DM invite is single use and expires within 7 days whatever the client sends', async () => {
    const far = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
    const invite = await dmData.campaigns.createInvite({ campaign_id: campaignId, role: 'dm', max_uses: 9, expires_at: far })
    expect(invite.max_uses).toBe(1)
    expect(Date.parse(invite.expires_at!)).toBeLessThanOrEqual(Date.now() + 7 * 24 * 3600 * 1000 + 60_000)
    expect(await createDataLayer((await newUser('inv-peek')).client).campaigns.previewInvite(invite.code)).toMatchObject({ role: 'dm' })
  })

  it('mirrors accept_invite for bad codes: not found, expired and exhausted keep their reason', async () => {
    await expect(guestData.campaigns.previewInvite('no-such-code')).rejects.toMatchObject({ kind: 'business', reason: 'invite_not_found' })

    const expired = await dmData.campaigns.createInvite({ campaign_id: campaignId, max_uses: 2 })
    await createAdminClient(env).from('campaign_invites').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', expired.id)
    const outsider = createDataLayer((await newUser('inv-outsider')).client)
    await expect(outsider.campaigns.previewInvite(expired.code)).rejects.toMatchObject({ reason: 'invite_expired' })
    await expect(outsider.campaigns.acceptInvite(expired.code)).rejects.toMatchObject({ reason: 'invite_expired' })

    const used = await dmData.campaigns.createInvite({ campaign_id: campaignId, max_uses: 1 })
    await createDataLayer((await newUser('inv-third')).client).campaigns.acceptInvite(used.code)
    await expect(outsider.campaigns.previewInvite(used.code)).rejects.toMatchObject({ reason: 'invite_exhausted' })
    const list = await dmData.campaigns.listInvites(campaignId)
    expect(list.find((i) => i.id === used.id)).toMatchObject({ uses: 1, max_uses: 1 })
  })

  it('revoke is DM only; once revoked the code is dead for preview and accept', async () => {
    const invite = await dmData.campaigns.createInvite({ campaign_id: campaignId, max_uses: 3 })
    // a member who is not the DM sees no invite and deletes nothing
    await expect(guestData.campaigns.revokeInvite(invite.id)).rejects.toMatchObject({ kind: 'not_found' })
    expect((await dmData.campaigns.listInvites(campaignId)).some((i) => i.id === invite.id)).toBe(true)

    await dmData.campaigns.revokeInvite(invite.id)
    await expect(dmData.campaigns.revokeInvite(invite.id)).rejects.toMatchObject({ kind: 'not_found' })
    await expect(guestData.campaigns.previewInvite(invite.code)).rejects.toMatchObject({ reason: 'invite_not_found' })
    await expect(strangerData.campaigns.acceptInvite(invite.code)).rejects.toMatchObject({ reason: 'invite_not_found' })
  })

  it('the DM of another campaign cannot list or revoke these invites', async () => {
    const invite = await dmData.campaigns.createInvite({ campaign_id: campaignId, max_uses: 1 })
    const otherDm = createDataLayer((await newUser('inv-otherdm', true)).client)
    const mine = await otherDm.campaigns.createCampaign(`h10c-${randomBytes(4).toString('hex')}`, 'Other DM campaign')
    try {
      expect(await otherDm.campaigns.listInvites(campaignId)).toEqual([])
      await expect(otherDm.campaigns.revokeInvite(invite.id)).rejects.toMatchObject({ kind: 'not_found' })
    } finally {
      await createAdminClient(env).from('campaigns').delete().eq('id', mine.id)
    }
  })

  it('a second accept after the first one committed (a lost response, a retry) leaves the uses unchanged', async () => {
    const invite = await dmData.campaigns.createInvite({ campaign_id: campaignId, role: 'player', max_uses: 3 })
    const retrier = createDataLayer((await newUser('inv-retry')).client)
    expect(await retrier.campaigns.acceptInvite(invite.code)).toMatchObject({ joined: true })
    expect(await usesOf(invite.code)).toBe(1)
    expect(await retrier.campaigns.acceptInvite(invite.code)).toMatchObject({ joined: false, claimed: false, role: 'player' })
    expect(await usesOf(invite.code)).toBe(1)
  })

  it('an existing player previewing and accepting a dm invite keeps their role and consumes nothing', async () => {
    const invite = await dmData.campaigns.createInvite({ campaign_id: campaignId, role: 'dm' })
    expect(await guestData.campaigns.previewInvite(invite.code)).toMatchObject({ role: 'dm', is_member: true, nothing_to_do: true })
    expect(await guestData.campaigns.acceptInvite(invite.code)).toMatchObject({ joined: false, role: 'player' })
    expect(await usesOf(invite.code)).toBe(0)
    const members = await dmData.campaigns.listMembers(campaignId)
    expect(members.find((m) => m.user_id === guest.id)?.role).toBe('player')
  })

  it('a member previewing an expired or exhausted claim invite for an unowned character still gets the error', async () => {
    const admin = createAdminClient(env)
    const expiredPj = (await dmData.entity('pjs').create(campaignId, { nombre: 'Claim Expired' })).id
    const usedPj = (await dmData.entity('pjs').create(campaignId, { nombre: 'Claim Used' })).id
    const expired = await dmData.campaigns.createInvite({ campaign_id: campaignId, character_id: expiredPj })
    await admin.from('campaign_invites').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', expired.id)
    const used = await dmData.campaigns.createInvite({ campaign_id: campaignId, character_id: usedPj })
    await admin.from('campaign_invites').update({ uses: 1 }).eq('id', used.id)
    await expect(guestData.campaigns.previewInvite(expired.code)).rejects.toMatchObject({ reason: 'invite_expired' })
    await expect(guestData.campaigns.acceptInvite(expired.code)).rejects.toMatchObject({ reason: 'invite_expired' })
    await expect(guestData.campaigns.previewInvite(used.code)).rejects.toMatchObject({ reason: 'invite_exhausted' })
  })

  it('player invites are limited server-side: at most 100 uses and an expiry within 365 days, whatever the client sends', async () => {
    const invite = await dmData.campaigns.createInvite({ campaign_id: campaignId, role: 'player', max_uses: 5000 })
    expect(invite.max_uses).toBe(100)
    expect(invite.expires_at).not.toBeNull()
    expect(Date.parse(invite.expires_at!)).toBeLessThanOrEqual(Date.now() + 365 * 24 * 3600 * 1000 + 60_000)
    const far = await dmData.campaigns.createInvite({
      campaign_id: campaignId, max_uses: 2, expires_at: new Date(Date.now() + 5 * 365 * 24 * 3600 * 1000).toISOString(),
    })
    expect(Date.parse(far.expires_at!)).toBeLessThanOrEqual(Date.now() + 365 * 24 * 3600 * 1000 + 60_000)
  })

  it('anon cannot preview an invite', async () => {
    const anon = createClient(env.url, env.anonKey, { auth: { persistSession: false } })
    const { error } = await anon.rpc('preview_invite', { p_code: 'whatever' })
    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')
  })
})
