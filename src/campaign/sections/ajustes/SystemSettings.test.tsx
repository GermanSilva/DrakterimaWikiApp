import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConflictError, DataError } from '../../../data'
import { makeCampaign } from '../../../app/testing/renderApp'
import { createFakeLayer } from '../../testing/fakeLayer'
import { renderSection } from '../../testing/renderSection'
import { DND5E_PROFILE } from '../../system/systemProfile'

configure({ asyncUtilTimeout: 5000 })
afterEach(() => vi.restoreAllMocks())

const STORED = { name: 'Drakterima', system_profile: JSON.parse(JSON.stringify(DND5E_PROFILE)) }

function setup({ isDM = true }: { isDM?: boolean } = {}) {
  const made = createFakeLayer({ campaign: STORED as never })
  const view = renderSection('/c/demo/ajustes', { layer: made.layer, isDM, campaign: STORED as never })
  return { ...made, ...view }
}
const section = () => screen.findByRole('region', { name: 'Sistema' })
const group = async (name: string) => within(await section()).getByRole('group', { name })
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } })
const save = async () => fireEvent.click(within(await section()).getByRole('button', { name: 'Guardar sistema' }))

describe('Ajustes: Sistema section', () => {
  it('is not shown to a player', async () => {
    const { spies } = setup({ isDM: false })
    expect(await screen.findByRole('heading', { level: 1, name: 'Sección no encontrada' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Sistema' })).not.toBeInTheDocument()
    expect(spies.setSystemProfile).not.toHaveBeenCalled()
  })

  it('shows the stored built-ins, the level range and the nine sheet blocks', async () => {
    setup()
    const nivel = await group('Nivel')
    expect(within(nivel).getByLabelText('Usar este campo')).toBeChecked()
    expect(within(nivel).getByLabelText('Nombre en la ficha')).toHaveValue('Nivel')
    expect(within(nivel).getByLabelText('Mínimo')).toHaveValue(1)
    expect(within(nivel).getByLabelText('Máximo')).toHaveValue(20)
    expect(within(await group('Clase')).getByLabelText('Nombre en la ficha')).toHaveValue('Clase')
    const blocks = await group('Bloques de la ficha')
    expect(within(blocks).getAllByRole('checkbox')).toHaveLength(9)
    for (const box of within(blocks).getAllByRole('checkbox')) expect(box).toBeChecked()
  })

  it('saves the edited document against the current version and reports it', async () => {
    const { spies } = setup()
    fireEvent.click(within(await group('Clase')).getByLabelText('Usar este campo'))
    type(within(await group('Raza')).getByLabelText('Nombre en la ficha'), '  Ocupación  ')
    const nivel = await group('Nivel')
    type(within(nivel).getByLabelText('Nombre en la ficha'), 'Rango')
    type(within(nivel).getByLabelText('Mínimo'), '0')
    type(within(nivel).getByLabelText('Máximo'), '5')
    fireEvent.click(within(await group('Bloques de la ficha')).getByLabelText('Hechizos'))
    await save()

    expect(await within(await section()).findByText('Sistema guardado.')).toBeInTheDocument()
    expect(spies.setSystemProfile).toHaveBeenCalledTimes(1)
    const [id, profile, base] = spies.setSystemProfile.mock.calls[0]
    expect(id).toBe('c1')
    expect(base).toBe('2026-01-01T00:00:00Z')
    expect(profile).toMatchObject({
      version: 1,
      character: {
        builtins: { clase: { enabled: false, label: 'Clase' }, raza: { enabled: true, label: 'Ocupación' }, nivel: { enabled: true, label: 'Rango', min: 0, max: 5 } },
        sections: { hechizos: false, stats: true },
      },
      currency: DND5E_PROFILE.currency,
      modules: DND5E_PROFILE.modules,
    })
  })

  it('shows the field errors, wires them with aria and does not write', async () => {
    const { spies } = setup()
    type(within(await group('Clase')).getByLabelText('Nombre en la ficha'), '   ')
    const nivel = await group('Nivel')
    type(within(nivel).getByLabelText('Máximo'), 'x')
    await save()
    const nombre = within(await group('Clase')).getByLabelText('Nombre en la ficha')
    await waitFor(() => expect(nombre).toHaveAttribute('aria-invalid', 'true'))
    expect(nombre).toHaveAccessibleDescription(expect.stringContaining('entre 1 y 60'))
    expect(within(nivel).getByLabelText('Máximo')).toHaveAccessibleDescription(expect.stringContaining('enteros'))
    expect(spies.setSystemProfile).not.toHaveBeenCalled()
  })

  it('on a conflict asks to review and never overwrites', async () => {
    const { spies } = setup()
    spies.setSystemProfile.mockRejectedValueOnce(new ConflictError())
    await save()
    expect(await within(await section()).findByText(/cambió mientras la editabas/)).toBeInTheDocument()
  })

  it('tells when the server refuses the document', async () => {
    const { spies } = setup()
    spies.setSystemProfile.mockRejectedValueOnce(new DataError('business', 'invalid_system_profile', { message: 'invalid_system_profile', code: 'P0001', details: 'character.builtins.nivel.range' }, 'invalid_system_profile'))
    await save()
    expect(await within(await section()).findByText(/El servidor no aceptó el sistema/)).toBeInTheDocument()
  })

  it('builds from the campaign document, and a stored document without sections shows every block on', async () => {
    const made = createFakeLayer({ campaign: { name: 'X', system_profile: { version: 1, character: { sections: { hechizos: false } } } } as never })
    renderSection('/c/demo/ajustes', { layer: made.layer, isDM: true, campaign: makeCampaign({ system_profile: { version: 1, character: { sections: { hechizos: false } } } as never }) })
    const blocks = within(await screen.findByRole('group', { name: 'Bloques de la ficha' }))
    expect(blocks.getByLabelText('Hechizos')).not.toBeChecked()
    expect(blocks.getByLabelText('Estadísticas')).toBeChecked()
  })
})
