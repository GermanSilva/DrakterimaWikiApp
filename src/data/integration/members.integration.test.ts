import { randomBytes } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest'
import { createDataLayer, type DataLayer } from '../index'
import { createAdminClient, createTestUser, type TestUser } from './testUsers'

const env = inject('supabase')

/**
 * H10d: member administration through the REAL data layer, RLS, triggers and the delete_campaign RPC.
 * Co-DMs are allowed; only the last DM is protected; kicking releases characters and keeps content.
 * Users are shared (nothing here changes them); every test gets its OWN campaign, character and memberships
 * (beforeEach) and the campaign is deleted afterwards (afterEach), so a failure in one test cannot cascade.
 */
describe('members, roles, character owners and campaign deletion against the local stack', () => {
  let dm: TestUser
  let bob: TestUser
  let carol: TestUser
  let outsider: TestUser
  let dmData: DataLayer
  let bobData: DataLayer
  let outsiderData: DataLayer
  let campaignId = ''
  let slug = ''
  let pjId = 0
  const created: TestUser[] = []

  async function newUser(label: string) {
    const user = await createTestUser(env, label)
    created.push(user)
    return user
  }

  // the campaign's DMs are deleted with the campaign first: protect_last_dm blocks deleting an account that is the only DM
  async function dropCampaign() {
    if (campaignId) await createAdminClient(env).from('campaigns').delete().eq('id', campaignId)
    campaignId = ''
  }
  async function cleanup() {
    await dropCampaign()
    const admin = createAdminClient(env)
    for (const u of created.splice(0)) await admin.auth.admin.deleteUser(u.id)
  }

  const join = async (user: TestUser) => {
    const invite = await dmData.campaigns.createInvite({ campaign_id: campaignId, role: 'player', max_uses: 5 })
    await createDataLayer(user.client).campaigns.acceptInvite(invite.code)
  }
  const roleOf = async (userId: string) => (await dmData.campaigns.listMembers(campaignId)).find((m) => m.user_id === userId)?.role

  beforeAll(async () => {
    try {
      dm = await newUser('mem-dm')
      bob = await newUser('mem-bob')
      carol = await newUser('mem-carol')
      outsider = await newUser('mem-outsider')
      dmData = createDataLayer(dm.client)
      bobData = createDataLayer(bob.client)
      outsiderData = createDataLayer(outsider.client)
    } catch (e) {
      await cleanup().catch(() => undefined)
      throw e
    }
  })

  beforeEach(async () => {
    try {
      slug = `h10d-${randomBytes(4).toString('hex')}`
      campaignId = (await dmData.campaigns.createCampaign(slug, 'H10d integration')).id
      pjId = (await dmData.entity('pjs').create(campaignId, { nombre: 'Eldric' })).id
      await join(bob)
      await join(carol)
    } catch (e) {
      await dropCampaign().catch(() => undefined)
      throw e
    }
  })

  afterEach(dropCampaign)
  afterAll(cleanup)

  it('a player cannot change roles, kick anyone or assign characters', async () => {
    await expect(bobData.campaigns.updateMemberRole(campaignId, bob.id, 'dm')).rejects.toMatchObject({ kind: 'permission' })
    await expect(bobData.campaigns.removeMember(campaignId, carol.id)).rejects.toMatchObject({ kind: 'permission' })
    await expect(bobData.campaigns.setPjOwner(pjId, bob.id)).rejects.toMatchObject({ kind: 'permission' })
    expect(await roleOf(bob.id)).toBe('player')
  })

  it('assigns a character to a member, releases it, and refuses someone who is not a member', async () => {
    await dmData.campaigns.setPjOwner(pjId, bob.id)
    expect((await dmData.entity('pjs').get(pjId))?.owner_id).toBe(bob.id)
    await expect(dmData.campaigns.setPjOwner(pjId, outsider.id)).rejects.toMatchObject({ kind: 'validation', reason: 'owner_not_member' })
    expect((await dmData.entity('pjs').get(pjId))?.owner_id).toBe(bob.id)
    await dmData.campaigns.setPjOwner(pjId, null)
    expect((await dmData.entity('pjs').get(pjId))?.owner_id).toBeNull()
  })

  it('promotes to co-DM, lets the co-DM demote the original DM, and protects the last DM', async () => {
    await dmData.campaigns.updateMemberRole(campaignId, bob.id, 'dm')
    expect(await roleOf(bob.id)).toBe('dm')

    // the original DM cannot be the only one left to demote: first demote them while Bob is DM (allowed)
    await bobData.campaigns.updateMemberRole(campaignId, dm.id, 'player')
    expect(await bobData.campaigns.listMembers(campaignId).then((ms) => ms.find((m) => m.user_id === dm.id)?.role)).toBe('player')

    // Bob is now the last DM
    await expect(bobData.campaigns.updateMemberRole(campaignId, bob.id, 'player')).rejects.toMatchObject({ kind: 'validation', reason: 'last_dm' })
    await expect(bobData.campaigns.removeMember(campaignId, bob.id)).rejects.toMatchObject({ kind: 'validation', reason: 'last_dm' })
    expect((await bobData.campaigns.listMembers(campaignId)).find((m) => m.user_id === bob.id)?.role).toBe('dm')

    // give the role back
    await bobData.campaigns.updateMemberRole(campaignId, dm.id, 'dm')
    expect(await roleOf(dm.id)).toBe('dm')
    await dmData.campaigns.updateMemberRole(campaignId, bob.id, 'player')
    expect(await roleOf(bob.id)).toBe('player')
  })

  it('kicking a member releases their characters and keeps the content', async () => {
    await dmData.campaigns.setPjOwner(pjId, carol.id)
    const note = await dmData.entity('pnjs').create(campaignId, { nombre: 'Npc that stays' })
    await dmData.campaigns.removeMember(campaignId, carol.id)
    expect(await roleOf(carol.id)).toBeUndefined()
    expect((await dmData.entity('pjs').get(pjId))?.owner_id).toBeNull()
    expect((await dmData.entity('pnjs').get(note.id))?.nombre).toBe('Npc that stays')
    await expect(dmData.campaigns.removeMember(campaignId, carol.id)).rejects.toMatchObject({ kind: 'not_found' })
  })

  it('delete_campaign: only a DM, only with the right slug, and everything goes', async () => {
    await expect(outsiderData.campaigns.deleteCampaign(campaignId, slug)).rejects.toMatchObject({ reason: 'dm_only' })
    await expect(bobData.campaigns.deleteCampaign(campaignId, slug)).rejects.toMatchObject({ reason: 'dm_only' })
    await expect(dmData.campaigns.deleteCampaign(campaignId, 'wrong-slug')).rejects.toMatchObject({ kind: 'business', reason: 'slug_mismatch' })
    expect(await dmData.campaigns.getCampaignBySlug(slug)).not.toBeNull()

    await dmData.campaigns.deleteCampaign(campaignId, slug)
    expect(await dmData.campaigns.getCampaignBySlug(slug)).toBeNull()
    const admin = createAdminClient(env)
    for (const table of ['campaign_members', 'pjs', 'pnjs', 'campaign_invites'] as const) {
      const { count } = await admin.from(table).select('*', { count: 'exact', head: true }).eq('campaign_id', campaignId)
      expect(count, table).toBe(0)
    }
    const { count: profiles } = await admin.from('profiles').select('*', { count: 'exact', head: true }).in('id', [dm.id, bob.id, carol.id])
    expect(profiles).toBe(3)
    campaignId = ''
  })
})
