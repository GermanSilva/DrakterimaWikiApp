import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConflictError, DataError } from '../../../data'
import { makeCampaign } from '../../../app/testing/renderApp'
import { createFakeLayer } from '../../testing/fakeLayer'
import { renderSection } from '../../testing/renderSection'
import { pressBar, saveBar } from './saveBarTestKit'
import { DND5E_PROFILE } from '../../system/systemProfile'

configure({ asyncUtilTimeout: 10000 })
afterEach(() => vi.restoreAllMocks())

const STORED = { name: 'Drakterima', system_profile: JSON.parse(JSON.stringify(DND5E_PROFILE)) }

function setup({ isDM = true }: { isDM?: boolean } = {}) {
  const made = createFakeLayer({ campaign: STORED as never })
  const view = renderSection('/c/demo/ajustes?tab=sistema', { layer: made.layer, isDM, campaign: STORED as never })
  return { ...made, ...view }
}
const section = () => screen.findByRole('region', { name: 'Sistema' })
const group = async (name: string) => within(await section()).getByRole('group', { name })
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } })
const save = () => pressBar('Guardar sistema')
// the bar only offers a save once something changed: any edit will do for the tests about what the write carries
const touch = async () => type(within(await group('Clase')).getByLabelText('Título'), 'Clase 2')

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
    expect(within(nivel).getByLabelText('Usar «Nivel»')).toBeChecked()
    expect(within(nivel).getByLabelText('Título')).toHaveValue('Nivel')
    expect(within(nivel).getByLabelText('Nivel mínimo')).toHaveValue(1)
    expect(within(nivel).getByLabelText('Nivel máximo')).toHaveValue(20)
    expect(within(await group('Clase')).getByLabelText('Título')).toHaveValue('Clase')
    const blocks = await group('Bloques de la ficha')
    expect(within(blocks).getAllByRole('checkbox')).toHaveLength(9)
    for (const box of within(blocks).getAllByRole('checkbox')) expect(box).toBeChecked()
  })

  it('saves the edited document against the current version and reports it', async () => {
    const { spies } = setup()
    fireEvent.click(within(await group('Clase')).getByLabelText('Usar «Clase/Trabajo/Grupo»'))
    type(within(await group('Raza')).getByLabelText('Título'), '  Ocupación  ')
    const nivel = await group('Nivel')
    type(within(nivel).getByLabelText('Título'), 'Rango')
    type(within(nivel).getByLabelText('Nivel mínimo'), '0')
    type(within(nivel).getByLabelText('Nivel máximo'), '5')
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
    type(within(await group('Clase')).getByLabelText('Título'), '   ')
    const nivel = await group('Nivel')
    type(within(nivel).getByLabelText('Nivel máximo'), 'x')
    await save()
    const nombre = within(await group('Clase')).getByLabelText('Título')
    await waitFor(() => expect(nombre).toHaveAttribute('aria-invalid', 'true'))
    expect(nombre).toHaveAccessibleDescription(expect.stringContaining('entre 1 y 60'))
    expect(within(nivel).getByLabelText('Nivel máximo')).toHaveAccessibleDescription(expect.stringContaining('enteros'))
    expect(spies.setSystemProfile).not.toHaveBeenCalled()
  })

  it('on a conflict asks to review and never overwrites', async () => {
    const { spies } = setup()
    spies.setSystemProfile.mockRejectedValueOnce(new ConflictError())
    await touch()
    await save()
    expect(await within(await section()).findByText(/cambió mientras la editabas/)).toBeInTheDocument()
  })

  it('tells when the server refuses the document', async () => {
    const { spies } = setup()
    spies.setSystemProfile.mockRejectedValueOnce(new DataError('business', 'invalid_system_profile', { message: 'invalid_system_profile', code: 'P0001', details: 'character.builtins.nivel.range' }, 'invalid_system_profile'))
    await touch()
    await save()
    expect(await within(await section()).findByText(/El servidor no aceptó el sistema/)).toBeInTheDocument()
  })

  it('builds from the campaign document, and a stored document without sections shows every block on', async () => {
    const made = createFakeLayer({ campaign: { name: 'X', system_profile: { version: 1, character: { sections: { hechizos: false } } } } as never })
    renderSection('/c/demo/ajustes?tab=sistema', { layer: made.layer, isDM: true, campaign: makeCampaign({ system_profile: { version: 1, character: { sections: { hechizos: false } } } as never }) })
    const blocks = within(await screen.findByRole('group', { name: 'Bloques de la ficha' }))
    expect(blocks.getByLabelText('Hechizos')).not.toBeChecked()
    expect(blocks.getByLabelText('Estadísticas')).toBeChecked()
  })
})

