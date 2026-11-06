import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataError } from '../../data'
import { action, withActionSheet } from '../system/actions/actionsFixture'
import { createFakeLayer, type FakeLayerOptions } from '../testing/fakeLayer'
import { entity, renderSection } from '../testing/renderSection'
import { dnd5eProfile } from '../system/systemProfile'

configure({ asyncUtilTimeout: 5000 })
afterEach(() => vi.restoreAllMocks())

const PJS = [entity(1, { nombre: 'Eldric', jugador: '', region: 'magral' }), entity(2, { nombre: 'Mara', jugador: '', region: 'magral' })]
const ENTRIES = [
  action(1, { name: 'Luz', category: 'truco', extras: { escuela: 'Evocación' } }),
  action(2, { name: 'Bendecir', category: 'nivel1', description: 'Bendice a tus aliados.' }),
  action(3, { name: 'Rayo', category: 'truco' }),
  action(4, { name: 'Misterio', category: 'viejo' }), // a category the table no longer declares
  action(5, { name: 'Sentido divino', table_key: 'rasgos', category: 'Clase' }),
  action(6, { name: 'Visión en la oscuridad', table_key: 'rasgos', category: 'Especie' }),
  action(7, { name: 'Secreto de Eldric', table_key: 'rasgos', category: 'Clase', private_to_pj: 1 }),
]

function open(options: FakeLayerOptions = {}, { isDM = true, campaign = withActionSheet() as Record<string, unknown>, path = '/c/demo/acciones', before }: { isDM?: boolean; campaign?: Record<string, unknown>; path?: string; before?: (made: ReturnType<typeof createFakeLayer>) => void } = {}) {
  const made = createFakeLayer({ entities: { pjs: PJS }, actions: ENTRIES, ...options })
  before?.(made)
  renderSection(path, { layer: made.layer, isDM, campaign })
  return made
}
const nav = async () => within(await screen.findByRole('navigation', { name: 'Secciones de la campaña' }))
const names = (container: HTMLElement) => within(container).getAllByRole('listitem').map((li) => li.getAttribute('data-name'))

const ALL_LINKS = ['Panel', 'Sesión en vivo', 'Ajustes', 'Notas', 'Sesiones', 'Calendario', 'Jugadores (PJ)', 'PNJs', 'Mapas', 'Lugares', 'Facciones', 'Lore', 'Homerules', 'Ítems', 'Juegos']
const PLAYER_LINKS = ALL_LINKS.filter((l) => l !== 'Sesión en vivo' && l !== 'Ajustes')

describe('Acciones: visibility', () => {
  it('the DM of a campaign with a sheet that has a Habilidad table gets the nav entry and the page', async () => {
    open()
    expect((await nav()).getByRole('link', { name: /Acciones/ })).toHaveAttribute('href', '/c/demo/acciones')
    expect(await screen.findByRole('heading', { level: 1, name: 'Acciones' })).toBeInTheDocument()
  })

  it('a player gets neither the nav entry nor the page (404 in layout)', async () => {
    open({}, { isDM: false })
    expect(await screen.findByRole('heading', { name: 'Sección no encontrada' })).toBeInTheDocument()
    expect((await nav()).queryByRole('link', { name: /Acciones/ })).toBeNull()
  })

  it('without a stored sheet the nav is exactly today list and the route is a 404, for the DM and for a player', async () => {
    open({}, { campaign: {} })
    expect(await screen.findByRole('heading', { name: 'Sección no encontrada' })).toBeInTheDocument()
    expect((await nav()).getAllByRole('link').map((a) => a.textContent)).toEqual(ALL_LINKS)
  })

  it('a player without a sheet sees exactly today nav', async () => {
    open({}, { isDM: false, campaign: {}, path: '/c/demo/notas' })
    expect((await nav()).getAllByRole('link').map((a) => a.textContent)).toEqual(PLAYER_LINKS)
  })

  it('a sheet without Habilidad tables does not add the section', async () => {
    const libre = { categories: [{ key: 'c', label: 'C', sections: [{ key: 's', label: 'S', items: [{ kind: 'table', type: 'libre', key: 'inv', label: 'Inv', editableBy: 'dm', columns: [{ key: 'a', label: 'A', type: 'short', editableBy: 'dm' }] }], blocks: [] }] }], roles: {} }
    open({}, { campaign: withActionSheet(libre) })
    expect(await screen.findByRole('heading', { name: 'Sección no encontrada' })).toBeInTheDocument()
    expect((await nav()).queryByRole('link', { name: /Acciones/ })).toBeNull()
  })

  it('an invalid stored sheet does not add the section', async () => {
    open({}, { campaign: withActionSheet({ categories: 'nope' }) })
    expect(await screen.findByRole('heading', { name: 'Sección no encontrada' })).toBeInTheDocument()
    expect((await nav()).getAllByRole('link').map((a) => a.textContent)).toEqual(ALL_LINKS)
  })

  it('the system document alone (no sheet) keeps the nav untouched', async () => {
    open({}, { campaign: { system_profile: dnd5eProfile() as unknown as Record<string, unknown> }, path: '/c/demo/notas' })
    expect((await nav()).getAllByRole('link').map((a) => a.textContent)).toEqual(ALL_LINKS)
  })
})

