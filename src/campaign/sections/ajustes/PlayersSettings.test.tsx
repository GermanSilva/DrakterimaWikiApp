import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Member } from '../../../data'
import { PlayersSettings } from './PlayersSettings'

const mocks = vi.hoisted(() => ({ presenceStatus: 'idle' as 'idle' | 'loading' | 'ready' | 'error' }))

vi.mock('../../entities/campaignServicesContext', () => ({
  useCampaignServices: () => ({ layer: { presence: { list: vi.fn() } }, campaignId: 'c1' }),
}))
vi.mock('../../entities/useCampaignMembers', () => ({
  useCampaignMembers: () => ({ status: 'ready', data: [{ campaign_id: 'c1', user_id: 'u1', role: 'player', created_at: '', updated_at: '', profile: { id: 'u1', display_name: 'Bob', avatar_url: null } } satisfies Member], error: null, refresh: vi.fn() }),
}))
vi.mock('../../../auth', () => ({ useAuth: () => ({ user: { id: 'u-me' } }) }))
vi.mock('../../toastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }))
vi.mock('../../entities/useEntities', () => ({ useEntities: () => ({ items: [] }) }))
vi.mock('../../entities/useLoad', () => ({
  useLoad: () => ({ status: mocks.presenceStatus, data: mocks.presenceStatus === 'ready' ? [] : null, error: null, refresh: vi.fn() }),
}))

describe('PlayersSettings last connection while the presence is not known', () => {
  beforeEach(() => {
    mocks.presenceStatus = 'idle'
  })

  it.each(['idle', 'loading', 'error'] as const)('%s: shows a neutral dash, never "Nunca"', (status) => {
    mocks.presenceStatus = status
    render(<PlayersSettings />)
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.queryByText('Nunca')).toBeNull()
    expect(screen.getByRole('row', { name: /Bob/ })).toHaveTextContent('—')
  })

  it('ready without a row for the member is the only case that says "Nunca"', () => {
    mocks.presenceStatus = 'ready'
    render(<PlayersSettings />)
    expect(screen.getByText('Nunca')).toBeInTheDocument()
  })
})
