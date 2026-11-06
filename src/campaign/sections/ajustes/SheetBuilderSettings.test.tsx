import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConflictError, DataError } from '../../../data'
import { createFakeLayer } from '../../testing/fakeLayer'
import { renderSection } from '../../testing/renderSection'
import { STORED_SHEET } from '../../system/builder/builderFixture'
import { DND5E_PROFILE } from '../../system/systemProfile'

configure({ asyncUtilTimeout: 5000 })
afterEach(() => vi.restoreAllMocks())

const profile = (extra: Record<string, unknown> = {}) => ({ ...JSON.parse(JSON.stringify(DND5E_PROFILE)), ...extra })

function setup({ isDM = true, system = profile({ sheet: STORED_SHEET }) }: { isDM?: boolean; system?: Record<string, unknown> } = {}) {
  const stored = { name: 'Drakterima', system_profile: system }
  const made = createFakeLayer({ campaign: stored as never })
  const view = renderSection('/c/demo/ajustes', { layer: made.layer, isDM, campaign: stored as never })
  return { ...made, ...view, system }
}
const region = () => screen.findByRole('region', { name: 'Plantilla de ficha' })
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } })
const saveButton = async () => within(await region()).getByRole('button', { name: 'Guardar plantilla' })
const addEdad = async () => {
  const r = within(await region())
  fireEvent.click(within(r.getByRole('group', { name: 'Sección Extra' })).getByRole('button', { name: 'Agregar campo' }))
  type(within(r.getByRole('group', { name: 'Ítem Nuevo campo' })).getByLabelText('Nombre del ítem'), 'Altura')
}

describe('Ajustes: Plantilla de ficha', () => {
  it('is not reachable by a player', async () => {
    const { spies } = setup({ isDM: false })
    expect(await screen.findByRole('heading', { level: 1, name: 'Sección no encontrada' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Plantilla de ficha' })).not.toBeInTheDocument()
    expect(spies.setSystemProfile).not.toHaveBeenCalled()
  })

  it('shows the stored sheet to the DM', async () => {
    setup()
    const r = within(await region())
    expect(r.getAllByRole('tab').map((t) => t.textContent)).toEqual(['General', 'Mecánicas'])
    expect(r.getByRole('group', { name: 'Sección Perfil' })).toBeInTheDocument()
    expect(r.getByRole('status')).toHaveTextContent('La plantilla es válida.')
  })

  it('saves the whole sheet against the current version and keeps the rest of the document byte for byte', async () => {
    const system = profile({ sheet: STORED_SHEET, distance: { main: 'ft', units: [{ key: 'ft', label: 'Pies', value: 1, decimals: 0 }] }, futuro: { z: [3, 1, 2], a: 'x' } })
    const { spies } = setup({ system })
    await addEdad()
    fireEvent.click(await saveButton())
    expect(await within(await region()).findByText('Plantilla guardada.')).toBeInTheDocument()
    expect(spies.setSystemProfile).toHaveBeenCalledTimes(1)
    const [id, sent, base] = spies.setSystemProfile.mock.calls[0] as [string, Record<string, unknown>, string]
    expect(id).toBe('c1')
    expect(base).toBe('2026-01-01T00:00:00Z')
    const { sheet, ...rest } = sent
    const { sheet: _stored, ...storedRest } = system
    void _stored
    expect(JSON.stringify(rest)).toBe(JSON.stringify(storedRest))
    const sections = (sheet as { categories: { sections: { key: string; items: { key: string }[] }[] }[] }).categories[0].sections
    expect(sections[1].items).toEqual([{ kind: 'field', key: 'altura', label: 'Altura', type: 'short', editableBy: 'dm' }])
    expect(JSON.stringify(sheet)).not.toContain('_new')
    expect((sheet as { categories: unknown[] }).categories[1]).toEqual(STORED_SHEET.categories[1])
  })

  it('Save stays disabled while the sheet is invalid and nothing is written', async () => {
    const { spies } = setup()
    await addEdad()
    const r = within(await region())
    type(within(r.getByRole('group', { name: 'Ítem Altura' })).getByLabelText('Nombre del ítem'), '  ')
    expect(await saveButton()).toBeDisabled()
    expect(r.getByRole('alert', { name: 'Errores de la plantilla' })).toBeInTheDocument()
    fireEvent.click(await saveButton())
    expect(spies.setSystemProfile).not.toHaveBeenCalled()
  })

  it('the first sheet of a campaign asks first, because the classic sheet stops being used', async () => {
    const { spies } = setup({ system: profile() })
    const r = within(await region())
    expect(r.getAllByRole('tab').map((t) => t.textContent)).toEqual(['General'])
    expect(r.getByText(/todavía usa la ficha clásica/)).toBeInTheDocument()
    fireEvent.click(await saveButton())
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Al guardar la primera plantilla')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(spies.setSystemProfile).not.toHaveBeenCalled()
    fireEvent.click(await saveButton())
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Guardar plantilla' }))
    await waitFor(() => expect(spies.setSystemProfile).toHaveBeenCalledTimes(1))
    const sent = spies.setSystemProfile.mock.calls[0][1] as { sheet: { categories: { key: string }[] }; currency: unknown }
    expect(sent.sheet.categories[0].key).toBe('general')
    expect(sent.currency).toEqual(DND5E_PROFILE.currency)
  })

  it('a campaign that already has a sheet saves without asking', async () => {
    const { spies } = setup()
    fireEvent.click(await saveButton())
    await waitFor(() => expect(spies.setSystemProfile).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('on a conflict asks to review and never overwrites', async () => {
    const { spies } = setup()
    spies.setSystemProfile.mockRejectedValueOnce(new ConflictError())
    fireEvent.click(await saveButton())
    expect(await within(await region()).findByText(/cambió mientras la editabas/)).toBeInTheDocument()
  })

  it('tells when the server refuses the document, naming the part', async () => {
    const { spies } = setup()
    spies.setSystemProfile.mockRejectedValueOnce(new DataError('business', 'invalid_system_profile', { message: 'invalid_system_profile', code: 'P0001', details: 'sheet.categories[0].sections[0]' }, 'invalid_system_profile'))
    fireEvent.click(await saveButton())
    expect(await within(await region()).findByText(/El servidor no aceptó el sistema \(parte: sheet\.categories\[0\]\.sections\[0\]\)/)).toBeInTheDocument()
  })

  it('a save of the Sistema section keeps the sheet, and does not throw away what is being edited here', async () => {
    const { spies } = setup()
    await addEdad()
    const sistema = await screen.findByRole('region', { name: 'Sistema' })
    fireEvent.click(within(sistema).getByRole('button', { name: 'Guardar sistema' }))
    await waitFor(() => expect(spies.setSystemProfile).toHaveBeenCalledTimes(1))
    expect((spies.setSystemProfile.mock.calls[0][1] as { sheet: unknown }).sheet).toEqual(STORED_SHEET)
    expect(await within(sistema).findByText('Sistema guardado.')).toBeInTheDocument()
    expect(within(await region()).getByRole('group', { name: 'Ítem Altura' })).toBeInTheDocument()
  })
})
