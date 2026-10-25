import { describe, expect, it } from 'vitest'
import { makeCampaign } from './testing/renderApp'
import { withHubOwnerCampaigns } from './hubData'

const mine = [makeCampaign({ id: 'b', slug: 'beta', name: 'Beta', role: 'player' }), makeCampaign({ id: 'a', slug: 'alpha', name: 'Alpha', role: 'dm' })]
const all = [
  makeCampaign({ id: 'a', slug: 'alpha', name: 'Alpha' }),
  makeCampaign({ id: 'b', slug: 'beta', name: 'Beta' }),
  makeCampaign({ id: 'c', slug: 'gamma', name: 'Gamma' }),
]

describe('withHubOwnerCampaigns', () => {
  it('adds the campaigns the owner is not a member of, as DM through the hub owner privilege, sorted by name', () => {
    const out = withHubOwnerCampaigns(mine, all)
    expect(out.map((c) => [c.slug, c.role, c.viaHubOwner ?? false])).toEqual([
      ['alpha', 'dm', false],
      ['beta', 'player', false],
      ['gamma', 'dm', true],
    ])
  })

  it('keeps the real membership role when the owner is also a member', () => {
    expect(withHubOwnerCampaigns(mine, all).find((c) => c.slug === 'beta')?.role).toBe('player')
  })

  it('returns exactly the memberships when there is nothing else to add', () => {
    expect(withHubOwnerCampaigns(mine, mine).map((c) => c.slug)).toEqual(['alpha', 'beta'])
  })
})
