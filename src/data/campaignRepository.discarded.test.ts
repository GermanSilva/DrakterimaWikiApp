/** G7b: the DM-only RPCs behind the "Campos descartados" review (S26, S32). */
import { describe, expect, it } from 'vitest'
import { createCampaignRepository } from './campaignRepository'
import { ConflictError, KNOWN_REASONS } from './errors'
import { createFakeClient } from './testing/fakeClient'

const row = { id: 'a', slug: 'alpha', system_profile: { version: 1 }, updated_at: '2026-11-06T10:00:00.123456+00:00' }

describe('discarded sheet items', () => {
  it('purgeDiscardedItem calls the RPC with the key and the base version untouched', async () => {
    const fake = createFakeClient()
    const repo = createCampaignRepository(fake.db)
    fake.enqueue({ data: row })
    const saved = await repo.purgeDiscardedItem('a', 'magralita', '2026-11-06T09:00:00.789108+00:00')
    expect(fake.calls[0]).toMatchObject({ kind: 'rpc', name: 'purge_discarded_item', args: { p_campaign_id: 'a', p_key: 'magralita', p_base: '2026-11-06T09:00:00.789108+00:00' } })
    expect(saved.updated_at).toBe(row.updated_at)
  })

  it('rekeyDiscardedItem sends the renames, the whole document and the base version', async () => {
    const fake = createFakeClient()
    const repo = createCampaignRepository(fake.db)
    fake.enqueue({ data: row })
    const profile = { version: 1, sheet: {} }
    await repo.rekeyDiscardedItem('a', 'magralita', { magralita: 'magralita_2' }, profile, 'base')
    expect(fake.calls[0]).toMatchObject({
      kind: 'rpc',
      name: 'rekey_discarded_item',
      args: { p_campaign_id: 'a', p_key: 'magralita', p_renames: { magralita: 'magralita_2' }, p_profile: profile, p_base: 'base' },
    })
  })

  it('a stale base is a ConflictError on both', async () => {
    const fake = createFakeClient()
    const repo = createCampaignRepository(fake.db)
    fake.enqueue({ error: { message: 'campaign_conflict', code: 'P0001' } })
    await expect(repo.purgeDiscardedItem('a', 'x', 'old')).rejects.toBeInstanceOf(ConflictError)
    fake.enqueue({ error: { message: 'campaign_conflict', code: 'P0001' } })
    await expect(repo.rekeyDiscardedItem('a', 'x', { x: 'y' }, {}, 'old')).rejects.toBeInstanceOf(ConflictError)
  })

  it('keeps the stable reasons of the refusals', async () => {
    const fake = createFakeClient()
    const repo = createCampaignRepository(fake.db)
    for (const reason of ['discarded_item_not_found', 'discarded_key_live', 'discarded_rekey_invalid', 'discarded_key_taken']) {
      expect(KNOWN_REASONS).toContain(reason)
      fake.enqueue({ error: { message: reason, code: 'P0001' } })
      await expect(repo.purgeDiscardedItem('a', 'x', 'b')).rejects.toMatchObject({ kind: 'business', reason })
    }
    fake.enqueue({ error: { message: 'dm_only', code: '42501' } })
    await expect(repo.purgeDiscardedItem('a', 'x', 'b')).rejects.toMatchObject({ kind: 'permission', reason: 'dm_only' })
  })
})
