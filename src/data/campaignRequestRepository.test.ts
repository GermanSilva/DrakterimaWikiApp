import { describe, expect, it } from 'vitest'
import { createCampaignRequestRepository } from './campaignRequestRepository'
import { CAMPAIGN_REQUEST_COLUMNS, join } from './columns'
import { createFakeClient, opsNamed } from './testing/fakeClient'

describe('campaign request repository', () => {
  it('isHubOwner calls is_hub_owner and is strictly boolean', async () => {
    const fake = createFakeClient()
    const repo = createCampaignRequestRepository(fake.db)
    fake.enqueue({ data: true }, { data: false }, { data: null })
    expect(await repo.isHubOwner()).toBe(true)
    expect(fake.calls[0]).toMatchObject({ kind: 'rpc', name: 'is_hub_owner' })
    expect(await repo.isHubOwner()).toBe(false)
    expect(await repo.isHubOwner()).toBe(false)
  })

  it('isHubOwner rejects on a failure (callers decide the safe default)', async () => {
    const fake = createFakeClient()
    fake.enqueue({ error: { message: 'boom', code: '500' } })
    await expect(createCampaignRequestRepository(fake.db).isHubOwner()).rejects.toMatchObject({ kind: 'unknown' })
  })

  it('listMyCampaignRequests filters by the requester with explicit columns', async () => {
    const fake = createFakeClient()
    fake.enqueue({ data: [{ id: 2 }] }, { data: [] })
    const out = await createCampaignRequestRepository(fake.db).listMyCampaignRequests('u1')
    expect(fake.calls[0].name).toBe('campaign_requests')
    expect(opsNamed(fake.calls[0], 'select')).toEqual([[join(CAMPAIGN_REQUEST_COLUMNS)]])
    expect(opsNamed(fake.calls[0], 'eq')).toEqual([['requester_id', 'u1']])
    expect(out).toHaveLength(1)
  })

  it('createCampaignRequest sends only the writable columns and keeps typed reasons', async () => {
    const fake = createFakeClient()
    const repo = createCampaignRequestRepository(fake.db)
    fake.enqueue({ data: { id: 1, status: 'pending' } })
    await repo.createCampaignRequest({ name: 'Alpha', slug_wanted: 'alpha', status: 'approved', requester_id: 'x' } as never)
    expect(opsNamed(fake.calls[0], 'insert')).toEqual([[{ name: 'Alpha', slug_wanted: 'alpha' }]])

    fake.enqueue({ error: { message: 'too_many_pending_requests', code: 'P0001' } })
    await expect(repo.createCampaignRequest({ name: 'B' })).rejects.toMatchObject({ kind: 'business', reason: 'too_many_pending_requests' })
  })

  it('cancelCampaignRequest resolves whether a row was removed', async () => {
    const fake = createFakeClient()
    const repo = createCampaignRequestRepository(fake.db)
    fake.enqueue({ data: [{ id: 4 }] }, { data: [] })
    expect(await repo.cancelCampaignRequest(4)).toBe(true)
    expect(opsNamed(fake.calls[0], 'delete')).toHaveLength(1)
    expect(opsNamed(fake.calls[0], 'eq')).toEqual([['id', 4]])
    expect(await repo.cancelCampaignRequest(4)).toBe(false)
  })

  it('listAllCampaignRequests embeds the requester through the requester FK and lists pending first', async () => {
    const fake = createFakeClient()
    fake.enqueue({
      data: [
        { id: 3, status: 'approved' },
        { id: 2, status: 'pending' },
        { id: 1, status: 'pending' },
      ],
    })
    fake.enqueue({ data: [] })
    const out = await createCampaignRequestRepository(fake.db).listAllCampaignRequests()
    expect(opsNamed(fake.calls[0], 'select')[0][0]).toContain('requester:profiles!campaign_requests_requester_id_fkey(id, display_name, avatar_url)')
    expect(out.map((r) => r.id)).toEqual([2, 1, 3])
  })

  it('approve and reject call their RPCs, sending only the given overrides', async () => {
    const fake = createFakeClient()
    const repo = createCampaignRequestRepository(fake.db)
    fake.enqueue({ data: 'alpha' }, { data: 'beta' }, { data: null }, { data: null })
    expect(await repo.approveCampaignRequest(7)).toBe('alpha')
    expect(fake.calls[0]).toMatchObject({ kind: 'rpc', name: 'approve_campaign_request', args: { p_request_id: 7 } })
    expect(fake.calls[0].args).toEqual({ p_request_id: 7 })
    expect(await repo.approveCampaignRequest(7, { slug: 'beta', name: 'Beta' })).toBe('beta')
    expect(fake.calls[1].args).toEqual({ p_request_id: 7, p_slug: 'beta', p_name: 'Beta' })
    await repo.rejectCampaignRequest(7)
    expect(fake.calls[2]).toMatchObject({ name: 'reject_campaign_request', args: { p_request_id: 7 } })
    await repo.rejectCampaignRequest(7, 'no')
    expect(fake.calls[3].args).toEqual({ p_request_id: 7, p_note: 'no' })
  })

  it.each([
    ['hub_owner_only', '42501', 'permission'],
    ['request_not_pending', 'P0001', 'business'],
    ['request_not_found', 'P0001', 'business'],
    ['slug_taken', '23505', 'conflict'],
    ['invalid_slug', '23514', 'validation'],
    ['reserved_slug', 'P0001', 'business'],
  ])('maps %s (%s) to a typed reason', async (message, code, kind) => {
    const fake = createFakeClient()
    fake.enqueue({ error: { message, code } })
    await expect(createCampaignRequestRepository(fake.db).approveCampaignRequest(1)).rejects.toMatchObject({ kind, reason: message })
  })
})
