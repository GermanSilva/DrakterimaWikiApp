/** G4b: the hub character editor drawn from the sheet (default for a valid stored sheet): fallback, save payload, DM vs player, unread stamps. */
import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ENTITY, SHEET } from '../system/sheet/editorFixture'
import { dnd5eProfile } from '../system/systemProfile'
import { createFakeLayer } from '../testing/fakeLayer'
import { entity, renderSection } from '../testing/renderSection'

configure({ asyncUtilTimeout: 10000 })

const withSheet = (sheet: unknown = SHEET) => ({ system_profile: { ...dnd5eProfile(), sheet } as unknown as Record<string, unknown> })
const REGIONS = [{ key: 'magral', label: 'Tierras de Magral' }, { key: 'nezor', label: 'Nezor' }]
const ANA = entity(1, { ...ENTITY, sections_updated: {} })
const ISO = /^\d{4}-\d{2}-\d{2}T/

type Spies = ReturnType<typeof createFakeLayer>['spies']
const dialogEl = () => screen.getByRole('dialog')
const call = (spies: Spies) => {
  const [table, target, patch] = spies.saveEntityWithDmNotes.mock.calls[0] as [string, { id?: number; campaignId: string }, Record<string, unknown>]
  return { table, target, patch }
}
const stamped = (patch: Record<string, unknown>) => Object.keys((patch.sections_updated ?? {}) as Record<string, string>).sort()
const modalEl = () => screen.getByRole('dialog', { name: 'Espacios' })
const openEspacios = (verb = 'Editar') => fireEvent.click(within(dialogEl()).getByRole('button', { name: `${verb} Espacios` }))
const listo = () => fireEvent.click(within(modalEl()).getByRole('button', { name: 'Listo' }))
const tab = (name: string) => fireEvent.click(within(dialogEl()).getByRole('button', { name }))

async function openEditor(opts: { url?: string; isDM?: boolean; campaign?: Record<string, unknown>; pjs?: unknown[] } = {}) {
  const { layer, spies } = createFakeLayer({ entities: { pjs: (opts.pjs ?? [ANA]) as never[] }, dmNotes: {}, visibility: { 1: [] } })
  const isDM = opts.isDM ?? true
  renderSection(opts.url ?? '/c/demo/pjs/1', { layer, isDM, characterIds: isDM ? [] : [1], regions: REGIONS, campaign: opts.campaign ?? withSheet() })
  await screen.findByRole('heading', { level: 1, name: 'Ana' })
  fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
  await screen.findByRole('dialog')
  return { layer, spies }
}
const sheetEditor = () => dialogEl().querySelector('[data-sheet-editor]')

describe('default for a valid stored sheet, exactly like the sheet detail', () => {
  it('a valid sheet needs no URL flag: the editor is drawn from it', async () => {
    await openEditor({ url: '/c/demo/pjs/1' })
    expect(sheetEditor()).not.toBeNull()
  })

  it('with an invalid stored sheet, today\'s form opens', async () => {
    await openEditor({ campaign: withSheet({ categories: 'nope' }) })
    expect(sheetEditor()).toBeNull()
    expect(within(dialogEl()).getByRole('button', { name: 'Mecánicas' })).toBeInTheDocument()
  })

  it('with no sheet at all, today\'s form opens', async () => {
    await openEditor({ campaign: {} })
    expect(sheetEditor()).toBeNull()
  })

  it('with a valid sheet, the editor is drawn from it', async () => {
    await openEditor()
    expect(sheetEditor()).not.toBeNull()
    expect(within(dialogEl()).getAllByRole('button').map((b) => b.textContent)).toEqual(expect.arrayContaining(['Identidad', 'General', 'Mecánicas']))
    expect(within(dialogEl()).queryByRole('button', { name: 'Equipo & Rasgos' })).toBeNull()
  })
})