describe('Acciones: catalogue', () => {
  it('groups by Habilidad table and category in the declared order with the declared labels, Otras last', async () => {
    open()
    const hechizos = await screen.findByRole('region', { name: 'Hechizos' })
    expect(within(hechizos).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Trucos', 'Nivel 1', 'Otras'])
    const trucos = within(hechizos).getByRole('region', { name: 'Trucos' })
    expect(names(trucos)).toEqual(['Luz', 'Rayo'])
    expect(names(within(hechizos).getByRole('region', { name: 'Otras' }))).toEqual(['Misterio'])
  })

  it('a table without declared categories groups by free text', async () => {
    open()
    const rasgos = await screen.findByRole('region', { name: 'Rasgos' })
    expect(within(rasgos).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Clase', 'Especie'])
  })

  it('marks an entry private to a character with that character name', async () => {
    open()
    const rasgos = await screen.findByRole('region', { name: 'Rasgos' })
    expect(within(rasgos).getByText('Privada de Eldric')).toBeInTheDocument()
  })

  it('searches by name', async () => {
    open()
    await screen.findByRole('region', { name: 'Hechizos' })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar por nombre' }), { target: { value: 'ben' } })
    expect(screen.getByText('Bendecir')).toBeInTheDocument()
    expect(screen.queryByText('Luz')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Rasgos' })).toBeNull() // no match, no group
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar por nombre' }), { target: { value: 'zzz' } })
    expect(screen.getByText('Ninguna acción coincide con la búsqueda.')).toBeInTheDocument()
  })

  it('shows an empty state for a campaign without entries', async () => {
    open({ actions: [] })
    expect(await screen.findByText('Todavía no hay acciones en el catálogo.')).toBeInTheDocument()
  })

  it('shows a retryable error when the collection cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    open({}, { before: (made) => made.spies.actionsList.mockRejectedValueOnce(new Error('down')) })
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar las acciones.')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Luz')).toBeInTheDocument()
  })
})

