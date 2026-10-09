import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConflictError } from '../../../data'
import { createFakeLayer } from '../../testing/fakeLayer'
import { renderSection } from '../../testing/renderSection'

configure({ asyncUtilTimeout: 5000 })
afterEach(() => vi.restoreAllMocks())

const REGIONS = [{ key: 'norte', label: 'Norte' }, { key: 'otro', label: 'Otro' }]
const FIELDS = [{ key: 'lema', label: 'Lema', type: 'text' }]

function setup() {
  const made = createFakeLayer({ campaign: { regions: REGIONS, character_custom_fields: FIELDS, updated_at: '2026-01-01T00:00:00Z' } as never })
  const view = renderSection('/c/demo/ajustes', { layer: made.layer, regions: REGIONS, customFields: FIELDS, campaign: { updated_at: '2026-01-01T00:00:00Z' } })
  return { ...made, ...view }
}
const region = (name: string) => screen.findByRole('region', { name })
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } })
const rename = async (section: string, item: string, field: string, value: string) =>
  type(within(await within(await region(section)).findByRole('listitem', { name: item })).getByLabelText(field), value)
const press = async (section: string, name: string) => fireEvent.click(within(await region(section)).getByRole('button', { name }))

describe('Ajustes: shared campaign version across sections', () => {
  it('a quick save in a second section uses the version the first one returned, before the reload lands', async () => {
    const { spies, data } = setup()
    await region('Regiones')
    // the context reload after a save never lands during this test
    vi.mocked(data.listMyCampaigns).mockImplementation(() => new Promise(() => undefined))

    await rename('Regiones', 'Norte', 'Nombre', 'Norte 2')
    await press('Regiones', 'Guardar regiones')
    expect(await within(await region('Regiones')).findByText('Regiones guardadas.')).toBeInTheDocument()

    await rename('Campos de personaje', 'Lema', 'Nombre del campo', 'Lema 2')
    await press('Campos de personaje', 'Guardar campos')
    expect(await within(await region('Campos de personaje')).findByText('Campos guardados.')).toBeInTheDocument()

    expect(spies.updateCampaign.mock.calls.map((c) => c[2])).toEqual(['2026-01-01T00:00:00Z', 'u1'])
    expect(screen.queryByText(/cambió mientras la editabas/)).not.toBeInTheDocument()
  })

  it('still reports a genuine conflict when someone else saved in between', async () => {
    const { spies, layer } = setup()
    await region('Regiones')
    // another DM writes (no base): the row is now newer than what this page loaded
    await layer.campaigns.updateCampaign('c1', { name: 'Otro DM' })
    spies.updateCampaign.mockClear()

    await rename('Campos de personaje', 'Lema', 'Nombre del campo', 'Lema 2')
    await press('Campos de personaje', 'Guardar campos')
    expect(await within(await region('Campos de personaje')).findByText(/cambió mientras la editabas/)).toBeInTheDocument()
    await waitFor(() => expect(spies.updateCampaign).toHaveBeenCalledTimes(1))
    await expect(spies.updateCampaign.mock.results[0].value).rejects.toBeInstanceOf(ConflictError)
  })
})
