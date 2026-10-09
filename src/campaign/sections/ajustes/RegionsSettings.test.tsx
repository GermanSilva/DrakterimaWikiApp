import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConflictError, type FlatEntity } from '../../../data'
import { makeCampaign } from '../../../app/testing/renderApp'
import { createFakeLayer } from '../../testing/fakeLayer'
import { entity, renderSection } from '../../testing/renderSection'

configure({ asyncUtilTimeout: 5000 })
afterEach(() => vi.restoreAllMocks())

const REGIONS = [
  { key: 'norte', label: 'Norte', color: '#112233' },
  { key: 'sur', label: 'Sur' },
  { key: 'otro', label: 'Otro' },
]

function setup({ isDM = true, regions = REGIONS, entities = {}, usageFails = false }: { isDM?: boolean; regions?: unknown[]; entities?: Record<string, FlatEntity[]>; usageFails?: boolean } = {}) {
  const made = createFakeLayer({ campaign: { regions } as never, entities })
  if (usageFails) made.spies.entityList.mockRejectedValue(new Error('offline'))
  const view = renderSection('/c/demo/ajustes', { layer: made.layer, isDM, regions, campaign: { updated_at: '2026-01-01T00:00:00Z' } })
  return { ...made, ...view }
}
const section = () => screen.findByRole('region', { name: 'Regiones' })
const row = async (name: string) => within(await section()).findByRole('listitem', { name })
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } })
const click = async (name: string | RegExp) => fireEvent.click(within(await section()).getByRole('button', { name }))
const save = () => click('Guardar regiones')
const savedRegions = (spies: ReturnType<typeof setup>['spies'], call = 0) => (spies.updateCampaign.mock.calls[call][1] as { regions: { key: string }[] }).regions