describe('Acciones: create', () => {
  const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

  it('sends the declared category (the first one unless changed), the extras of the entry-scope columns and no state columns', async () => {
    const { spies } = open()
    fireEvent.click(await screen.findByRole('button', { name: 'Nueva acción' }))
    const form = screen.getByRole('form', { name: 'Acción' })
    expect(within(form).getByLabelText('Categoría')).toHaveValue('truco') // always one when the table declares them
    expect(within(form).queryByLabelText('Preparado')).toBeNull() // character-scope: not an entry field
    fill('Nombre', '  Bola de fuego ')
    fill('Descripción', 'Explota.')
    fill('Escuela', 'Evocación')
    fill('Alcance', '30')
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(spies.createAction).toHaveBeenCalledTimes(1))
    expect(spies.createAction).toHaveBeenCalledWith('c1', { table_key: 'hechizos', category: 'truco', name: 'Bola de fuego', description: 'Explota.', extras: { escuela: 'Evocación', alcance: 30 }, private_to_pj: null })
    expect(await screen.findByText('Bola de fuego')).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Acción' })).toBeNull()
  })

  it('offers only the declared categories of the chosen table and switches to free text for a table without them', async () => {
    const { spies } = open()
    fireEvent.click(await screen.findByRole('button', { name: 'Nueva acción' }))
    const category = screen.getByLabelText('Categoría') as HTMLSelectElement
    expect([...category.options].map((o) => [o.value, o.textContent])).toEqual([['truco', 'Trucos'], ['nivel1', 'Nivel 1']])
    fill('Tabla', 'rasgos')
    const free = screen.getByLabelText('Categoría')
    expect(free.tagName).toBe('INPUT')
    expect(screen.queryByLabelText('Escuela')).toBeNull()
    fill('Categoría', 'Trasfondo')
    fill('Nombre', 'Marinero')
    fill('Fuente', 'PHB')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(spies.createAction).toHaveBeenCalledTimes(1))
    expect(spies.createAction).toHaveBeenCalledWith('c1', { table_key: 'rasgos', category: 'Trasfondo', name: 'Marinero', description: '', extras: { fuente: 'PHB' }, private_to_pj: null })
  })

  it('can make the entry private to one character', async () => {
    const { spies } = open()
    fireEvent.click(await screen.findByRole('button', { name: 'Nueva acción' }))
    const select = screen.getByLabelText('Privada de un personaje') as HTMLSelectElement
    expect([...select.options].map((o) => o.textContent)).toEqual(['Compartida con todos', 'Eldric', 'Mara'])
    fill('Nombre', 'Truco propio')
    fill('Privada de un personaje', '2')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(spies.createAction).toHaveBeenCalledTimes(1))
    expect(spies.createAction.mock.calls[0][1]).toMatchObject({ name: 'Truco propio', private_to_pj: 2 })
  })

  it('refuses an empty name without calling the data layer', async () => {
    const { spies } = open()
    fireEvent.click(await screen.findByRole('button', { name: 'Nueva acción' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('El nombre es obligatorio.')
    expect(spies.createAction).not.toHaveBeenCalled()
  })

  it('shows the Spanish message of the server reason and keeps the form open', async () => {
    const { spies } = open()
    spies.createAction.mockRejectedValueOnce(new DataError('validation', 'invalid_action_category', { code: '23514' }, 'invalid_action_category'))
    fireEvent.click(await screen.findByRole('button', { name: 'Nueva acción' }))
    fill('Nombre', 'X')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La categoría no es una de las que define la tabla de la hoja.')
    expect(screen.getByRole('form', { name: 'Acción' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveValue('X')
  })

  it('cancel closes the form without writing', async () => {
    const { spies } = open()
    fireEvent.click(await screen.findByRole('button', { name: 'Nueva acción' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('form', { name: 'Acción' })).toBeNull()
    expect(spies.createAction).not.toHaveBeenCalled()
  })
})

describe('Acciones: edit and delete', () => {
  it('edits an entry prefilled, with the table locked, and sends the new values', async () => {
    const { spies } = open()
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Luz' }))
    const form = screen.getByRole('form', { name: 'Acción' })
    expect(within(form).getByLabelText('Nombre')).toHaveValue('Luz')
    expect(within(form).getByLabelText('Escuela')).toHaveValue('Evocación')
    expect(within(form).getByLabelText('Tabla')).toBeDisabled()
    fireEvent.change(within(form).getByLabelText('Nombre'), { target: { value: 'Luz mayor' } })
    fireEvent.change(within(form).getByLabelText('Categoría'), { target: { value: 'nivel1' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(spies.updateAction).toHaveBeenCalledTimes(1))
    expect(spies.updateAction).toHaveBeenCalledWith(1, { category: 'nivel1', name: 'Luz mayor', description: '', extras: { escuela: 'Evocación' }, private_to_pj: null })
    expect(await screen.findByText('Luz mayor')).toBeInTheDocument()
  })

  it('an entry of a category the table no longer declares must be moved to a declared one before saving', async () => {
    open()
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Misterio' }))
    expect(screen.getByLabelText('Categoría')).toHaveValue('truco')
  })

  it('deletes after confirming; the entry leaves the list', async () => {
    const { spies } = open()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar Rayo' }))
    await waitFor(() => expect(spies.removeAction).toHaveBeenCalledWith(3))
    await waitFor(() => expect(screen.queryByText('Rayo')).toBeNull())
  })

  it('does not delete when the confirmation is declined', async () => {
    const { spies } = open()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar Rayo' }))
    expect(spies.removeAction).not.toHaveBeenCalled()
    expect(screen.getByText('Rayo')).toBeInTheDocument()
  })

  it('shows the message when a delete fails', async () => {
    const { spies } = open()
    spies.removeAction.mockRejectedValueOnce(new DataError('permission', 'nope', { code: '42501' }))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar Rayo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No tenés permiso para hacer esto.')
    expect(screen.getByText('Rayo')).toBeInTheDocument()
  })
})
