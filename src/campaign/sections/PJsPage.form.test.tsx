import { act, configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OWNER_COLUMNS, OWNER_DATA_KEYS, isOwnerEditable } from '../pjOwnerFields'
import type { EntityFormApi } from '../entityFormContext'
import { createFakeLayer } from '../testing/fakeLayer'
import { entity, renderSection } from '../testing/renderSection'

configure({ asyncUtilTimeout: 5000 })

// Captures the real form API so a test can try to open forms the UI never offers (a hostile / buggy caller).
let formApi: EntityFormApi | null = null
vi.mock('../entityFormContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../entityFormContext')>()
  return {
    ...actual,
    useEntityForm: () => {
      const api = actual.useEntityForm()
      formApi = api
      return api
    },
  }
})

afterEach(() => {
  formApi = null
  vi.restoreAllMocks()
})

const COINS0 = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }
const pj = (id: number, over: Record<string, unknown> = {}) =>
  entity(id, {
    nombre: `PJ ${id}`, jugador: '', clase: 'Guerrero', raza: '', region: 'magral', nivel: 1, imagen_url: '',
    sections_updated: {}, monedas: COINS0, monedas_guardado: {}, ...over,
  })

// no stat_hp_current / experiencia: the form seeds defaults the entity does not have
const ELDRIC = pj(1, {
  nombre: 'Eldric', jugador: 'Ana', clase: 'Paladín', raza: 'Humano', nivel: 5, estado: 'secreto',
  stat_hp: 40, stat_ac: 18, trasfondo: 'Soldado', alineamiento: 'Leal Bueno',
  custom_fields: { magralita: 'vieja', otro: 'se conserva' },
  monedas: { cp: 0, sp: 0, ep: 0, gp: 10, pp: 0 },
})
const FIELDS = [{ key: 'magralita', label: 'Relación con la Magralita' }]
const REGIONS = [{ key: 'magral', label: 'Tierras de Magral' }, { key: 'nezor', label: 'Nezor' }]

const ISO = /^\d{4}-\d{2}-\d{2}T/
const stampedSections = (patch: Record<string, unknown>) => Object.keys((patch.sections_updated ?? {}) as Record<string, string>).sort()
const dialogEl = () => screen.getByRole('dialog')
const updateCall = (spies: ReturnType<typeof createFakeLayer>['spies']) => {
  const [table, target, patch] = spies.saveEntityWithDmNotes.mock.calls[0] as [string, { id?: number; campaignId: string; base?: { updated_at: string } }, Record<string, unknown>]
  return { table, target, patch }
}

