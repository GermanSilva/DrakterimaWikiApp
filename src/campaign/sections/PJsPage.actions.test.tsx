/** G6b: the character detail (?sheet=1) shows linked collection entries next to the legacy rows; the editor links and edits state. */
import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataError } from '../../data'
import { action, link, withActionSheet } from '../system/actions/actionsFixture'
import { createFakeLayer, type FakeLayerOptions } from '../testing/fakeLayer'
import { entity, renderSection } from '../testing/renderSection'

configure({ asyncUtilTimeout: 5000 })
afterEach(() => vi.restoreAllMocks())

const PJ = entity(1, {
  nombre: 'Eldric', jugador: '', clase: 'Paladín', raza: 'Humano', nivel: 5, region: 'magral', imagen_url: '', sections_updated: {},
  hechizos: [{ id: 1, nombre: 'Luz propia', categoria: 'truco', escuela: 'Heredada' }],
})
const ENTRIES = [
  action(10, { name: 'Rayo', category: 'truco', description: 'Un rayo de luz.', extras: { escuela: 'Evocación' } }),
  action(11, { name: 'Bendecir', category: 'nivel1' }),
  action(12, { name: 'Sentido divino', table_key: 'rasgos', category: 'Clase', description: 'Detectas el mal.' }),
  action(13, { name: 'Secreto de Eldric', table_key: 'rasgos', category: 'Clase', private_to_pj: 1 }),
  action(14, { name: 'Secreto de Mara', table_key: 'rasgos', category: 'Clase', private_to_pj: 2 }),
  action(15, { name: 'Llama', category: 'truco' }), // not linked yet
]
const LINKS = [link(1, 10, { preparado: true }), link(1, 11), link(1, 12, { cargas: 2 })]
const URL = '/c/demo/pjs/1?sheet=1'
const REGIONS = [{ key: 'magral', label: 'Tierras de Magral' }]

function open(options: FakeLayerOptions = {}, { isDM = true, url = URL, characterIds = [] as number[], campaign = withActionSheet() as Record<string, unknown> } = {}) {
  const made = createFakeLayer({ entities: { pjs: [PJ] }, actions: ENTRIES, actionLinks: LINKS, ...options })
  renderSection(url, { layer: made.layer, isDM, campaign, regions: REGIONS, characterIds })
  return made
}
const heading = () => screen.findByRole('heading', { level: 1, name: 'Eldric' })
const section = (key: string) => within(document.getElementById(`pj-section-${key}`) as HTMLElement)

