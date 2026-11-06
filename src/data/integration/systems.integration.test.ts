import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDataLayer, type DataLayer } from '../index'
import { createAdminClient, createTestUser, type TestUser } from './testUsers'

const env = inject('supabase')

/**
 * G8a (S25, S32): systems through the REAL data layer, RLS and RPCs. Hub owner, DM, player and outsider see different lists; a DM
 * branches a homebrew, the hub owner promotes it to an origin and archives it, a request with a base gets a COPY, and a demoted DM
 * keeps a frozen copy.
 */
describe('systems (G8a): hub owner, DM, player and outsider against the local stack', () => {
  let owner: TestUser
  let dm: TestUser
  let player: TestUser
  let outsider: TestUser
  let ownerData: DataLayer
  let dmData: DataLayer
  let playerData: DataLayer
  let outsiderData: DataLayer
  let campaignId: string
  const users: TestUser[] = []
  const slugs: string[] = []
  const tag = randomBytes(3).toString('hex')
  const slug = (s: string) => {
    const full = `g8a-${s}-${tag}`
    slugs.push(full)
    return full
  }
  const label = (s: string) => `g8a ${s} ${tag}`

  async function cleanup() {
    const admin = createAdminClient(env)
    // campaigns first (protect_last_dm); the systems made by the test go with them or are removed by name (origins have no owner)
    if (slugs.length > 0) await admin.from('campaigns').delete().in('slug', slugs)
    await admin.from('systems').delete().like('name', `%${tag}%`)
    for (const u of users.splice(0)) await admin.auth.admin.deleteUser(u.id)
  }

  beforeAll(async () => {
    try {
      owner = await createTestUser(env, 'g8aown', { hubOwner: true })
      users.push(owner)
      dm = await createTestUser(env, 'g8adm')
      users.push(dm)
      player = await createTestUser(env, 'g8apl')
      users.push(player)
      outsider = await createTestUser(env, 'g8aout')
      users.push(outsider)
      ownerData = createDataLayer(owner.client)
      dmData = createDataLayer(dm.client)
      playerData = createDataLayer(player.client)
      outsiderData = createDataLayer(outsider.client)

      const created = await ownerData.campaigns.createCampaign(slug('c1'), 'G8a C1')
      campaignId = created.id
      const admin = createAdminClient(env)
      const members = await admin.from('campaign_members').insert([
        { campaign_id: campaignId, user_id: dm.id, role: 'dm' },
        { campaign_id: campaignId, user_id: player.id, role: 'player' },
      ])
      if (members.error) throw new Error(members.error.message)
    } catch (e) {
      await cleanup()
      throw e
    }
  })
  afterAll(cleanup)

  it('only a DM of the campaign branches a homebrew; the others get dm_only', async () => {
    await expect(playerData.systems.branchSystem(campaignId, label('player'))).rejects.toMatchObject({ kind: 'permission', reason: 'dm_only' })
    await expect(outsiderData.systems.branchSystem(campaignId, label('outsider'))).rejects.toMatchObject({ kind: 'permission', reason: 'dm_only' })

    const homebrew = await dmData.systems.branchSystem(campaignId, label('homebrew'))
    expect(homebrew).toMatchObject({ kind: 'homebrew', owner_id: dm.id, campaign_id: campaignId, archived_at: null })
    expect(homebrew).not.toHaveProperty('document')
    expect(await dmData.systems.getSystemDocument(homebrew.id)).toMatchObject({ version: 1 })
  })

  it('visibility: the DM and the hub owner see the homebrew; the player and the outsider do not', async () => {
    const names = async (data: DataLayer) => (await data.systems.listAvailableBases()).map((s) => s.name)
    expect(await names(dmData)).toContain(label('homebrew'))
    expect(await names(playerData)).not.toContain(label('homebrew'))
    expect(await names(outsiderData)).not.toContain(label('homebrew'))
    expect((await ownerData.systems.listAllSystems()).map((s) => s.name)).toContain(label('homebrew'))
    await expect(outsiderData.systems.getSystemDocument((await dmData.systems.listAvailableBases()).find((s) => s.name === label('homebrew'))!.id)).resolves.toBeNull()
  })

  it('only the owner renames a homebrew; only the hub owner promotes and archives', async () => {
    const homebrew = (await dmData.systems.listAvailableBases()).find((s) => s.name === label('homebrew'))!
    await expect(outsiderData.systems.renameSystem(homebrew.id, 'x')).rejects.toMatchObject({ reason: 'system_not_found' })
    expect(await dmData.systems.renameSystem(homebrew.id, label('renamed'))).toMatchObject({ id: homebrew.id, name: label('renamed') })

    await expect(dmData.systems.promoteSystem(homebrew.id)).rejects.toMatchObject({ kind: 'permission', reason: 'hub_owner_only' })
    await expect(dmData.systems.createOriginFromCampaign(campaignId, label('nope'))).rejects.toMatchObject({ reason: 'hub_owner_only' })
    const origin = await ownerData.systems.promoteSystem(homebrew.id, label('origin'))
    expect(origin).toMatchObject({ kind: 'origin', owner_id: null, branched_from: homebrew.id })
    await expect(ownerData.systems.promoteSystem(origin.id)).rejects.toMatchObject({ kind: 'business', reason: 'invalid_system_kind' })
    await expect(dmData.systems.archiveSystem(origin.id, true)).rejects.toMatchObject({ reason: 'hub_owner_only' })

    // any signed-in user lists the origin, so a requester can pick it
    expect((await outsiderData.systems.listAvailableBases()).map((s) => s.name)).toContain(label('origin'))
    expect((await playerData.systems.listAvailableBases()).map((s) => s.name)).toContain(label('origin'))
  })

  it('a request with a base gets a COPY; an archived base is refused at request time and at approval', async () => {
    const origin = (await outsiderData.systems.listAvailableBases()).find((s) => s.name === label('origin'))!
    const wanted = slug('req')
    const request = await outsiderData.campaignRequests.createCampaignRequest({ name: 'Based', slug_wanted: wanted, system_id: origin.id })
    expect(request.system_id).toBe(origin.id)
    expect(await ownerData.campaignRequests.approveCampaignRequest(request.id)).toBe(wanted)

    const admin = createAdminClient(env)
    const made = await admin.from('campaigns').select('based_on_system, system_profile').eq('slug', wanted).single()
    expect(made.data?.based_on_system).toBe(origin.id)
    expect(made.data?.system_profile).toEqual(await ownerData.systems.getSystemDocument(origin.id))

    const pending = await outsiderData.campaignRequests.createCampaignRequest({ name: 'Late', slug_wanted: slug('late'), system_id: origin.id })
    await ownerData.systems.archiveSystem(origin.id, true)
    await expect(ownerData.campaignRequests.approveCampaignRequest(pending.id)).rejects.toMatchObject({ kind: 'business', reason: 'system_not_available' })
    await expect(outsiderData.campaignRequests.createCampaignRequest({ name: 'Never', slug_wanted: slug('never'), system_id: origin.id })).rejects.toMatchObject({
      reason: 'system_not_available',
    })
    expect((await outsiderData.systems.listAvailableBases()).map((s) => s.name)).not.toContain(label('origin'))
    expect((await ownerData.systems.listAllSystems()).find((s) => s.id === origin.id)?.archived_at).not.toBeNull()
    await ownerData.systems.archiveSystem(origin.id, false)
    expect((await outsiderData.systems.listAvailableBases()).map((s) => s.name)).toContain(label('origin'))
  })

  it('a request without a base is unchanged', async () => {
    const wanted = slug('plain')
    const request = await outsiderData.campaignRequests.createCampaignRequest({ name: 'Plain', slug_wanted: wanted })
    expect(request.system_id).toBeNull()
    await ownerData.campaignRequests.approveCampaignRequest(request.id)
    const made = await createAdminClient(env).from('campaigns').select('based_on_system').eq('slug', wanted).single()
    expect(made.data?.based_on_system).toBeNull()
  })

  it('a DM who stops managing the campaign keeps a frozen copy and loses the homebrew', async () => {
    const admin = createAdminClient(env)
    const demoted = await admin.from('campaign_members').update({ role: 'player' }).eq('campaign_id', campaignId).eq('user_id', dm.id)
    expect(demoted.error).toBeNull()
    const bases = await dmData.systems.listAvailableBases()
    expect(bases.filter((s) => s.kind === 'frozen')).toHaveLength(1)
    expect(bases.find((s) => s.kind === 'frozen')).toMatchObject({ owner_id: dm.id, campaign_id: campaignId })
    expect(bases.some((s) => s.kind === 'homebrew')).toBe(false)
    expect((await playerData.systems.listAvailableBases()).some((s) => s.kind === 'frozen')).toBe(false)
  })
})