describe('DM saves from the sheet editor', () => {
  it('sends only the edited keys, stamps the sections they belong to and clears the saver\'s own dots', async () => {
    const { layer, spies } = await openEditor()
    tab('General')
    fireEvent.change(within(dialogEl()).getByLabelText('Edad'), { target: { value: '31' } })
    fireEvent.change(within(dialogEl()).getByLabelText('Suerte'), { target: { value: '7' } })
    fireEvent.click(within(dialogEl()).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(spies.saveEntityWithDmNotes).toHaveBeenCalledTimes(1))
    const { table, target, patch } = call(spies)
    expect(table).toBe('pjs')
    expect(target).toMatchObject({ campaignId: 'c1', id: 1, base: { updated_at: '2026-01-02T10:00:00Z' } })
    expect(Object.keys(patch).sort()).toEqual(['edad', 'sections_updated', 'suerte'])
    expect(patch).toMatchObject({ edad: '31', suerte: 7 })
    expect(stamped(patch)).toEqual(['perfil']) // the sheet's own section key, not a fixed D&D one
    expect((patch.sections_updated as Record<string, string>).perfil).toMatch(ISO)
    await waitFor(() => expect(layer.readState.markSeen).toHaveBeenCalledWith('c1', 'pjs', 1, 'perfil', expect.any(Date)))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('never sends jugador, and identity edits stamp "general"', async () => {
    const { spies } = await openEditor()
    fireEvent.change(within(dialogEl()).getByLabelText('Jugador'), { target: { value: 'Otro' } })
    fireEvent.change(within(dialogEl()).getByLabelText('Nombre'), { target: { value: 'Ana B' } })
    fireEvent.click(within(dialogEl()).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(spies.saveEntityWithDmNotes).toHaveBeenCalledTimes(1))
    const { patch } = call(spies)
    expect(Object.keys(patch).sort()).toEqual(['nombre', 'sections_updated'])
    expect(stamped(patch)).toEqual(['general'])
  })

  it('opening and saving without edits writes nothing', async () => {
    const { spies } = await openEditor()
    fireEvent.click(within(dialogEl()).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(spies.saveEntityWithDmNotes).not.toHaveBeenCalled()
  })

  it('accidental zero rows are not persisted: an added blank row alone writes nothing, next to a real one it is dropped', async () => {
    const blank = await openEditor()
    tab('Mecánicas')
    openEspacios()
    fireEvent.click(within(modalEl()).getByRole('button', { name: 'Agregar fila' }))
    listo()
    fireEvent.click(within(dialogEl()).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(blank.spies.saveEntityWithDmNotes).not.toHaveBeenCalled()
  })

  it('a real new row is saved with a new id; the blank rows next to it are dropped; coins are written as integers', async () => {
    const { spies } = await openEditor()
    tab('Mecánicas')
    openEspacios()
    const add = within(modalEl()).getByRole('button', { name: 'Agregar fila' })
    fireEvent.click(add)
    fireEvent.click(add)
    fireEvent.change(within(modalEl()).getAllByLabelText(/^Nivel \(fila \d+ de Espacios\)$/)[2], { target: { value: '5' } }) // displayed last (sorted: empty cells last)
    listo()
    fireEvent.change(within(dialogEl()).getByLabelText('Oro (en mano) (Monedas)'), { target: { value: '9' } })
    fireEvent.click(within(dialogEl()).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(spies.saveEntityWithDmNotes).toHaveBeenCalledTimes(1))
    const { patch } = call(spies)
    expect(Object.keys(patch).sort()).toEqual(['espacios', 'monedas', 'sections_updated'])
    expect(patch.espacios).toEqual([{ id: 1, nivel: 3, total: 3, gastados: 1 }, { id: 3, nivel: 5 }])
    expect(patch.monedas).toEqual({ oro: 9, plata: 0 })
    expect(stamped(patch)).toEqual(['dinero', 'recursos'])
  })

  it('a value the rules reject is not sent: the editor says which field and stays open', async () => {
    const { spies } = await openEditor()
    tab('General')
    fireEvent.change(within(dialogEl()).getByLabelText('Suerte'), { target: { value: '11' } })
    fireEvent.click(within(dialogEl()).getByRole('button', { name: 'Guardar' }))
    expect(await within(dialogEl()).findByRole('alert')).toHaveTextContent('Suerte')
    expect(spies.saveEntityWithDmNotes).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('notes go to the DM table, never the entity row, and are not stamped', async () => {
    const { spies } = await openEditor()
    fireEvent.change(within(dialogEl()).getByLabelText('Notas del DM (privadas 🔒)'), { target: { value: 'nota' } })
    fireEvent.click(within(dialogEl()).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(spies.dmNotesUpsert).toHaveBeenCalledWith('c1', 'pjs', 1, { notas: 'nota' }))
    expect(call(spies).patch).toEqual({})
  })

  it('create: the DM fills the editor; the payload has the identity defaults and a "general" stamp', async () => {
    const { layer, spies } = createFakeLayer()
    renderSection('/c/demo/pjs', { layer, regions: REGIONS, campaign: withSheet() })
    await screen.findByRole('heading', { level: 1, name: 'El Grupo' })
    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo PJ' }))
    await screen.findByRole('dialog')
    expect(sheetEditor()).not.toBeNull()
    fireEvent.change(within(dialogEl()).getByLabelText('Nombre'), { target: { value: 'Nuevo' } })
    fireEvent.click(within(dialogEl()).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(spies.saveEntityWithDmNotes).toHaveBeenCalledTimes(1))
    const { target, patch } = call(spies)
    expect(target).toEqual({ campaignId: 'c1' })
    expect(Object.keys(patch).sort()).toEqual(['estado', 'nombre', 'region', 'sections_updated'])
    expect(patch).toMatchObject({ nombre: 'Nuevo', region: 'magral', estado: 'publicado' })
    expect(stamped(patch)).toEqual(['general'])
  })
})

describe('the player who owns the character', () => {
  const open = () => openEditor({ isDM: false })

  it('edits only what the guard allows; the DM places are read-only and never sent, whatever the form state holds', async () => {
    const { layer, spies } = await open()
    expect(sheetEditor()).not.toBeNull()
    tab('General')
    fireEvent.change(within(dialogEl()).getByLabelText('Edad'), { target: { value: '31' } })
    fireEvent.click(within(dialogEl()).getByLabelText('Inspirado'))
    // hostile: values typed into places the player cannot edit (locked in the UI; the payload must drop them anyway)
    fireEvent.change(within(dialogEl()).getByLabelText('Suerte'), { target: { value: '9' } })
    fireEvent.change(within(dialogEl()).getByLabelText('Secreto'), { target: { value: 'hack' } })
    tab('Mecánicas')
    fireEvent.change(within(dialogEl()).getByLabelText('Fuerza'), { target: { value: '15' } })
    fireEvent.change(within(dialogEl()).getByLabelText('Destreza'), { target: { value: '20' } })
    openEspacios('Ver') // a DM table: the player can only look, whatever the form state holds
    expect(within(modalEl()).getByLabelText('Nivel (fila 1 de Espacios)')).toHaveAttribute('readonly')
    fireEvent.click(within(modalEl()).getByRole('button', { name: 'Cerrar' }))
    fireEvent.change(within(dialogEl()).getByLabelText('Oro (en mano) (Monedas)'), { target: { value: '99' } })
    fireEvent.click(within(dialogEl()).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(spies.saveEntityWithDmNotes).toHaveBeenCalledTimes(1))
    const { target, patch } = call(spies)
    expect(target).toMatchObject({ id: 1 })
    expect(Object.keys(patch).sort()).toEqual(['edad', 'fue', 'inspirado', 'sections_updated'])
    expect(patch).toMatchObject({ edad: '31', fue: 15, inspirado: true })
    // the sections come from the sheet, and only the ones the guard lets a player stamp
    expect(stamped(patch)).toEqual(['perfil', 'stats'])
    await waitFor(() => expect(layer.readState.markSeen).toHaveBeenCalledWith('c1', 'pjs', 1, 'stats', expect.any(Date)))
    expect(spies.dmNotesUpsert).not.toHaveBeenCalled()
    expect(spies.setVisibility).not.toHaveBeenCalled()
    expect(spies.dmNotesGet).not.toHaveBeenCalled()
  })

  it('a player who changes nothing writes nothing; a locked value typed by a hostile caller alone is no write', async () => {
    const { spies } = await open()
    tab('General')
    fireEvent.change(within(dialogEl()).getByLabelText('Suerte'), { target: { value: '9' } })
    fireEvent.click(within(dialogEl()).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(spies.saveEntityWithDmNotes).not.toHaveBeenCalled()
  })

  it('shows nothing a player may not use: no estado, no notes, no delete, jugador read-only', async () => {
    await open()
    expect(within(dialogEl()).queryByRole('combobox', { name: 'Visibilidad' })).toBeNull()
    expect(within(dialogEl()).queryByLabelText('Notas del DM (privadas 🔒)')).toBeNull()
    expect(within(dialogEl()).queryByRole('button', { name: 'Eliminar' })).toBeNull()
    expect(within(dialogEl()).getByLabelText('Jugador')).toHaveAttribute('readonly')
  })

  it('a value the guard would reject (an undeclared option) is not sent', async () => {
    const { spies } = await open()
    tab('General')
    const postura = within(dialogEl()).getByLabelText('Postura')
    // the select only offers declared keys: forge an undeclared one through the DOM like a buggy form would
    const forged = document.createElement('option')
    forged.value = 'bogus'
    forged.textContent = 'Bogus'
    postura.appendChild(forged)
    fireEvent.change(postura, { target: { value: 'bogus' } })
    fireEvent.click(within(dialogEl()).getByRole('button', { name: 'Guardar' }))
    expect(await within(dialogEl()).findByRole('alert')).toHaveTextContent('Postura')
    expect(spies.saveEntityWithDmNotes).not.toHaveBeenCalled()
  })
})
