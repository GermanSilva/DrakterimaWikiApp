import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { createDataLayer, type DataLayer } from '../index'
import { createAdminClient, createTestUser, type TestUser } from './testUsers'

const env = inject('supabase')

/**
 * H15: Hub Owner + campaign requests through the REAL data layer, RLS and RPCs: an ordinary user cannot create
 * campaigns or write hub_owners, requests flow to the owner's inbox, approval makes the REQUESTER the DM.
 */
describe('hub owner and campaign requests against the local stack', () => {
  let owner: TestUser
  let requester: TestUser
  let stranger: TestUser
  let ownerData: DataLayer
  let requesterData: DataLayer
  let strangerData: DataLayer
  const users: TestUser[] = []
  const slugs: string[] = []
  const tag = randomBytes(3).toString('hex')
  const slug = (s: string) => {
    const full = `h15-${s}-${tag}`
    slugs.push(full)
    return full
  }

  async function cleanup() {
    const admin = createAdminClient(env)
    // campaigns first: protect_last_dm blocks deleting an account that is the only DM of a campaign
    if (slugs.length > 0) await admin.from('campaigns').delete().in('slug', slugs)
    for (const u of users.splice(0)) await admin.auth.admin.deleteUser(u.id)
  }

  beforeAll(async () => {
    try {
      owner = await createTestUser(env, 'h15own', { hubOwner: true })
      users.push(owner)
      requester = await createTestUser(env, 'h15req')
      users.push(requester)
      stranger = await createTestUser(env, 'h15str')
      users.push(stranger)
      ownerData = createDataLayer(owner.client)
      requesterData = createDataLayer(requester.client)
      strangerData = createDataLayer(stranger.client)
    } catch (e) {
      await cleanup()
      throw e
    }
  })
  afterAll(cleanup)

  it('knows who the hub owner is', async () => {
    expect(await ownerData.campaignRequests.isHubOwner()).toBe(true)
    expect(await requesterData.campaignRequests.isHubOwner()).toBe(false)
  })

  it('an ordinary user cannot appoint themselves, create a campaign or insert one directly', async () => {
    const { error } = await requester.client.from('hub_owners').insert({ user_id: requester.id })
    expect(error?.code).toBe('42501')
    expect(await requesterData.campaignRequests.isHubOwner()).toBe(false)
    await expect(requesterData.campaigns.createCampaign(slug('nope'), 'Nope')).rejects.toMatchObject({ kind: 'permission', reason: 'hub_owner_only' })
    const direct = await requester.client.from('campaigns').insert({ slug: slug('direct'), name: 'Direct' })
    expect(direct.error?.code).toBe('42501')
  })

  it('a hub owner creates a campaign and is its DM', async () => {
    const created = await ownerData.campaigns.createCampaign(slug('own'), 'Owner camp')
    const mine = await ownerData.campaigns.listMyCampaigns(owner.id)
    expect(mine.find((c) => c.id === created.id)).toMatchObject({ role: 'dm' })
  })

  it('request -> inbox -> approve makes the requester the DM; the stranger sees nothing', async () => {
    const wanted = slug('req')
    const request = await requesterData.campaignRequests.createCampaignRequest({ name: 'Requested', slug_wanted: wanted, message: 'por favor' })
    expect(request).toMatchObject({ status: 'pending', requester_id: requester.id, slug_wanted: wanted })

    expect((await requesterData.campaignRequests.listMyCampaignRequests(requester.id)).map((r) => r.id)).toContain(request.id)
    expect(await strangerData.campaignRequests.listMyCampaignRequests(stranger.id)).toEqual([])
    expect(await strangerData.campaignRequests.listAllCampaignRequests()).toEqual([])

    const inbox = await ownerData.campaignRequests.listAllCampaignRequests()
    const row = inbox.find((r) => r.id === request.id)
    expect(row?.requester?.id).toBe(requester.id)
    expect(row?.requester?.display_name).toBeTruthy()

    await expect(requesterData.campaignRequests.approveCampaignRequest(request.id)).rejects.toMatchObject({ kind: 'permission', reason: 'hub_owner_only' })
    await expect(requesterData.campaignRequests.rejectCampaignRequest(request.id)).rejects.toMatchObject({ reason: 'hub_owner_only' })

    expect(await ownerData.campaignRequests.approveCampaignRequest(request.id)).toBe(wanted)
    const mine = await requesterData.campaigns.listMyCampaigns(requester.id)
    expect(mine.find((c) => c.slug === wanted)).toMatchObject({ role: 'dm', name: 'Requested' })
    expect((await ownerData.campaigns.listMyCampaigns(owner.id)).some((c) => c.slug === wanted)).toBe(false)

    const after = (await requesterData.campaignRequests.listMyCampaignRequests(requester.id)).find((r) => r.id === request.id)
    expect(after).toMatchObject({ status: 'approved' })
    expect(after).not.toHaveProperty('decided_by')
    expect(after?.campaign_id).toBe(mine.find((c) => c.slug === wanted)?.id)

    await expect(ownerData.campaignRequests.approveCampaignRequest(request.id)).rejects.toMatchObject({ reason: 'request_not_pending' })
    expect(await requesterData.campaignRequests.cancelCampaignRequest(request.id)).toBe(false)
  })

  it('a taken slug keeps the request pending and an override then works; reject records the note', async () => {
    const taken = slug('taken')
    await ownerData.campaigns.createCampaign(taken, 'Occupies the slug')
    const r1 = await requesterData.campaignRequests.createCampaignRequest({ name: 'Wants taken', slug_wanted: taken })
    await expect(ownerData.campaignRequests.approveCampaignRequest(r1.id)).rejects.toMatchObject({ kind: 'conflict', reason: 'slug_taken' })
    expect((await requesterData.campaignRequests.listMyCampaignRequests(requester.id)).find((r) => r.id === r1.id)?.status).toBe('pending')
    const other = slug('other')
    expect(await ownerData.campaignRequests.approveCampaignRequest(r1.id, { slug: other, name: 'Renamed' })).toBe(other)

    const r2 = await requesterData.campaignRequests.createCampaignRequest({ name: 'Rejected one' })
    await ownerData.campaignRequests.rejectCampaignRequest(r2.id, 'No por ahora')
    expect((await requesterData.campaignRequests.listMyCampaignRequests(requester.id)).find((r) => r.id === r2.id)).toMatchObject({
      status: 'rejected',
      decision_note: 'No por ahora',
    })
    await expect(ownerData.campaignRequests.approveCampaignRequest(r2.id, { slug: slug('late') })).rejects.toMatchObject({ reason: 'request_not_pending' })
  })

  it('caps pending requests per user and lets the requester cancel a pending one', async () => {
    const made = []
    for (let i = 0; i < 3; i++) made.push(await strangerData.campaignRequests.createCampaignRequest({ name: `Pending ${i}` }))
    await expect(strangerData.campaignRequests.createCampaignRequest({ name: 'Too many' })).rejects.toMatchObject({ reason: 'too_many_pending_requests' })
    expect(await strangerData.campaignRequests.cancelCampaignRequest(made[0].id)).toBe(true)
    expect(await requesterData.campaignRequests.cancelCampaignRequest(made[1].id)).toBe(false) // not theirs
    await strangerData.campaignRequests.createCampaignRequest({ name: 'Fits again' })
    await expect(strangerData.campaignRequests.createCampaignRequest({ name: 'Bad', slug_wanted: 'admin' })).rejects.toMatchObject({ reason: 'reserved_slug' })
  })

  it('a requester cannot forge status or requester on insert, nor update a request', async () => {
    const forged = await requester.client.from('campaign_requests').insert({ name: 'Forged', status: 'approved' } as never)
    expect(forged.error?.code).toBe('42501')
    const mine = (await requesterData.campaignRequests.listMyCampaignRequests(requester.id))[0]
    const upd = await requester.client.from('campaign_requests').update({ status: 'approved' } as never).eq('id', mine.id)
    expect(upd.error?.code).toBe('42501')
  })

  it('decided_by is not readable and a DM cannot change the slug of their campaign', async () => {
    const probe = await requester.client.from('campaign_requests').select('decided_by' as never)
    expect(probe.error?.code).toBe('42501')
    const mine = (await requesterData.campaigns.listMyCampaigns(requester.id)).find((c) => c.role === 'dm')
    expect(mine).toBeDefined()
    const patch = await requester.client.from('campaigns').update({ slug: 'admin' } as never).eq('id', mine!.id)
    expect(patch.error?.code).toBe('42501')
  })

  it('carries tagline, accent colour and logo from a request into the approved campaign, and from a direct creation', async () => {
    const wanted = slug('brand')
    const request = await requesterData.campaignRequests.createCampaignRequest({
      name: 'Branded',
      slug_wanted: wanted,
      tagline: 'Una historia de dragones',
      accent_color: '#4A32AC',
      logo_url: 'https://cdn.test/logo.png',
    })
    expect(request).toMatchObject({ tagline: 'Una historia de dragones', accent_color: '#4a32ac', logo_url: 'https://cdn.test/logo.png' })
    await ownerData.campaignRequests.approveCampaignRequest(request.id)
    const approved = (await requesterData.campaigns.listMyCampaigns(requester.id)).find((c) => c.slug === wanted)
    expect(approved?.branding).toEqual({ tagline: 'Una historia de dragones', accent_color: '#4a32ac', logo_url: 'https://cdn.test/logo.png' })

    const direct = slug('brand-direct')
    const created = await ownerData.campaigns.createCampaign(direct, 'Direct', { tagline: 'Lema', accent_color: '#102030' })
    expect(created.branding).toEqual({ tagline: 'Lema', accent_color: '#102030' })
    await expect(ownerData.campaigns.createCampaign(slug('brand-bad'), 'Bad', { accent_color: 'red' })).rejects.toMatchObject({ reason: 'invalid_accent_color' })
    await expect(requesterData.campaignRequests.createCampaignRequest({ name: 'Bad logo', logo_url: 'http://x.test/a.png' })).rejects.toMatchObject({ reason: 'invalid_logo_url' })
  })
})