describe('PJ form: DM', () => {
  it('edit offers the three tabs, saves only what changed and stamps the sections it touched', async () => {
    const { layer, spies } = createFakeLayer({ entities: { pjs: [ELDRIC] }, dmNotes: {}, visibility: { 1: [3] } })
    renderSection('/c/demo/pjs/1', { layer, regions: REGIONS, customFields: FIELDS })
    await screen.findByRole('heading', { level: 1, name: 'Eldric' })
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    await screen.findByRole('dialog')
    for (const tab of ['Identidad', 'Mecánicas', 'Equipo & Rasgos']) expect(within(dialogEl()).getByRole('button', { name: tab })).toBeInTheDocument()
    expect(within(dialogEl()).getByText('Nivel')).toBeInTheDocument()
    expect(within(dialogEl()).getByText('Experiencia (XP)')).toBeInTheDocument()
    expect(within(dialogEl()).getByRole('combobox', { name: 'Visibilidad' })).toHaveValue('secreto')
    expect(within(dialogEl()).getByText('Notas del DM (privadas 🔒)')).toBeInTheDocument()
    // region select: campaign regions
    expect(within(dialogEl()).getByRole('option', { name: 'Tierras de Magral' })).toBeInTheDocument()

    fireEvent.change(within(dialogEl()).getByDisplayValue('Eldric'), { target: { value: 'Eldric II' } })
    fireEvent.change(within(dialogEl()).getByDisplayValue('Soldado'), { target: { value: 'Capitán' } })
    fireEvent.click(within(dialogEl()).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(spies.saveEntityWithDmNotes).toHaveBeenCalledTimes(1))
    const { table, target, patch } = updateCall(spies)
    expect(table).toBe('pjs')
    expect(target).toMatchObject({ campaignId: 'c1', id: 1, base: { updated_at: '2026-01-02T10:00:00Z' } })
    expect(Object.keys(patch).sort()).toEqual(['nombre', 'sections_updated', 'trasfondo'])
    expect(patch).toMatchObject({ nombre: 'Eldric II', trasfondo: 'Capitán' })
    expect(stampedSections(patch)).toEqual(['general', 'narrativa'])
    expect((patch.sections_updated as Record<string, string>).narrativa).toMatch(ISO)
    expect(spies.setVisibility).not.toHaveBeenCalled() // unchanged visibility is not rewritten
    expect(spies.dmNotesUpsert).not.toHaveBeenCalled()
    // the saver's own dots are cleared straight away
    await waitFor(() => expect(layer.readState.markSeen).toHaveBeenCalledWith('c1', 'pjs', 1, 'narrativa', expect.any(Date)))
    expect(layer.readState.markSeen).toHaveBeenCalledWith('c1', 'pjs', 1, 'general', expect.any(Date))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('opening and saving without edits writes nothing (defaults the entity lacks are not materialised)', async () => {
    const { layer, spies } = createFakeLayer({ entities: { pjs: [ELDRIC] }, dmNotes: {}, visibility: { 1: [] } })
    renderSection('/c/demo/pjs/1', { layer, customFields: FIELDS })
    await screen.findByRole('heading', { level: 1, name: 'Eldric' })
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    await screen.findByRole('dialog')
    fireEvent.click(within(dialogEl()).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(spies.saveEntityWithDmNotes).not.toHaveBeenCalled()
  })

  it('coins are editable by the DM (Equipo tab): the patch carries monedas and stamps only "equipo"', async () => {
    const { layer, spies } = createFakeLayer({ entities: { pjs: [ELDRIC] }, dmNotes: {}, visibility: { 1: [] } })
    renderSection('/c/demo/pjs/1', { layer })
    await screen.findByRole('heading', { level: 1, name: 'Eldric' })
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    await screen.findByRole('dialog')
    fireEvent.click(within(dialogEl()).getByRole('button', { name: 'Equipo & Rasgos' }))
    const hand = within(dialogEl()).getByText('Monedas en mano').parentElement as HTMLElement
    const oro = within(hand).getAllByRole('spinbutton')[3] // cp sp ep gp pp
    expect(oro).toHaveValue(10)
    fireEvent.change(oro, { target: { value: '25' } })
    fireEvent.click(within(dialogEl()).getByRole('button', { name: 'Guardar', hidden: false }))
    await waitFor(() => expect(spies.saveEntityWithDmNotes).toHaveBeenCalledTimes(1))
    const { patch } = updateCall(spies)
    expect(Object.keys(patch).sort()).toEqual(['monedas', 'sections_updated'])
    expect(patch.monedas).toEqual({ cp: 0, sp: 0, ep: 0, gp: 25, pp: 0 })
    expect(stampedSections(patch)).toEqual(['equipo'])
  })

  it('DM notes go to the DM table (never the entity row) and are NOT stamped into sections_updated (readable by players)', async () => {
    const { layer, spies } = createFakeLayer({ entities: { pjs: [ELDRIC] }, dmNotes: { 'pjs:1': { notas: 'previa', secreto: '', ganchos: '' } }, visibility: { 1: [] } })
    renderSection('/c/demo/pjs/1', { layer })
    await screen.findByRole('heading', { level: 1, name: 'Eldric' })
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    await screen.findByRole('dialog')
    fireEvent.change(await within(dialogEl()).findByDisplayValue('previa'), { target: { value: 'nueva nota' } })
    fireEvent.click(within(dialogEl()).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(spies.dmNotesUpsert).toHaveBeenCalledWith('c1', 'pjs', 1, { notas: 'nueva nota' }))
    const { patch } = updateCall(spies)
    expect(patch).toEqual({}) // nothing for the entity row: no notas, no stamp
    await waitFor(() => expect(layer.readState.markSeen).toHaveBeenCalledWith('c1', 'pjs', 1, 'dm', expect.any(Date)))
  })

  it('a visibility-only change goes through the RPC and stamps nothing', async () => {
    const { layer, spies } = createFakeLayer({
      entities: { pjs: [ELDRIC] }, dmNotes: {}, visibility: { 1: [] }, index: { pjs: [{ id: 3, title: 'Kay', imagen_url: null, estado: 'publicado' }] },
    })
    renderSection('/c/demo/pjs/1', { layer })
    await screen.findByRole('heading', { level: 1, name: 'Eldric' })
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    await screen.findByRole('dialog')
    fireEvent.click(await within(dialogEl()).findByRole('checkbox', { name: 'Kay' }))
    fireEvent.click(within(dialogEl()).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(spies.setVisibility).toHaveBeenCalledWith('pjs', 1, [3]))
    expect(updateCall(spies).patch).toEqual({})
  })

  it('changing the maximum HP writes the current HP explicitly (its seeded default derives from the maximum)', async () => {
    const { layer, spies } = createFakeLayer({ entities: { pjs: [ELDRIC] }, dmNotes: {}, visibility: { 1: [] } })
    renderSection('/c/demo/pjs/1', { layer })
    await screen.findByRole('heading', { level: 1, name: 'Eldric' })
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    await screen.findByRole('dialog')
    fireEvent.click(within(dialogEl()).getByRole('button', { name: 'Mecánicas' }))
    const max = within(within(dialogEl()).getByText('HP Máx.').parentElement as HTMLElement).getByRole('spinbutton')
    fireEvent.change(max, { target: { value: '50' } })
    fireEvent.click(within(dialogEl()).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(spies.saveEntityWithDmNotes).toHaveBeenCalledTimes(1))
    const { patch } = updateCall(spies)
    expect(patch).toMatchObject({ stat_hp: 50, stat_hp_current: 40 })
    expect(stampedSections(patch)).toEqual(['stats'])
  })

  it('the campaign custom field is edited as a key of custom_fields and the other keys are kept', async () => {
    const { layer, spies } = createFakeLayer({ entities: { pjs: [ELDRIC] }, dmNotes: {}, visibility: { 1: [] } })
    renderSection('/c/demo/pjs/1', { layer, customFields: FIELDS })
    await screen.findByRole('heading', { level: 1, name: 'Eldric' })
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    await screen.findByRole('dialog')
    fireEvent.change(within(dialogEl()).getByLabelText('Relación con la Magralita'), { target: { value: 'nueva' } })
    fireEvent.click(within(dialogEl()).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(spies.saveEntityWithDmNotes).toHaveBeenCalledTimes(1))
    const { patch } = updateCall(spies)
    expect(patch.custom_fields).toEqual({ magralita: 'nueva', otro: 'se conserva' })
    expect(stampedSections(patch)).toEqual(['narrativa'])
  })

  it('create: DM fills the form; the payload has the defaults, the first region, a "general" stamp and no legacy / DM fields', async () => {
    const { layer, spies } = createFakeLayer()
    renderSection('/c/demo/pjs', { layer, regions: REGIONS })
    await screen.findByRole('heading', { level: 1, name: 'El Grupo' })
    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo PJ' }))
    await screen.findByRole('dialog')
    const nombre = within(dialogEl()).getAllByRole('textbox')[0]
    fireEvent.change(nombre, { target: { value: 'Nuevo' } })
    fireEvent.click(within(dialogEl()).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(spies.saveEntityWithDmNotes).toHaveBeenCalledTimes(1))
    const { target, patch } = updateCall(spies)
    expect(target).toEqual({ campaignId: 'c1' }) // create
    expect(patch).toMatchObject({ nombre: 'Nuevo', nivel: 1, region: 'magral', estado: 'publicado', monedas: COINS0 })
    expect(patch).not.toHaveProperty('player_password')
    expect(patch).not.toHaveProperty('player_must_change')
    expect(patch).not.toHaveProperty('notas')
    expect(patch).not.toHaveProperty('visibilidad')
    expect(stampedSections(patch)).toEqual(['general'])
    await waitFor(() => expect(layer.readState.markSeen).toHaveBeenCalledWith('c1', 'pjs', 99, 'general', expect.any(Date)))
  })

  it('delete from the form asks for confirmation, removes the character and leaves the sheet', async () => {
    const { layer, spies } = createFakeLayer({ entities: { pjs: [ELDRIC] }, dmNotes: {}, visibility: { 1: [] } })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderSection('/c/demo/pjs/1', { layer })
    await screen.findByRole('heading', { level: 1, name: 'Eldric' })
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    await screen.findByRole('dialog')
    fireEvent.click(within(dialogEl()).getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(spies.entityRemove).toHaveBeenCalled())
  })

  it('a region the campaign does not list is kept as an option instead of being silently replaced', async () => {
    const { layer } = createFakeLayer({ entities: { pjs: [pj(1, { nombre: 'Eldric', region: 'perdida' })] }, dmNotes: {}, visibility: { 1: [] } })
    renderSection('/c/demo/pjs/1', { layer, regions: REGIONS })
    await screen.findByRole('heading', { level: 1, name: 'Eldric' })
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    await screen.findByRole('dialog')
    const select = within(dialogEl()).getByRole('option', { name: 'perdida' }).closest('select') as HTMLSelectElement
    expect(select.value).toBe('perdida')
  })
})

describe('PJ form: the owner of the character', () => {
  const openOwnerForm = async (layer: ReturnType<typeof createFakeLayer>['layer'], characterIds = [1]) => {
    renderSection('/c/demo/pjs/1', { layer, isDM: false, characterIds, regions: REGIONS, customFields: FIELDS })
    await screen.findByRole('heading', { level: 1, name: 'Eldric' })
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    await screen.findByRole('dialog')
  }

  it('sees only the identity tab and none of the DM / mechanics fields', async () => {
    const { layer, spies } = createFakeLayer({ entities: { pjs: [ELDRIC] } })
    await openOwnerForm(layer)
    const dialog = dialogEl()
    expect(within(dialog).getByRole('button', { name: 'Identidad' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Mecánicas' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Equipo & Rasgos' })).toBeNull()
    for (const hidden of ['Nivel', 'Experiencia (XP)', 'Notas del DM (privadas 🔒)']) expect(within(dialog).queryByText(hidden)).toBeNull()
    expect(within(dialog).queryByRole('combobox', { name: 'Visibilidad' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Eliminar' })).toBeNull()
    expect(within(dialog).queryByText(/Monedas/)).toBeNull()
    expect(within(dialog).getByLabelText('Relación con la Magralita')).toBeInTheDocument()
    // a player never reads the DM tables, not even to open its own form
    expect(spies.dmNotesGet).not.toHaveBeenCalled()
    expect(spies.dmNotesList).not.toHaveBeenCalled()
    expect(spies.getVisibility).not.toHaveBeenCalled()
  })

  it('saves only allowed keys (the form defaults for HP / XP / ... never travel) and stamps the section', async () => {
    const { layer, spies } = createFakeLayer({ entities: { pjs: [ELDRIC] } })
    await openOwnerForm(layer)
    fireEvent.change(within(dialogEl()).getByDisplayValue('Paladín'), { target: { value: 'Clérigo' } })
    fireEvent.change(within(dialogEl()).getByDisplayValue('Soldado'), { target: { value: 'Soldado veterano' } })
    fireEvent.change(within(dialogEl()).getByLabelText('Relación con la Magralita'), { target: { value: 'cambió' } })
    fireEvent.click(within(dialogEl()).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(spies.saveEntityWithDmNotes).toHaveBeenCalledTimes(1))
    const { table, target, patch } = updateCall(spies)
    expect(table).toBe('pjs')
    expect(target).toMatchObject({ id: 1, base: { updated_at: '2026-01-02T10:00:00Z' } })
    expect(Object.keys(patch).sort()).toEqual(['clase', 'custom_fields', 'sections_updated', 'trasfondo'])
    for (const key of Object.keys(patch)) expect(isOwnerEditable(key)).toBe(true)
    expect(patch.custom_fields).toEqual({ magralita: 'cambió', otro: 'se conserva' })
    expect(stampedSections(patch)).toEqual(['general', 'narrativa'])
    expect(spies.dmNotesUpsert).not.toHaveBeenCalled()
    expect(spies.setVisibility).not.toHaveBeenCalled()
  })

  it('the form values the owner never saw (stat_hp_current seeded from stat_hp) are dropped from the payload', async () => {
    // the DM form would send stat_hp_current: 40 here; an owner must not (the database would reject the whole save)
    const { layer, spies } = createFakeLayer({ entities: { pjs: [ELDRIC] } })
    await openOwnerForm(layer)
    fireEvent.change(within(dialogEl()).getByDisplayValue('Humano'), { target: { value: 'Elfo' } })
    fireEvent.click(within(dialogEl()).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(spies.saveEntityWithDmNotes).toHaveBeenCalledTimes(1))
    const { patch } = updateCall(spies)
    expect(patch).not.toHaveProperty('stat_hp_current')
    expect(patch).not.toHaveProperty('nivel')
    expect(patch).not.toHaveProperty('experiencia')
    expect(patch).not.toHaveProperty('estado')
    expect(patch).not.toHaveProperty('monedas')
    expect(patch).not.toHaveProperty('monedas_guardado')
    expect(Object.keys(patch).sort()).toEqual(['raza', 'sections_updated'])
  })

  it('an owner who changes nothing writes nothing', async () => {
    const { layer, spies } = createFakeLayer({ entities: { pjs: [ELDRIC] } })
    await openOwnerForm(layer)
    fireEvent.click(within(dialogEl()).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(spies.saveEntityWithDmNotes).not.toHaveBeenCalled()
  })

  it('a character that is not theirs: no edit button; the form API refuses it, and refuses create / other types', async () => {
    const { layer } = createFakeLayer({ entities: { pjs: [ELDRIC, pj(2, { nombre: 'Maisie' })] } })
    renderSection('/c/demo/pjs/2', { layer, isDM: false, characterIds: [1] })
    await screen.findByRole('heading', { level: 1, name: 'Maisie' })
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
    await act(async () => {
      formApi?.openForm({ type: 'pjs', id: 2 })
      formApi?.openForm({ type: 'pjs' })
      formApi?.openForm({ type: 'pnjs', id: 1 })
      formApi?.openForm({ type: 'pjs', id: 999 })
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('owner-editable field list', () => {
  it('lists only identity columns and data keys, never level / XP / coins / state / owner / DM data', () => {
    const all = [...OWNER_COLUMNS, ...OWNER_DATA_KEYS] as string[]
    for (const forbidden of ['nivel', 'experiencia', 'monedas', 'monedas_guardado', 'estado', 'owner_id', 'visible_to', 'notas', 'secreto', 'stat_hp', 'hechizos', 'equipo', 'ataques']) {
      expect(all).not.toContain(forbidden)
      expect(isOwnerEditable(forbidden)).toBe(false)
    }
  })
})