describe('Ajustes: regions section', () => {
  it('is not offered to a player', async () => {
    const { spies } = setup({ isDM: false })
    expect(await screen.findByRole('heading', { level: 1, name: 'Sección no encontrada' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Regiones' })).not.toBeInTheDocument()
    expect(spies.updateCampaign).not.toHaveBeenCalled()
    expect(spies.entityList).not.toHaveBeenCalled()
  })

  it('lists the stored regions with read-only keys', async () => {
    setup()
    const norte = await row('Norte')
    expect(within(norte).getByLabelText('Nombre')).toHaveValue('Norte')
    const key = within(norte).getByLabelText('Clave')
    expect(key).toHaveValue('norte')
    expect(key).toHaveAttribute('readonly')
    expect(within(norte).getByLabelText('Color (opcional)')).toHaveValue('#112233')
  })

  it('falls back to the single "otro" region for a campaign without regions', async () => {
    setup({ regions: [] })
    const otro = await row('Otro')
    expect(within(otro).getByLabelText('Clave')).toHaveValue('otro')
    expect(within(otro).getByRole('button', { name: 'Quitar Otro' })).toBeDisabled()
    expect(within(otro).getByText('Tiene que quedar al menos una región.')).toBeInTheDocument()
  })

  it('adds a region with a new key and saves the whole list against the loaded version', async () => {
    const { spies, data } = setup()
    await click('Agregar región')
    const fresh = await row('región nueva')
    const key = within(fresh).getByLabelText('Clave')
    expect(key).not.toHaveAttribute('readonly')
    type(key, ' Costa-Este ')
    type(within(fresh).getByLabelText('Nombre'), 'Costa Este')
    type(within(fresh).getByLabelText('Color (opcional)'), '#AABBCC')
    vi.mocked(data.listMyCampaigns).mockResolvedValue([makeCampaign({ regions: [...REGIONS, { key: 'costa-este', label: 'Costa Este', color: '#aabbcc' }] as never, updated_at: 'u1' })])
    await save()

    expect(await within(await section()).findByText('Regiones guardadas.')).toBeInTheDocument()
    expect(spies.updateCampaign).toHaveBeenCalledWith(
      'c1',
      { regions: [...REGIONS, { key: 'costa-este', label: 'Costa Este', color: '#aabbcc' }] },
      '2026-01-01T00:00:00Z',
    )
    // after a save the key of the new row is locked
    expect(within(await row('Costa Este')).getByLabelText('Clave')).toHaveAttribute('readonly')
  })

  it('shows Spanish field errors wired to the inputs and writes nothing', async () => {
    const { spies } = setup()
    await click('Agregar región')
    await click('Agregar región')
    const [first, second] = (await within(await section()).findAllByRole('listitem')).slice(3)
    type(within(first).getByLabelText('Clave'), 'norte')
    type(within(first).getByLabelText('Nombre'), '')
    type(within(second).getByLabelText('Clave'), 'ok')
    type(within(second).getByLabelText('Nombre'), 'Ok')
    type(within(second).getByLabelText('Color (opcional)'), 'rojo')
    await save()

    await waitFor(() => expect(within(first).getByLabelText('Clave')).toHaveAttribute('aria-invalid', 'true'))
    expect(within(first).getByLabelText('Clave')).toHaveAccessibleDescription(expect.stringContaining('Ya hay otro'))
    expect(within(first).getByLabelText('Nombre')).toHaveAccessibleDescription('El nombre es obligatorio.')
    expect(within(second).getByLabelText('Color (opcional)')).toHaveAccessibleDescription(expect.stringContaining('#rrggbb'))
    expect(spies.updateCampaign).not.toHaveBeenCalled()
  })

  it('reorders with the up/down buttons and saves that order', async () => {
    const { spies } = setup()
    const norte = await row('Norte')
    expect(within(norte).getByRole('button', { name: 'Subir Norte' })).toBeDisabled()
    expect(within(await row('Otro')).getByRole('button', { name: 'Bajar Otro' })).toBeDisabled()
    fireEvent.click(within(norte).getByRole('button', { name: 'Bajar Norte' }))
    expect((await within(await section()).findAllByRole('listitem')).map((li) => li.getAttribute('aria-label'))).toEqual(['Sur', 'Norte', 'Otro'])
    fireEvent.click(within(await row('Otro')).getByRole('button', { name: 'Subir Otro' }))
    await save()
    await waitFor(() => expect(spies.updateCampaign).toHaveBeenCalledTimes(1))
    expect(savedRegions(spies).map((r) => r.key)).toEqual(['sur', 'otro', 'norte'])
  })

  it('blocks removing a region in use and says which rows use it', async () => {
    setup({ entities: { lugares: [entity(1, { region: 'norte' }), entity(2, { region: 'norte' })], pnjs: [entity(3, { region: 'norte' })] } })
    const norte = await row('Norte')
    await waitFor(() => expect(within(norte).getByText(/En uso por 2 lugares, 1 PNJ/)).toBeInTheDocument())
    const remove = within(norte).getByRole('button', { name: 'Quitar Norte' })
    expect(remove).toBeDisabled()
    expect(remove).toHaveAccessibleDescription(expect.stringContaining('2 lugares, 1 PNJ'))
    expect(within(await row('Sur')).getByRole('button', { name: 'Quitar Sur' })).toBeEnabled()
  })

  it('counts personajes and facciones too', async () => {
    setup({ entities: { pjs: [entity(1, { region: 'sur' })], facciones: [entity(2, { region: 'sur' }), entity(3, { region: 'sur' })] } })
    expect(await within(await row('Sur')).findByText(/En uso por 1 personaje, 2 facciones/)).toBeInTheDocument()
  })

  it('removes an unused region only after confirming, and saves without it', async () => {
    const { spies } = setup()
    const sur = await row('Sur')
    await waitFor(() => expect(within(sur).getByRole('button', { name: 'Quitar Sur' })).toBeEnabled())
    fireEvent.click(within(sur).getByRole('button', { name: 'Quitar Sur' }))
    const confirm = within(sur).getByRole('group', { name: 'Confirmar quitar Sur' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancelar' }))
    expect(within(sur).queryByRole('group', { name: 'Confirmar quitar Sur' })).not.toBeInTheDocument()

    fireEvent.click(within(sur).getByRole('button', { name: 'Quitar Sur' }))
    fireEvent.click(within(within(sur).getByRole('group', { name: 'Confirmar quitar Sur' })).getByRole('button', { name: 'Quitar' }))
    await waitFor(() => expect(within(sur).queryByLabelText('Nombre')).not.toBeInTheDocument())
    expect(spies.updateCampaign).not.toHaveBeenCalled()
    await save()
    await waitFor(() => expect(spies.updateCampaign).toHaveBeenCalledTimes(1))
    expect(savedRegions(spies).map((r) => r.key)).toEqual(['norte', 'otro'])
  })

  it('checks the use again on save: a row that took the region after the page loaded blocks the removal', async () => {
    const { spies } = setup()
    const sur = await row('Sur')
    await waitFor(() => expect(within(sur).getByRole('button', { name: 'Quitar Sur' })).toBeEnabled())
    fireEvent.click(within(sur).getByRole('button', { name: 'Quitar Sur' }))
    fireEvent.click(within(within(sur).getByRole('group', { name: 'Confirmar quitar Sur' })).getByRole('button', { name: 'Quitar' }))
    // another DM or player assigns "sur" to a place meanwhile
    spies.entityList.mockImplementation(async (table: string) => (table === 'lugares' ? [entity(7, { region: 'sur' })] : []))
    await save()
    expect(await within(await section()).findByText(/No se puede quitar "Sur" \(1 lugar\)/)).toBeInTheDocument()
    expect(spies.updateCampaign).not.toHaveBeenCalled()
  })

  it('does not save a removal when the use cannot be verified', async () => {
    const { spies } = setup()
    const sur = await row('Sur')
    await waitFor(() => expect(within(sur).getByRole('button', { name: 'Quitar Sur' })).toBeEnabled())
    fireEvent.click(within(sur).getByRole('button', { name: 'Quitar Sur' }))
    fireEvent.click(within(within(sur).getByRole('group', { name: 'Confirmar quitar Sur' })).getByRole('button', { name: 'Quitar' }))
    spies.entityList.mockRejectedValue(new Error('offline'))
    await save()
    expect(await within(await section()).findByText(/No pudimos verificar/)).toBeInTheDocument()
    expect(spies.updateCampaign).not.toHaveBeenCalled()
  })

  it('does not allow removing regions while the use is unknown (load failed)', async () => {
    setup({ usageFails: true })
    const sur = await row('Sur')
    await waitFor(() => expect(within(sur).getByRole('button', { name: 'Quitar Sur' })).toBeDisabled())
  })

  it('on a conflict re-reads the campaign, shows the new regions and never overwrites', async () => {
    const { spies, data } = setup()
    await section()
    const theirs = makeCampaign({ regions: [{ key: 'norte', label: 'Norte renombrado' }, { key: 'otro', label: 'Otro' }] as never, updated_at: 'u9' })
    spies.updateCampaign.mockRejectedValueOnce(new ConflictError())
    vi.mocked(data.listMyCampaigns).mockResolvedValue([theirs])
    type(within(await row('Norte')).getByLabelText('Nombre'), 'Mi nombre')
    await save()

    expect(await within(await section()).findByText(/cambió mientras la editabas/)).toBeInTheDocument()
    expect(await row('Norte renombrado')).toBeInTheDocument()
    expect(spies.updateCampaign).toHaveBeenCalledTimes(1)
  })

  it('a second save uses the version returned by the first one', async () => {
    const { spies, data } = setup()
    await section()
    type(within(await row('Norte')).getByLabelText('Nombre'), 'Norte 2')
    vi.mocked(data.listMyCampaigns).mockResolvedValue([makeCampaign({ regions: [{ ...REGIONS[0], label: 'Norte 2' }, ...REGIONS.slice(1)] as never, updated_at: 'u1' })])
    await save()
    await within(await section()).findByText('Regiones guardadas.')
    type(within(await row('Norte 2')).getByLabelText('Nombre'), 'Norte 3')
    await save()
    await waitFor(() => expect(spies.updateCampaign).toHaveBeenCalledTimes(2))
    expect(spies.updateCampaign.mock.calls[1][2]).toBe('u1')
  })
})