describe('PJ detail: linked entries next to the legacy rows (S36, S16)', () => {
  it('draws legacy rows first and linked entries after, grouped by the declared categories', async () => {
    const { spies } = open()
    await heading()
    await waitFor(() => expect(section('magia').getByRole('button', { name: 'Rayo' })).toBeInTheDocument())
    expect(spies.listLinkedActions).toHaveBeenCalledWith(1)
    const magia = section('magia')
    expect(magia.getAllByRole('button').map((b) => b.textContent).filter((t) => ['Luz propia', 'Rayo', 'Bendecir', 'Llama'].includes(t ?? ''))).toEqual(['Luz propia', 'Rayo', 'Bendecir'])
    expect(magia.getByText('Trucos')).toBeInTheDocument()
    expect(magia.getByText('Nivel 1')).toBeInTheDocument()
    expect(magia.getByRole('button', { name: 'Sentido divino' })).toBeInTheDocument() // the other table too
    expect(magia.queryByRole('button', { name: 'Llama' })).toBeNull() // not linked
  })

  it('opens the entry with its columns, state and description', async () => {
    open()
    await heading()
    fireEvent.click(await section('magia').findByRole('button', { name: 'Rayo' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Evocación')).toBeInTheDocument() // entry column
    expect(within(dialog).getByText('Un rayo de luz.')).toBeInTheDocument()
    expect(within(dialog).getByText('Preparado')).toBeInTheDocument() // state column of this character
    expect(within(dialog).getByText('Trucos')).toBeInTheDocument()
  })

  it('still opens a legacy row exactly as before', async () => {
    open()
    await heading()
    fireEvent.click(await section('magia').findByRole('button', { name: 'Luz propia' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Heredada')).toBeInTheDocument()
    expect(within(dialog).queryByText('Descripción')).toBeNull()
  })

  it('shows the private entry of this character but not the one of another (the layer already filtered what RLS hides)', async () => {
    open({ actionLinks: [link(1, 13)] })
    await heading()
    expect(await section('magia').findByRole('button', { name: 'Secreto de Eldric' })).toBeInTheDocument()
    expect(section('magia').queryByRole('button', { name: 'Secreto de Mara' })).toBeNull()
  })

  it('a player owner sees the same linked entries', async () => {
    open({}, { isDM: false, characterIds: [1] })
    await heading()
    expect(await section('magia').findByRole('button', { name: 'Rayo' })).toBeInTheDocument()
  })

  it('does not ask for links without ?sheet=1, nor when the sheet has no Habilidad table (today detail untouched)', async () => {
    const { spies } = open({}, { url: '/c/demo/pjs/1' })
    await heading()
    expect(spies.listLinkedActions).not.toHaveBeenCalled()
  })

  it('does not ask for links when the sheet has no Habilidad table', async () => {
    const noHab = { categories: [{ key: 'm', label: 'Mecánicas', sections: [{ key: 's', label: 'S', items: [{ kind: 'field', key: 'edad', label: 'Edad', type: 'short', editableBy: 'dm' }], blocks: [] }] }], roles: {} }
    const { spies } = open({}, { campaign: withActionSheet(noHab) })
    await heading()
    expect(document.querySelector('[data-sheet-view]')).not.toBeNull()
    expect(spies.listLinkedActions).not.toHaveBeenCalled()
  })
})

describe('PJ detail: link read failure', () => {
  it('shows the legacy rows and a retryable notice', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const made = createFakeLayer({ entities: { pjs: [PJ] }, actions: ENTRIES, actionLinks: LINKS })
    made.spies.listLinkedActions.mockRejectedValueOnce(new Error('down'))
    renderSection(URL, { layer: made.layer, campaign: withActionSheet(), regions: REGIONS })
    await heading()
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar las acciones del personaje.')
    expect(section('magia').getByRole('button', { name: 'Luz propia' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await section('magia').findByRole('button', { name: 'Rayo' })).toBeInTheDocument()
  })
})

describe('Character editor: link panel (S36, S37)', () => {
  const openEditor = async (options: FakeLayerOptions = {}, flags: { isDM?: boolean; characterIds?: number[] } = {}) => {
    const made = open(options, flags)
    await heading()
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Mecánicas' }))
    return made
  }
  const panel = (table: string) => screen.findByRole('region', { name: `Acciones de ${table}` })

  it('lists the linked entries of each Habilidad table with their state columns', async () => {
    await openEditor()
    const hechizos = await panel('Hechizos')
    expect(within(hechizos).getByText('Rayo')).toBeInTheDocument()
    expect(within(hechizos).queryByText('Sentido divino')).toBeNull() // another table
    expect(within(hechizos).getByLabelText('Preparado (Rayo)')).toBeChecked()
    expect(within(hechizos).getByLabelText('Usos (Rayo)')).toBeInTheDocument()
    expect(within(await panel('Rasgos')).getByText('Sentido divino')).toBeInTheDocument()
  })

  it('the DM links an entry picked by category and name; the panel refetches it and the detail shows it', async () => {
    const { spies } = await openEditor()
    const hechizos = await panel('Hechizos')
    // private entries of another character never appear; the candidates are unlinked entries of this table
    expect(within(hechizos).queryByRole('button', { name: 'Vincular Rayo' })).toBeNull() // already linked
    fireEvent.change(within(hechizos).getByLabelText('Categoría (Hechizos)'), { target: { value: 'nivel1' } })
    expect(within(hechizos).queryByRole('button', { name: 'Vincular Llama' })).toBeNull() // other category
    fireEvent.change(within(hechizos).getByLabelText('Categoría (Hechizos)'), { target: { value: '' } })
    fireEvent.change(within(hechizos).getByLabelText('Buscar acción (Hechizos)'), { target: { value: 'lla' } })
    fireEvent.click(within(hechizos).getByRole('button', { name: 'Vincular Llama' }))
    await waitFor(() => expect(spies.linkAction).toHaveBeenCalledWith('c1', 1, 15))
    expect(await within(await panel('Hechizos')).findByLabelText('Preparado (Llama)')).toBeInTheDocument() // refetched, now linked
    expect(spies.listLinkedActions.mock.calls.length).toBeGreaterThan(1)
  })

  it('offers a private entry only of this character', async () => {
    await openEditor({ actionLinks: [] })
    const rasgos = await panel('Rasgos')
    expect(within(rasgos).getByRole('button', { name: 'Vincular Secreto de Eldric' })).toBeInTheDocument()
    expect(within(rasgos).queryByRole('button', { name: 'Vincular Secreto de Mara' })).toBeNull()
  })

  it('the DM unlinks', async () => {
    const { spies } = await openEditor()
    fireEvent.click(within(await panel('Hechizos')).getByRole('button', { name: 'Desvincular Rayo' }))
    await waitFor(() => expect(spies.unlinkAction).toHaveBeenCalledWith(1, 10))
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Acciones de Hechizos' })).queryByText('Rayo')).toBeNull())
  })

  it('shows the Spanish message when linking fails', async () => {
    const { spies } = await openEditor()
    spies.linkAction.mockRejectedValueOnce(new DataError('validation', 'action_private_to_other_character', { code: '23514' }, 'action_private_to_other_character'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const hechizos = await panel('Hechizos')
    fireEvent.click(within(hechizos).getByRole('button', { name: 'Vincular Llama' }))
    expect(await within(hechizos).findByRole('alert')).toHaveTextContent('Esa acción es privada de otro personaje.')
  })

  it('the DM edits the state of a link: only the changed key travels', async () => {
    const { spies } = await openEditor()
    const hechizos = await panel('Hechizos')
    const usos = within(hechizos).getByLabelText('Usos (Rayo)')
    fireEvent.change(usos, { target: { value: '3' } })
    fireEvent.blur(usos)
    await waitFor(() => expect(spies.updateLinkState).toHaveBeenCalledTimes(1))
    expect(spies.updateLinkState.mock.calls[0].slice(0, 3)).toEqual([1, 10, { usos: 3 }])
    fireEvent.click(within(hechizos).getByLabelText('Preparado (Rayo)'))
    await waitFor(() => expect(spies.updateLinkState).toHaveBeenCalledTimes(2))
    expect(spies.updateLinkState.mock.calls[1].slice(0, 3)).toEqual([1, 10, { preparado: false }])
  })

  it('a player owner edits state only where the table and the column are player-editable, and cannot link', async () => {
    const { spies } = await openEditor({}, { isDM: false, characterIds: [1] })
    const hechizos = await panel('Hechizos')
    expect(within(hechizos).queryByLabelText('Categoría (Hechizos)')).toBeNull()
    expect(within(hechizos).queryByRole('button', { name: /Vincular/ })).toBeNull()
    expect(within(hechizos).queryByRole('button', { name: /Desvincular/ })).toBeNull()
    fireEvent.click(within(hechizos).getByLabelText('Preparado (Rayo)'))
    await waitFor(() => expect(spies.updateLinkState).toHaveBeenCalledTimes(1))
    expect(spies.updateLinkState.mock.calls[0].slice(0, 3)).toEqual([1, 10, { preparado: false }])
    // Rasgos is a DM table: its state is read-only for the player
    const rasgos = await panel('Rasgos')
    const cargas = within(rasgos).getByLabelText('Cargas (Sentido divino)')
    expect(cargas).toHaveAttribute('readonly')
    fireEvent.change(cargas, { target: { value: '9' } })
    fireEvent.blur(cargas)
    expect(spies.updateLinkState).toHaveBeenCalledTimes(1)
  })

  it('a stale version surfaces the conflict message and keeps the panel', async () => {
    const { spies } = await openEditor()
    const { ConflictError } = await import('../../data')
    spies.updateLinkState.mockRejectedValueOnce(new ConflictError())
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const hechizos = await panel('Hechizos')
    fireEvent.click(within(hechizos).getByLabelText('Preparado (Rayo)'))
    expect(await within(hechizos).findByRole('alert')).toHaveTextContent('Alguien más modificó este registro.')
  })

  it('a campaign without a Habilidad table opens today sheet editor with no panel and no collection request', async () => {
    const noHab = { categories: [{ key: 'm', label: 'Mecánicas', sections: [{ key: 's', label: 'S', items: [{ kind: 'field', key: 'edad', label: 'Edad', type: 'short', editableBy: 'dm' }], blocks: [] }] }], roles: {} }
    const made = open({}, { campaign: withActionSheet(noHab) })
    await heading()
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Mecánicas' }))
    expect(screen.queryByRole('region', { name: /Acciones de/ })).toBeNull()
    expect(made.spies.actionsList).not.toHaveBeenCalled()
  })
})
