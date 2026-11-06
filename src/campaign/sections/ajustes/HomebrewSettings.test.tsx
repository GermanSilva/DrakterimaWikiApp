import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toDataError, type SystemSummary } from '../../../data'
import { createFakeLayer } from '../../testing/fakeLayer'
import { renderSection } from '../../testing/renderSection'

configure({ asyncUtilTimeout: 15000 })
afterEach(() => vi.restoreAllMocks())

const system = (over: Partial<SystemSummary> = {}): SystemSummary => ({
  id: 's1',
  name: 'Mi variante',
  kind: 'homebrew',
  campaign_id: 'c1',
  owner_id: 'user-1',
  branched_from: null,
  archived_at: null,
  created_at: '2026-10-05T12:00:00Z',
  updated_at: '2026-10-05T12:00:00Z',
  ...over,
})
const origin = (over: Partial<SystemSummary> = {}) => system({ id: 'o1', name: 'D&D 5e base', kind: 'origin', campaign_id: null, owner_id: null, ...over })

function setup({ isDM = true, systems = [] as SystemSummary[] } = {}) {
  const made = createFakeLayer({ systems })
  const view = renderSection('/c/demo/ajustes', { layer: made.layer, isDM })
  return { ...made, ...view }
}
const section = () => screen.findByRole('region', { name: 'Homebrew' })
const business = (message: string, code = 'P0001') => toDataError({ code, message })

async function openBranchDialog() {
  fireEvent.click(await within(await section()).findByRole('button', { name: 'Guardar como homebrew' }))
  return screen.findByRole('dialog', { name: 'Guardar como homebrew' })
}

describe('Ajustes: Homebrew section', () => {
  it('is not offered to a player and reads no systems for them', async () => {
    const { spies } = setup({ isDM: false })
    expect(await screen.findByRole('heading', { level: 1, name: 'Sección no encontrada' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Homebrew' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar como homebrew' })).not.toBeInTheDocument()
    expect(spies.listAvailableBases).not.toHaveBeenCalled()
    expect(spies.branchSystem).not.toHaveBeenCalled()
  })

  it('says so when the campaign has no homebrew yet', async () => {
    setup()
    expect(await within(await section()).findByText('Todavía no guardaste ningún homebrew de esta campaña.')).toBeInTheDocument()
  })

  it('lists only the homebrew of this campaign with name, date and lineage', async () => {
    setup({
      systems: [
        origin(),
        system({ id: 's1', name: 'Mi variante', branched_from: 'o1' }),
        system({ id: 's2', name: 'Otra campaña', campaign_id: 'c-other' }),
        system({ id: 's3', name: 'Suelto', branched_from: 'gone', created_at: '2026-10-06T12:00:00Z' }),
        system({ id: 's4', name: 'Copia congelada', kind: 'frozen' }),
      ],
    })
    const region = await section()
    const rows = await within(region).findAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('Mi variante')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Creado el 5/10/2026')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Derivado de: D&D 5e base')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Suelto')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Derivado de un sistema que ya no está disponible')).toBeInTheDocument()
    expect(within(region).queryByText('Otra campaña')).not.toBeInTheDocument()
    expect(within(region).queryByText('Copia congelada')).not.toBeInTheDocument()
  })

  it('branches a homebrew from the campaign with the typed name and shows it in the list', async () => {
    const { spies } = setup()
    const dialog = await openBranchDialog()
    fireEvent.change(within(dialog).getByLabelText('Nombre'), { target: { value: '  Mi D&D casero ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(spies.branchSystem).toHaveBeenCalledTimes(1)
    expect(spies.branchSystem).toHaveBeenCalledWith('c1', 'Mi D&D casero')
    const region = await section()
    expect(await within(region).findByText('Mi D&D casero')).toBeInTheDocument()
    expect(within(region).queryByText('Todavía no guardaste ningún homebrew de esta campaña.')).not.toBeInTheDocument()
  })

  it('does not call the database with an empty name and keeps the dialog open', async () => {
    const { spies } = setup()
    const dialog = await openBranchDialog()
    fireEvent.change(within(dialog).getByLabelText('Nombre'), { target: { value: '   ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Ingresá un nombre (hasta 120 caracteres).')
    expect(spies.branchSystem).not.toHaveBeenCalled()
  })

  it.each([
    ['systems_limit_reached', business('systems_limit_reached'), 'Llegaste al máximo de sistemas propios. Renombrá o reutilizá alguno en lugar de crear otro.'],
    ['dm_only', business('dm_only', '42501'), 'Solo el DM puede hacer esto.'],
    ['invalid_name', business('invalid_name', '23514'), 'El nombre del sistema no es válido (1 a 120 caracteres).'],
    ['system_not_available', business('system_not_available'), 'Ese sistema base ya no está disponible. Elegí otro o pedí la campaña sin base.'],
    ['unexpected', new Error('boom'), 'No se pudo guardar el homebrew. Intentá de nuevo.'],
  ])('explains %s in Spanish, keeps the dialog open and lets the DM retry', async (_name, error, message) => {
    const { spies } = setup()
    spies.branchSystem.mockRejectedValueOnce(error)
    const dialog = await openBranchDialog()
    fireEvent.change(within(dialog).getByLabelText('Nombre'), { target: { value: 'Casero' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(message)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(spies.branchSystem).toHaveBeenCalledTimes(2)
  })

  it('renames the homebrew of the signed-in user and refreshes the list', async () => {
    const { spies } = setup({ systems: [system()] })
    const row = (await within(await section()).findAllByRole('listitem'))[0]
    fireEvent.click(within(row).getByRole('button', { name: 'Renombrar Mi variante' }))
    const dialog = await screen.findByRole('dialog', { name: 'Renombrar homebrew' })
    expect(within(dialog).getByLabelText('Nombre')).toHaveValue('Mi variante')
    fireEvent.change(within(dialog).getByLabelText('Nombre'), { target: { value: ' Variante 2 ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(spies.renameSystem).toHaveBeenCalledWith('s1', 'Variante 2')
    expect(await within(await section()).findByText('Variante 2')).toBeInTheDocument()
    expect(within(await section()).queryByText('Mi variante')).not.toBeInTheDocument()
  })

  it('offers no rename on a homebrew another DM created', async () => {
    setup({ systems: [system({ owner_id: 'user-9' })] })
    const row = (await within(await section()).findAllByRole('listitem'))[0]
    expect(within(row).getByText('Mi variante')).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: /Renombrar/ })).not.toBeInTheDocument()
  })

  it('explains a refused rename in Spanish', async () => {
    const { spies } = setup({ systems: [system()] })
    spies.renameSystem.mockRejectedValueOnce(business('system_owner_only', '42501'))
    const row = (await within(await section()).findAllByRole('listitem'))[0]
    fireEvent.click(within(row).getByRole('button', { name: 'Renombrar Mi variante' }))
    const dialog = await screen.findByRole('dialog', { name: 'Renombrar homebrew' })
    fireEvent.change(within(dialog).getByLabelText('Nombre'), { target: { value: 'Otro' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Solo quien creó este sistema puede cambiarlo.')
  })
})
