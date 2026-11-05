import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { DataContext } from '../../../app/DataContext'
import { makeAuth, makeCampaign, makeData } from '../../../app/testing/renderApp'
import { AuthContext } from '../../../auth/AuthContext'
import WikiText from '../../../components/WikiText'
import { HubPortsProvider } from '../../adapters/HubPortsProvider'
import { CampaignContext } from '../../CampaignContext'
import { createFakeLayer } from '../../testing/fakeLayer'

const DISTANCE = {
  main: 'ft',
  units: [
    { key: 'ft', label: 'Pies', value: 1, decimals: 0 },
    { key: 'm', label: 'Metros', value: 3.28084, decimals: 1 },
    { key: 'c', label: 'Casilleros', value: 5, decimals: 0 },
  ],
}

function renderHub(systemProfile: unknown, text: string) {
  window.scrollTo = vi.fn() as typeof window.scrollTo
  const { layer } = createFakeLayer()
  return render(
    <MemoryRouter initialEntries={['/c/demo/lore']}>
      <AuthContext.Provider value={makeAuth()}>
        <DataContext.Provider value={makeData({ layer })}>
          <CampaignContext.Provider
            value={{ campaign: makeCampaign({ id: 'c1', slug: 'demo', system_profile: systemProfile as never }), role: 'dm', isDM: true, myCharacterIds: [], reload: () => undefined }}
          >
            <HubPortsProvider>
              <p data-testid="out">
                <WikiText text={text} />
              </p>
            </HubPortsProvider>
          </CampaignContext.Provider>
        </DataContext.Provider>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('distance units in the hub', () => {
  it('renders [[{D:key}n]] with the units of the campaign system and the Spanish comma', () => {
    renderHub({ version: 1, distance: DISTANCE }, 'Salta [[{D:ft}15]]')
    expect(screen.getByTestId('out')).toHaveTextContent('Salta [15ft|4,5m|3c]')
  })

  it('keeps the markup as written when the campaign defines no units', () => {
    renderHub({ version: 1 }, 'Salta [[{D:ft}15]]')
    expect(screen.getByTestId('out')).toHaveTextContent('Salta [[{D:ft}15]]')
  })

  it('keeps the markup as written when the stored distance is malformed', () => {
    renderHub({ version: 1, distance: { main: 'x', units: [] } }, 'Salta [[{D:ft}15]]')
    expect(screen.getByTestId('out')).toHaveTextContent('Salta [[{D:ft}15]]')
  })

  it('keeps the markup as written for a unit the campaign does not define', () => {
    renderHub({ version: 1, distance: DISTANCE }, '[[{D:yd}15]]')
    expect(screen.getByTestId('out')).toHaveTextContent('[[{D:yd}15]]')
  })
})
