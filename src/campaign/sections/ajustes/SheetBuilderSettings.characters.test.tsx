import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createFakeLayer } from '../../testing/fakeLayer'
import { renderSection } from '../../testing/renderSection'
import { STORED_SHEET } from '../../system/builder/builderFixture'
import { DND5E_PROFILE } from '../../system/systemProfile'

configure({ asyncUtilTimeout: 10000 })

const PJS = [
  { id: 1, campaign_id: 'c1', nombre: 'Liria Vantor', nivel: 5, vida: 30, updated_at: 'u1' },
  { id: 2, campaign_id: 'c1', nombre: 'Borin', updated_at: 'u2' },
]

function setup(failing = false) {
  const system = { ...JSON.parse(JSON.stringify(DND5E_PROFILE)), sheet: STORED_SHEET }
  const stored = { name: 'Drakterima', system_profile: system }
  const made = createFakeLayer({ campaign: stored as never, entities: { pjs: PJS as never[] } })
  if (failing) made.spies.entityList.mockRejectedValue(new Error('boom'))
  renderSection('/c/demo/ajustes?tab=ficha', { layer: made.layer, isDM: true, campaign: stored as never })
  return made
}
const preview = async () => within(await screen.findByRole('region', { name: 'Vista previa' }))

describe('Ajustes: Plantilla de ficha, test characters', () => {
  it('offers the campaign characters (name and level) to try formulas on, then the example', async () => {
    setup()
    const select = (await preview()).getByLabelText('Personaje de prueba') as HTMLSelectElement
    await waitFor(() => expect([...select.options].map((o) => o.textContent)).toEqual(['Liria Vantor · nivel 5', 'Borin', 'Personaje de ejemplo']))
  })

  it('keeps the builder usable with the example character when the characters cannot be read', async () => {
    setup(true)
    const select = (await preview()).getByLabelText('Personaje de prueba') as HTMLSelectElement
    expect([...select.options].map((o) => o.textContent)).toEqual(['Personaje de ejemplo'])
    // a change to the template can still be saved (from the bar of the tab)
    fireEvent.click(within(screen.getByRole('group', { name: 'Sección Extra' })).getByRole('button', { name: 'Agregar campo' }))
    expect(await within(await screen.findByRole('region', { name: 'Guardar cambios' })).findByRole('button', { name: 'Guardar plantilla' })).toBeEnabled()
  })
})
