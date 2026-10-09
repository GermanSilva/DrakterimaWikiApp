import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConflictError } from '../../../data'
import { makeCampaign } from '../../../app/testing/renderApp'
import { createFakeLayer } from '../../testing/fakeLayer'
import { renderSection } from '../../testing/renderSection'

configure({ asyncUtilTimeout: 5000 })
afterEach(() => vi.restoreAllMocks())

const FIELDS = [
  { key: 'magralita', label: 'Relación con la Magralita', type: 'text' },
  { key: 'lema', label: 'Lema', type: 'text' },
]

function setup({ isDM = true, fields = FIELDS }: { isDM?: boolean; fields?: unknown[] } = {}) {
  const made = createFakeLayer({ campaign: { character_custom_fields: fields } as never })
  const view = renderSection('/c/demo/ajustes', { layer: made.layer, isDM, customFields: fields })
  return { ...made, ...view }
}
const section = () => screen.findByRole('region', { name: 'Campos de personaje' })
const row = async (name: string) => within(await section()).findByRole('listitem', { name })
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } })
const click = async (name: string | RegExp) => fireEvent.click(within(await section()).getByRole('button', { name }))
const save = () => click('Guardar campos')

describe('Ajustes: custom character fields section', () => {
  it('is not offered to a player', async () => {
    const { spies } = setup({ isDM: false })
    expect(await screen.findByRole('heading', { level: 1, name: 'Sección no encontrada' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Campos de personaje' })).not.toBeInTheDocument()
    expect(spies.updateCampaign).not.toHaveBeenCalled()
  })

  it('lists the stored fields with read-only keys', async () => {
    setup()
    const magralita = await row('Relación con la Magralita')
    expect(within(magralita).getByLabelText('Clave')).toHaveValue('magralita')
    expect(within(magralita).getByLabelText('Clave')).toHaveAttribute('readonly')
  })

  it('adds a text field and saves the whole list as { key, label, type: "text" }', async () => {
    const { spies } = setup({ fields: [] })
    await click('Agregar campo')
    const fresh = await row('campo nuevo')
    type(within(fresh).getByLabelText('Clave'), 'Ancestro')
    type(within(fresh).getByLabelText('Nombre del campo'), ' Ancestro famoso ')
    await save()
    expect(await within(await section()).findByText('Campos guardados.')).toBeInTheDocument()
    expect(spies.updateCampaign).toHaveBeenCalledWith('c1', { character_custom_fields: [{ key: 'ancestro', label: 'Ancestro famoso', type: 'text' }] }, '2026-01-01T00:00:00Z')
  })

  it('stops adding at 10 fields', async () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ key: `k${i}`, label: `Campo ${i}`, type: 'text' }))
    setup({ fields: ten })
    await section()
    expect(within(await section()).getByRole('button', { name: 'Agregar campo' })).toBeDisabled()
    expect(within(await section()).getByText('Máximo 10 campos.')).toBeInTheDocument()
  })

  it('warns that values stay stored but hidden when removing, and saves without the field', async () => {
    const { spies } = setup()
    const lema = await row('Lema')
    fireEvent.click(within(lema).getByRole('button', { name: 'Quitar Lema' }))
    const confirm = within(lema).getByRole('group', { name: 'Confirmar quitar Lema' })
    expect(within(confirm).getByText(/quedan guardados pero ocultos/)).toBeInTheDocument()
    fireEvent.click(within(confirm).getByRole('button', { name: 'Quitar' }))
    await save()
    await waitFor(() => expect(spies.updateCampaign).toHaveBeenCalledTimes(1))
    expect(spies.updateCampaign.mock.calls[0][1]).toEqual({ character_custom_fields: [FIELDS[0]] })
  })

  it('allows removing every field (a campaign may have none)', async () => {
    const { spies } = setup({ fields: [FIELDS[1]] })
    const lema = await row('Lema')
    fireEvent.click(within(lema).getByRole('button', { name: 'Quitar Lema' }))
    fireEvent.click(within(within(lema).getByRole('group', { name: 'Confirmar quitar Lema' })).getByRole('button', { name: 'Quitar' }))
    await save()
    await waitFor(() => expect(spies.updateCampaign).toHaveBeenCalledWith('c1', { character_custom_fields: [] }, '2026-01-01T00:00:00Z'))
  })

  it('reorders with the buttons', async () => {
    const { spies } = setup()
    fireEvent.click(within(await row('Lema')).getByRole('button', { name: 'Subir Lema' }))
    await save()
    await waitFor(() => expect(spies.updateCampaign).toHaveBeenCalledTimes(1))
    expect((spies.updateCampaign.mock.calls[0][1] as { character_custom_fields: { key: string }[] }).character_custom_fields.map((f) => f.key)).toEqual(['lema', 'magralita'])
  })

  it('rejects a duplicate key and a missing label with accessible errors, writing nothing', async () => {
    const { spies } = setup()
    await click('Agregar campo')
    const fresh = (await within(await section()).findAllByRole('listitem'))[2]
    type(within(fresh).getByLabelText('Clave'), 'lema')
    await save()
    await waitFor(() => expect(within(fresh).getByLabelText('Clave')).toHaveAttribute('aria-invalid', 'true'))
    expect(within(fresh).getByLabelText('Clave')).toHaveAccessibleDescription(expect.stringContaining('Ya hay otro'))
    expect(within(fresh).getByLabelText('Nombre del campo')).toHaveAccessibleDescription('El nombre es obligatorio.')
    expect(spies.updateCampaign).not.toHaveBeenCalled()
  })

  it('on a conflict re-reads the campaign and never overwrites', async () => {
    const { spies, data } = setup()
    await section()
    spies.updateCampaign.mockRejectedValueOnce(new ConflictError())
    vi.mocked(data.listMyCampaigns).mockResolvedValue([makeCampaign({ character_custom_fields: [{ key: 'lema', label: 'Lema de otro DM', type: 'text' }] as never, updated_at: 'u9' })])
    type(within(await row('Lema')).getByLabelText('Nombre del campo'), 'Mío')
    await save()
    expect(await within(await section()).findByText(/cambió mientras la editabas/)).toBeInTheDocument()
    expect(await row('Lema de otro DM')).toBeInTheDocument()
    expect(spies.updateCampaign).toHaveBeenCalledTimes(1)
  })
})
