import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeCampaign } from '../../app/testing/renderApp'
import { CampaignContext } from '../CampaignContext'
import { DND5E_PROFILE } from './systemProfile'
import { useSystem } from './useSystem'

function Probe() {
  const system = useSystem()
  return <p data-testid="out">{`${system.character.builtins.nivel.label}|${system.currency.enabled}|${system.modules.juegos}`}</p>
}

function renderWith(system_profile: unknown) {
  const campaign = makeCampaign({ system_profile: system_profile as never })
  render(
    <CampaignContext.Provider value={{ campaign, role: 'dm', isDM: true, myCharacterIds: [], reload: () => undefined }}>
      <Probe />
    </CampaignContext.Provider>,
  )
  return screen.getByTestId('out').textContent
}

describe('useSystem', () => {
  it('reads the document of the current campaign', () => {
    expect(renderWith({ version: 1, character: { builtins: { nivel: { label: 'Rango' } } }, currency: { enabled: false }, modules: { juegos: false } })).toBe('Rango|false|false')
  })

  it('gives the D&D 5e document to a campaign whose stored document is unusable', () => {
    expect(renderWith('garbage')).toBe(`${DND5E_PROFILE.character.builtins.nivel.label}|true|true`)
  })
})
