import { describe, expect, it } from 'vitest'
import { createPresenceRepository } from './presenceRepository'
import { createFakeClient, opsNamed } from './testing/fakeClient'

const CAMPAIGN = 'cccccccc-0000-4000-8000-00000000000a'

describe('presence repository', () => {
  it('touch calls the RPC with the campaign id and resolves with nothing', async () => {
    const fake = createFakeClient()
    const repo = createPresenceRepository(fake.db)
    fake.enqueue({ data: null })
    await expect(repo.touch(CAMPAIGN)).resolves.toBeUndefined()
    expect(fake.calls[0]).toMatchObject({ kind: 'rpc', name: 'touch_campaign_presence', args: { p_campaign_id: CAMPAIGN } })
  })

  it('touch maps the non-member refusal to a typed permission error', async () => {
    const fake = createFakeClient()
    const repo = createPresenceRepository(fake.db)
    fake.enqueue({ error: { message: 'not_a_member', code: '42501' } })
    await expect(repo.touch(CAMPAIGN)).rejects.toMatchObject({ kind: 'permission', reason: 'not_a_member' })
  })

  it('list selects the explicit columns of one campaign, ordered by user', async () => {
    const fake = createFakeClient()
    const repo = createPresenceRepository(fake.db)
    const rows = [{ campaign_id: CAMPAIGN, user_id: 'u1', last_seen_at: '2026-10-09T10:00:00Z' }]
    fake.enqueue({ data: rows }, { data: [] })
    expect(await repo.list(CAMPAIGN)).toEqual(rows)
    expect(fake.calls[0]).toMatchObject({ kind: 'from', name: 'campaign_presence' })
    expect(opsNamed(fake.calls[0], 'select')).toEqual([['campaign_id, user_id, last_seen_at']])
    expect(opsNamed(fake.calls[0], 'eq')).toEqual([['campaign_id', CAMPAIGN]])
  })

  it('list is empty for a caller who may not read rows (RLS returns no rows)', async () => {
    const fake = createFakeClient()
    const repo = createPresenceRepository(fake.db)
    fake.enqueue({ data: [] })
    expect(await repo.list(CAMPAIGN)).toEqual([])
  })
})