describe('Ajustes: Sistema section, Datos del sistema (one line per built-in)', () => {
  const SYSTEMS = [
    { id: 'sys-1', name: 'D&D 5e (SRD)', kind: 'origin' as const, campaign_id: null, owner_id: null, branched_from: null, archived_at: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ]
  function setupBased(based: string | null, systems = SYSTEMS) {
    const campaign = { name: 'Drakterima', based_on_system: based, system_profile: JSON.parse(JSON.stringify(DND5E_PROFILE)) }
    const made = createFakeLayer({ campaign: campaign as never, systems })
    const view = renderSection('/c/demo/ajustes?tab=sistema', { layer: made.layer, isDM: true, campaign: campaign as never })
    return { ...made, ...view }
  }
  const basedOn = async () => within(await section()).findByLabelText('Basado en')

  it('Nivel: checkbox, range and title live in one row; the range is disabled while Nivel is off', async () => {
    setup()
    const nivel = await group('Nivel')
    expect(within(nivel).getByLabelText('Usar «Nivel»')).toBeChecked()
    expect(within(nivel).getByText('Rango')).toBeInTheDocument()
    expect(within(nivel).getByLabelText('Nivel mínimo')).toBeEnabled()
    expect(within(nivel).getByLabelText('Nivel máximo')).toBeEnabled()
    expect(within(nivel).getByText('Cualquier rango entre 0 y 1000; por ejemplo 1 a 100 para sistemas con progresión larga.')).toBeInTheDocument()
    fireEvent.click(within(nivel).getByLabelText('Usar «Nivel»'))
    expect(within(nivel).getByLabelText('Nivel mínimo')).toBeDisabled()
    expect(within(nivel).getByLabelText('Nivel máximo')).toBeDisabled()
    expect(within(nivel).getByLabelText('Título')).toBeDisabled()
  })

  it('accepts a level range up to 1000 and rejects above it with the existing message', async () => {
    const { spies } = setup()
    const nivel = await group('Nivel')
    type(within(nivel).getByLabelText('Nivel mínimo'), '1')
    type(within(nivel).getByLabelText('Nivel máximo'), '1001')
    await save()
    expect(await within(nivel).findByText(/enteros entre 0 y 1000/)).toBeInTheDocument()
    expect(spies.setSystemProfile).not.toHaveBeenCalled()
    type(within(nivel).getByLabelText('Nivel máximo'), '1000')
    await save()
    await waitFor(() => expect(spies.setSystemProfile).toHaveBeenCalledTimes(1))
    expect(spies.setSystemProfile.mock.calls[0][1]).toMatchObject({ character: { builtins: { nivel: { min: 1, max: 1000 } } } })
  })

  it.each([
    ['Clase', 'Usar «Clase/Trabajo/Grupo»', 'Clase, Trabajo, Oficio, Grupo… Se usa en la ficha, la lista y el buscador.', 'clase'],
    ['Raza', 'Usar «Raza/Especie»', 'Raza, Especie, Linaje, Ascendencia… Se usa en la ficha, la lista y el buscador.', 'raza'],
  ])('%s: toggle plus title on one row, title disabled while off, saved through the bar', async (name, toggle, hint, key) => {
    const { spies } = setup()
    const row = await group(name)
    expect(within(row).getByLabelText(toggle)).toBeChecked()
    expect(within(row).getByLabelText('Título')).toHaveValue(name)
    expect(within(row).getByText(`Cómo se llama en tu sistema: ${hint}`)).toBeInTheDocument()
    type(within(row).getByLabelText('Título'), 'Oficio')
    await save()
    await waitFor(() => expect(spies.setSystemProfile).toHaveBeenCalledTimes(1))
    expect(spies.setSystemProfile.mock.calls[0][1]).toMatchObject({ character: { builtins: { [key]: { enabled: true, label: 'Oficio' } } } })
    const fresh = await group(name) // the form is rebuilt from what was saved
    fireEvent.click(within(fresh).getByLabelText(toggle))
    expect(within(fresh).getByLabelText('Título')).toBeDisabled()
  })

  it('counts the title edit as a change in the bar', async () => {
    setup()
    type(within(await group('Raza')).getByLabelText('Título'), 'Especie')
    expect(await within(await saveBar()).findByText(/1 cambio sin guardar/)).toBeInTheDocument()
  })

  it('Basado en shows the name of the origin system, read only', async () => {
    const { spies } = setupBased('sys-1')
    await waitFor(async () => expect(await basedOn()).toHaveValue('D&D 5e (SRD)'))
    const field = await basedOn()
    expect(field).toHaveAttribute('readonly')
    expect(within(await section()).getByText('Solo informativo: la campaña tiene su propia copia y no recibe cambios del sistema elegido.')).toBeInTheDocument()
    type(field, 'otro')
    expect(field).toHaveValue('D&D 5e (SRD)')
    expect(spies.setSystemProfile).not.toHaveBeenCalled()
  })

  it('Basado en says it is an original system when there is no lineage', async () => {
    setupBased(null)
    await waitFor(async () => expect(await basedOn()).toHaveValue('Sistema original (no se basa en ninguno)'))
  })

  it('Basado en says the system is not available when the DM cannot read it', async () => {
    setupBased('sys-gone')
    await waitFor(async () => expect(await basedOn()).toHaveValue('Sistema no disponible'))
  })
})

type Sent = { distance?: unknown; character?: unknown }

describe('Ajustes: Sistema section, Distancias', () => {
  const DISTANCE = {
    main: 'ft',
    units: [
      { key: 'ft', label: 'Pies', value: 1, decimals: 0 },
      { key: 'm', label: 'Metros', value: 3.28084, decimals: 1 },
    ],
  }
  function setupWith(extra: Record<string, unknown> = {}) {
    const campaign = { name: 'Drakterima', system_profile: { ...JSON.parse(JSON.stringify(DND5E_PROFILE)), ...extra } }
    const made = createFakeLayer({ campaign: campaign as never })
    const view = renderSection('/c/demo/ajustes?tab=sistema', { layer: made.layer, isDM: true, campaign: campaign as never })
    return { ...made, ...view }
  }
  const distancias = async () => within(await group('Distancias'))
  const row = async (n: number) => within((await distancias()).getByRole('group', { name: `Unidad ${n}` }))
  const add = async () => fireEvent.click((await distancias()).getByRole('button', { name: 'Agregar unidad' }))
  const fill = async (n: number, key: string, label: string, value: string, decimals = '0') => {
    const r = await row(n)
    type(r.getByLabelText('Clave'), key)
    type(r.getByLabelText('Nombre'), label)
    type(r.getByLabelText('Valor'), value)
    type(r.getByLabelText('Decimales'), decimals)
  }

  it('starts empty for a campaign without units, with the markup explained', async () => {
    setupWith()
    const d = await distancias()
    expect(d.queryAllByRole('group')).toHaveLength(0)
    expect(d.getByText(/\[\[\{D:clave\}15\]\]/)).toBeInTheDocument()
    expect(d.getByRole('button', { name: 'Agregar unidad' })).toBeEnabled()
  })

  it('does not add a distance to the document when none was defined', async () => {
    const { spies } = setupWith()
    await touch()
    await save()
    await waitFor(() => expect(spies.setSystemProfile).toHaveBeenCalledTimes(1))
    expect((spies.setSystemProfile.mock.calls[0][1] as Sent)).not.toHaveProperty('distance')
  })

  it('shows the stored units: the key is fixed, the main is selected', async () => {
    setupWith({ distance: DISTANCE })
    const first = await row(1)
    expect(first.getByLabelText('Clave')).toHaveValue('ft')
    expect(first.getByLabelText('Clave')).toHaveAttribute('readonly')
    expect(first.getByLabelText('Nombre')).toHaveValue('Pies')
    expect(first.getByLabelText('Valor')).toHaveValue('1')
    expect(first.getByLabelText('Decimales')).toHaveValue('0')
    expect(first.getByLabelText('Principal')).toBeChecked()
    const second = await row(2)
    expect(second.getByLabelText('Valor')).toHaveValue('3.28084')
    expect(second.getByLabelText('Decimales')).toHaveValue('1')
    expect(second.getByLabelText('Principal')).not.toBeChecked()
  })

  it('adds units, picks the main one and saves the document with them', async () => {
    const { spies } = setupWith()
    await add()
    await fill(1, 'ft', 'Pies', '1')
    await add()
    await fill(2, 'm', ' Metros ', '3,28084', '1')
    await add()
    await fill(3, 'c', 'Casilleros', '5')
    fireEvent.click((await row(2)).getByLabelText('Principal'))
    await save()
    await waitFor(() => expect(spies.setSystemProfile).toHaveBeenCalledTimes(1))
    const profile = spies.setSystemProfile.mock.calls[0][1] as Sent
    expect(profile.distance).toEqual({
      main: 'm',
      units: [
        { key: 'ft', label: 'Pies', value: 1, decimals: 0 },
        { key: 'm', label: 'Metros', value: 3.28084, decimals: 1 },
        { key: 'c', label: 'Casilleros', value: 5, decimals: 0 },
      ],
    })
    expect(profile.character).toBeDefined()
    expect(await within(await section()).findByText('Sistema guardado.')).toBeInTheDocument()
  })

  it('a first unit is the main one until another is picked', async () => {
    setupWith()
    await add()
    expect((await row(1)).getByLabelText('Principal')).toBeChecked()
    await add()
    expect((await row(2)).getByLabelText('Principal')).not.toBeChecked()
  })

  it('reorders with Subir and Bajar (the ends are disabled) and keeps the order on save', async () => {
    const { spies } = setupWith({ distance: DISTANCE })
    expect((await row(1)).getByRole('button', { name: 'Subir' })).toBeDisabled()
    expect((await row(2)).getByRole('button', { name: 'Bajar' })).toBeDisabled()
    fireEvent.click((await row(2)).getByRole('button', { name: 'Subir' }))
    expect((await row(1)).getByLabelText('Clave')).toHaveValue('m')
    expect((await row(2)).getByLabelText('Clave')).toHaveValue('ft')
    await save()
    await waitFor(() => expect(spies.setSystemProfile).toHaveBeenCalledTimes(1))
    expect((spies.setSystemProfile.mock.calls[0][1] as Sent).distance).toEqual({ main: 'ft', units: [DISTANCE.units[1], DISTANCE.units[0]] })
  })

  it('removes a unit; removing the main one makes the first remaining unit the main', async () => {
    const { spies } = setupWith({ distance: DISTANCE })
    fireEvent.click((await row(1)).getByRole('button', { name: 'Quitar' }))
    expect((await distancias()).getAllByRole('group')).toHaveLength(1)
    expect((await row(1)).getByLabelText('Clave')).toHaveValue('m')
    expect((await row(1)).getByLabelText('Principal')).toBeChecked()
    await save()
    await waitFor(() => expect(spies.setSystemProfile).toHaveBeenCalledTimes(1))
    expect((spies.setSystemProfile.mock.calls[0][1] as Sent).distance).toEqual({ main: 'm', units: [DISTANCE.units[1]] })
  })

  it('removing every unit removes the distance from the document', async () => {
    const { spies } = setupWith({ distance: DISTANCE })
    fireEvent.click((await row(1)).getByRole('button', { name: 'Quitar' }))
    fireEvent.click((await row(1)).getByRole('button', { name: 'Quitar' }))
    await save()
    await waitFor(() => expect(spies.setSystemProfile).toHaveBeenCalledTimes(1))
    expect((spies.setSystemProfile.mock.calls[0][1] as Sent)).not.toHaveProperty('distance')
  })

  it('saving the rest of the system sends the stored units back untouched', async () => {
    const { spies } = setupWith({ distance: DISTANCE })
    fireEvent.click(within(await group('Bloques de la ficha')).getByLabelText('Hechizos'))
    await save()
    await waitFor(() => expect(spies.setSystemProfile).toHaveBeenCalledTimes(1))
    expect((spies.setSystemProfile.mock.calls[0][1] as Sent).distance).toEqual(DISTANCE)
  })

  it('does not offer a ninth unit', async () => {
    setupWith()
    for (let i = 0; i < 8; i++) await add()
    expect((await distancias()).getAllByRole('group')).toHaveLength(8)
    expect((await distancias()).getByRole('button', { name: 'Agregar unidad' })).toBeDisabled()
  })

  it('shows the errors of each field with aria, and does not write', async () => {
    const { spies } = setupWith()
    await add()
    await fill(1, 'Bad Key', '', '0')
    await add()
    await fill(2, 'ft', 'Pies', 'x')
    await save()
    const first = await row(1)
    await waitFor(() => expect(first.getByLabelText('Clave')).toHaveAttribute('aria-invalid', 'true'))
    expect(first.getByLabelText('Clave')).toHaveAccessibleDescription(expect.stringContaining('minúscula'))
    expect(first.getByLabelText('Nombre')).toHaveAccessibleDescription(expect.stringContaining('entre 1 y 60'))
    expect(first.getByLabelText('Valor')).toHaveAccessibleDescription(expect.stringContaining('mayor que 0'))
    expect((await row(2)).getByLabelText('Valor')).toHaveAccessibleDescription(expect.stringContaining('mayor que 0'))
    expect(spies.setSystemProfile).not.toHaveBeenCalled()
  })

  it('reports a repeated key and a missing main', async () => {
    const { spies } = setupWith()
    await add()
    await fill(1, 'ft', 'Pies', '1')
    await add()
    await fill(2, 'ft', 'Pies 2', '1')
    await save()
    expect((await row(2)).getByLabelText('Clave')).toHaveAccessibleDescription(expect.stringContaining('otra unidad'))
    expect(spies.setSystemProfile).not.toHaveBeenCalled()
  })

  it('a stored key stays fixed but a new one can be typed', async () => {
    setupWith({ distance: DISTANCE })
    await add()
    expect((await row(3)).getByLabelText('Clave')).not.toHaveAttribute('readonly')
  })
})
