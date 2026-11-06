import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConflictError } from '../../data'
import { action, link, withActionSheet } from '../system/actions/actionsFixture'
import { BENDICION, FUNCTION_SHEET, FUNCTION_SHEET_RAW, IMPONER_MANOS, LANZAR_HECHIZO } from '../system/actions/function/fixture'
import { validateActionFunction } from '../system/actions/function/validate'
import { createFakeLayer } from '../testing/fakeLayer'
import { entity, renderSection } from '../testing/renderSection'
import { retryPolicy } from './useSessionLayout'

configure({ asyncUtilTimeout: 5000 })

const DEFAULT_DELAYS = retryPolicy.delays
beforeEach(() => { retryPolicy.delays = [5, 5, 5] })
afterEach(() => {
  retryPolicy.delays = DEFAULT_DELAYS
  vi.restoreAllMocks()
})

const PATH = '/c/demo/sesion-en-vivo'
const fn = (raw: unknown) => {
  const checked = validateActionFunction(raw, FUNCTION_SHEET, 'rasgos')
  if (!checked.ok) throw new Error(JSON.stringify(checked.errors))
  return checked.fn
}
const slots = (spent1: number, spent3 = 1) => [
  { nivel: 1, total: 2, gastados: spent1 },
  { nivel: 3, total: 1, gastados: spent3 },
]
const pj = (id: number, over: Record<string, unknown> = {}) =>
  entity(id, { nombre: `PJ ${id}`, jugador: '', clase: '', raza: '', region: 'otro', nivel: 1, sections_updated: {}, ...over })
const ELDRIC = pj(1, { nombre: 'Eldric', hp: 30, hp_current: 20, oro: 0, espacios_conjuro: slots(0), updated_at: 'p1' })
const MAISIE = pj(2, { nombre: 'Maisie', hp: 10, hp_current: 10, updated_at: 'p2' })

const ENTRIES = [
  action(1, { table_key: 'rasgos', category: 'Clase', name: 'Lanzar hechizo', function: fn(LANZAR_HECHIZO) }),
  action(2, { table_key: 'rasgos', category: 'Clase', name: 'Imponer manos', function: fn(IMPONER_MANOS) }),
  action(3, { table_key: 'rasgos', category: 'Clase', name: 'Sin función' }),
  action(4, { table_key: 'rasgos', category: 'Especie', name: 'Bendición', function: fn(BENDICION) }),
  action(5, { table_key: 'rasgos', category: 'Especie', name: 'Rota', function: { steps: [{ kind: 'effect', target: { type: 'field', key: 'nope' }, op: 'add', value: '1' }] } }),
]
const LINKS = [link(1, 1), link(1, 2, { reserva: 5 }), link(1, 3), link(1, 4), link(1, 5), link(2, 4)]
const CARDS = [{ id: 21, tipo: 'actions' }]

interface OpenOptions {
  campaign?: Record<string, unknown>
  isDM?: boolean
  cards?: unknown[]
  pjs?: ReturnType<typeof pj>[]
}
async function open({ campaign = withActionSheet(FUNCTION_SHEET_RAW), isDM = true, cards = CARDS, pjs = [ELDRIC, MAISIE] }: OpenOptions = {}) {
  const fake = createFakeLayer({
    entities: { pjs, homebrew_rules: [] },
    persistEntities: true,
    actions: ENTRIES,
    actionLinks: LINKS,
    config: { session_screen: { value: { cards }, updated_at: 'v1' } },
  })
  renderSection(PATH, { layer: fake.layer, isDM, campaign })
  if (isDM) await screen.findAllByRole('button', { name: '+ Agregar pestaña' })
  return fake
}
const expand = async (name: RegExp = /Eldric/) => fireEvent.click(await screen.findByRole('button', { name }))
const dialog = (name: string) => screen.findByRole('dialog', { name })
const set = (control: HTMLElement, value: string) => fireEvent.change(control, { target: { value } })
const writes = (spies: ReturnType<typeof createFakeLayer>['spies']) => spies.saveEntityWithDmNotes.mock.calls

describe('session screen: action buttons (G6c-2, S22)', () => {
  it('the DM sees a Usar button on each linked action with a function, per character, and none on the others', async () => {
    await open()
    await expand()
    expect(await screen.findByRole('button', { name: 'Usar Lanzar hechizo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Usar Imponer manos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Usar Bendición' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Usar Sin función' })).toBeNull()
    await expand(/Maisie/)
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Usar Bendición' })).toHaveLength(2))
    expect(screen.getAllByRole('button', { name: 'Usar Bendición' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: /^Usar / })).toHaveLength(5)
  })

  it('a character with no linked function says so', async () => {
    const fake = createFakeLayer({ entities: { pjs: [ELDRIC], homebrew_rules: [] }, persistEntities: true, actions: ENTRIES, actionLinks: [], config: { session_screen: { value: { cards: CARDS }, updated_at: 'v1' } } })
    renderSection(PATH, { layer: fake.layer, campaign: withActionSheet(FUNCTION_SHEET_RAW) })
    await expand()
    expect(await screen.findByText('Sin acciones con función.')).toBeInTheDocument()
  })

  it('asks the declared parameter, previews before -> after, and writes only the touched key with the stored updated_at, no stamp', async () => {
    const { spies } = await open()
    await expand()
    fireEvent.click(await screen.findByRole('button', { name: 'Usar Lanzar hechizo' }))
    const box = within(await dialog('Usar Lanzar hechizo'))
    expect(box.getByRole('button', { name: 'Aplicar' })).toBeDisabled()
    set(box.getByLabelText('Nivel del espacio'), '1')
    expect(box.getByRole('list', { name: 'Cambios' })).toHaveTextContent('Gastar espacio: 0 → 1')
    fireEvent.click(box.getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(writes(spies)).toHaveLength(1))
    const [table, target, patch] = writes(spies)[0]
    expect(table).toBe('pjs')
    expect(target).toMatchObject({ id: 1, base: { updated_at: 'p1' } })
    expect(patch).toEqual({ espacios_conjuro: slots(1) })
    expect(Object.keys(patch as object)).not.toContain('sections_updated')
    expect(spies.updateLinkState).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('an action that spends its own state writes the link state with the stored link version, and the character key', async () => {
    const { spies } = await open()
    await expand()
    fireEvent.click(await screen.findByRole('button', { name: 'Usar Imponer manos' }))
    const box = within(await dialog('Usar Imponer manos'))
    set(box.getByLabelText('Puntos'), '3')
    expect(box.getByRole('list', { name: 'Cambios' })).toHaveTextContent('Gastar reserva: 5 → 2')
    expect(box.getByRole('list', { name: 'Cambios' })).toHaveTextContent('Curar: 20 → 23')
    fireEvent.click(box.getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(spies.updateLinkState).toHaveBeenCalledTimes(1))
    expect(writes(spies)[0][2]).toEqual({ hp_current: 23 })
    expect(spies.updateLinkState).toHaveBeenCalledWith(1, 2, { reserva: 2 }, { base: { updated_at: 'l1' } })
  })

  it('a checkbox parameter and an options parameter are asked in step order', async () => {
    const { spies } = await open()
    await expand()
    fireEvent.click(await screen.findByRole('button', { name: 'Usar Bendición' }))
    const box = within(await dialog('Usar Bendición'))
    expect(box.getByRole('list', { name: 'Cambios' })).toHaveTextContent('oro: 0 → 0')
    fireEvent.click(box.getByLabelText('Con bendición'))
    expect(box.getByRole('list', { name: 'Cambios' })).toHaveTextContent('oro: 0 → 2')
    fireEvent.click(box.getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(writes(spies)).toHaveLength(1))
    expect(writes(spies)[0][2]).toEqual({ oro: 2 })
  })

  it('an exhausted resource warns and needs an explicit Forzar; nothing is written before it', async () => {
    const { spies } = await open()
    await expand()
    fireEvent.click(await screen.findByRole('button', { name: 'Usar Lanzar hechizo' }))
    const box = within(await dialog('Usar Lanzar hechizo'))
    set(box.getByLabelText('Nivel del espacio'), '3')
    expect(box.getByRole('list', { name: 'Avisos' })).toHaveTextContent('supera el máximo (2 de 1)')
    expect(box.queryByRole('button', { name: 'Aplicar' })).toBeNull()
    expect(writes(spies)).toHaveLength(0)
    fireEvent.click(box.getByRole('button', { name: 'Forzar' }))
    await waitFor(() => expect(writes(spies)).toHaveLength(1))
    expect(writes(spies)[0][2]).toEqual({ espacios_conjuro: slots(0, 2) })
  })

  it('a parameter out of range blocks the action: no Aplicar, no Forzar, no write', async () => {
    const { spies } = await open()
    await expand()
    fireEvent.click(await screen.findByRole('button', { name: 'Usar Lanzar hechizo' }))
    const box = within(await dialog('Usar Lanzar hechizo'))
    set(box.getByLabelText('Nivel del espacio'), '12')
    expect(box.getByRole('list', { name: 'Avisos' })).toHaveTextContent('debe ser menor o igual a 9')
    expect(box.getByRole('button', { name: 'Aplicar' })).toBeDisabled()
    expect(box.queryByRole('button', { name: 'Forzar' })).toBeNull()
    fireEvent.click(box.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(writes(spies)).toHaveLength(0)
  })

  it('a stored function the sheet no longer accepts cannot run and says why', async () => {
    const { spies } = await open()
    await expand()
    fireEvent.click(await screen.findByRole('button', { name: 'Usar Rota' }))
    const box = within(await dialog('Usar Rota'))
    expect(box.getByRole('alert')).toHaveTextContent('La función de esta acción no es válida')
    expect(box.queryByRole('button', { name: 'Aplicar' })).toBeNull()
    expect(writes(spies)).toHaveLength(0)
  })

  it('runs on the CURRENT character, not on the copy the screen loaded', async () => {
    const { spies, layer } = await open()
    await expand()
    // someone else spent a slot after the screen loaded (the fake has no realtime: the screen keeps its copy)
    await layer.saveEntityWithDmNotes('pjs', { campaignId: 'c1', id: 1 }, { espacios_conjuro: slots(1) })
    fireEvent.click(await screen.findByRole('button', { name: 'Usar Lanzar hechizo' }))
    const box = within(await dialog('Usar Lanzar hechizo'))
    set(box.getByLabelText('Nivel del espacio'), '1')
    expect(box.getByRole('list', { name: 'Cambios' })).toHaveTextContent('Gastar espacio: 1 → 2')
    expect(spies.entityGet).toHaveBeenCalledWith('pjs', 1)
  })

  it('a conflict warns, and Sobrescribir re-reads, re-runs on the fresh data and previews again before writing', async () => {
    const { spies, layer } = await open()
    await expand()
    fireEvent.click(await screen.findByRole('button', { name: 'Usar Lanzar hechizo' }))
    const box = within(await dialog('Usar Lanzar hechizo'))
    set(box.getByLabelText('Nivel del espacio'), '1')
    // another DM spends a slot of level 1 while the dialog is open
    await layer.saveEntityWithDmNotes('pjs', { campaignId: 'c1', id: 1 }, { espacios_conjuro: slots(1) })
    spies.saveEntityWithDmNotes.mockClear()
    fireEvent.click(box.getByRole('button', { name: 'Aplicar' }))
    expect(await box.findByRole('alert')).toHaveTextContent('Alguien más modificó este personaje')
    expect(box.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
    expect(writes(spies)).toHaveLength(1) // the refused attempt
    fireEvent.click(box.getByRole('button', { name: 'Sobrescribir' }))
    await waitFor(() => expect(box.getByRole('list', { name: 'Cambios' })).toHaveTextContent('Gastar espacio: 1 → 2'))
    expect(writes(spies)).toHaveLength(1) // re-preview first, no write yet
    fireEvent.click(box.getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(writes(spies)).toHaveLength(2))
    expect(writes(spies)[1][1]).toMatchObject({ id: 1, base: { updated_at: 'w1' } })
    expect(writes(spies)[1][2]).toEqual({ espacios_conjuro: slots(2) })
  })

  it('Cancelar after a conflict closes without writing anything else', async () => {
    const { spies } = await open()
    await expand()
    spies.saveEntityWithDmNotes.mockRejectedValueOnce(new ConflictError())
    fireEvent.click(await screen.findByRole('button', { name: 'Usar Bendición' }))
    const box = within(await dialog('Usar Bendición'))
    fireEvent.click(box.getByRole('button', { name: 'Aplicar' }))
    expect(await box.findByRole('alert')).toHaveTextContent('Alguien más modificó este personaje')
    fireEvent.click(box.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(writes(spies)).toHaveLength(1)
    expect(spies.updateLinkState).not.toHaveBeenCalled()
  })

  it('writes with a D&D-keyed field never stamp sections_updated (S22), unlike the screen own saves', async () => {
    const sheet = {
      categories: [
        {
          key: 'c', label: 'C',
          sections: [{
            key: 's', label: 'S', blocks: [],
            items: [
              { kind: 'field', key: 'stat_hp_current', label: 'HP', type: 'number', editableBy: 'dm' },
              { kind: 'table', type: 'habilidad', key: 'rasgos', label: 'Rasgos', editableBy: 'dm', columns: [{ key: 'nombre', label: 'Nombre', type: 'short', editableBy: 'dm' }, { key: 'categoria', label: 'Categoria', type: 'short', editableBy: 'dm' }] },
            ],
          }],
        },
      ],
      roles: {},
    }
    const heal = { steps: [{ kind: 'effect', target: { type: 'field', key: 'stat_hp_current' }, op: 'add', value: '4' }] }
    const fake = createFakeLayer({
      entities: { pjs: [pj(1, { nombre: 'Eldric', stat_hp_current: 5, updated_at: 'p1' })], homebrew_rules: [] },
      persistEntities: true,
      actions: [action(1, { table_key: 'rasgos', category: 'Clase', name: 'Curar', function: heal })],
      actionLinks: [link(1, 1)],
      config: { session_screen: { value: { cards: CARDS }, updated_at: 'v1' } },
    })
    renderSection(PATH, { layer: fake.layer, campaign: withActionSheet(sheet) })
    await expand()
    fireEvent.click(await screen.findByRole('button', { name: 'Usar Curar' }))
    fireEvent.click(within(await dialog('Usar Curar')).getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(writes(fake.spies)).toHaveLength(1))
    expect(writes(fake.spies)[0][2]).toEqual({ stat_hp_current: 9 })
  })
})

describe('session screen: who gets the action buttons', () => {
  const tabs = () => screen.getAllByRole('button', { name: '+ Agregar pestaña' })[0]

  it('a player never reaches the screen, so never the buttons', async () => {
    await open({ isDM: false })
    expect(await screen.findByRole('heading', { name: 'Sección no encontrada' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Usar / })).toBeNull()
  })

  it('without a stored sheet the Acciones card is neither offered nor drawn (legacy screen unchanged)', async () => {
    await open({ campaign: {} })
    expect(screen.queryByText('Acciones')).toBeNull()
    expect(document.querySelector('[data-card-id="21"]')).toBeNull()
    fireEvent.click(tabs())
    expect(screen.queryByRole('button', { name: 'Acciones' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Stats' })).toBeInTheDocument()
  })

  it('a sheet without a Habilidad table does not offer the card either', async () => {
    const libre = { categories: [{ key: 'c', label: 'C', sections: [{ key: 's', label: 'S', items: [{ kind: 'field', key: 'hp', label: 'HP', type: 'number', editableBy: 'dm' }], blocks: [] }] }], roles: {} }
    await open({ campaign: withActionSheet(libre), cards: [] })
    fireEvent.click(tabs())
    expect(screen.queryByRole('button', { name: 'Acciones' })).toBeNull()
  })

  it('with a Habilidad table the picker offers the Acciones card', async () => {
    await open({ cards: [] })
    fireEvent.click(tabs())
    expect(screen.getByRole('button', { name: 'Acciones' })).toBeInTheDocument()
  })
})

describe('session screen: undo list (G6c-2, S22, S32)', () => {
  async function apply(name: string, fill: (box: ReturnType<typeof within>) => void = () => undefined) {
    fireEvent.click(await screen.findByRole('button', { name: `Usar ${name}` }))
    const box = within(await dialog(`Usar ${name}`))
    fill(box)
    fireEvent.click(box.getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  }
  const spend = (level: string) => (box: ReturnType<typeof within>) => set(box.getByLabelText('Nivel del espacio'), level)
  const undoButton = (action: string, who = 'Eldric') => screen.findByRole('button', { name: `Deshacer ${action} de ${who}` })

  it('lists the applied actions of this screen, newest first, and nothing before the first one', async () => {
    await open()
    await expand()
    await screen.findByRole('button', { name: 'Usar Bendición' })
    expect(screen.queryByRole('list', { name: 'Acciones aplicadas' })).toBeNull()
    await apply('Lanzar hechizo', spend('1'))
    await apply('Bendición')
    const list = within(await screen.findByRole('list', { name: 'Acciones aplicadas' }))
    expect(list.getAllByRole('listitem').map((li) => li.getAttribute('data-name'))).toEqual(['Eldric · Bendición', 'Eldric · Lanzar hechizo'])
  })

  it('undoes an action: subtracts what it applied on the current data, writes only the touched key, no stamp, and leaves the list', async () => {
    const { spies } = await open()
    await expand()
    await apply('Lanzar hechizo', spend('1'))
    spies.saveEntityWithDmNotes.mockClear()
    fireEvent.click(await undoButton('Lanzar hechizo'))
    const box = within(await dialog('Deshacer Lanzar hechizo'))
    await waitFor(() => expect(box.getByRole('button', { name: 'Deshacer' })).toBeEnabled())
    expect(box.queryByRole('list', { name: 'Avisos' })).toBeNull()
    fireEvent.click(box.getByRole('button', { name: 'Deshacer' }))
    await waitFor(() => expect(writes(spies)).toHaveLength(1))
    expect(writes(spies)[0][1]).toMatchObject({ id: 1, base: { updated_at: 'w1' } })
    expect(writes(spies)[0][2]).toEqual({ espacios_conjuro: slots(0) })
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Acciones aplicadas' })).toBeNull())
  })

  it('undoes the link state and the character with the current versions', async () => {
    const { spies } = await open()
    await expand()
    await apply('Imponer manos', (box) => set(box.getByLabelText('Puntos'), '3'))
    expect(spies.updateLinkState).toHaveBeenCalledWith(1, 2, { reserva: 2 }, { base: { updated_at: 'l1' } })
    fireEvent.click(await undoButton('Imponer manos'))
    const box = within(await dialog('Deshacer Imponer manos'))
    await waitFor(() => expect(box.getByRole('button', { name: 'Deshacer' })).toBeEnabled())
    fireEvent.click(box.getByRole('button', { name: 'Deshacer' }))
    await waitFor(() => expect(spies.updateLinkState).toHaveBeenCalledTimes(2))
    expect(spies.updateLinkState).toHaveBeenLastCalledWith(1, 2, { reserva: 5 }, { base: { updated_at: 'l1+' } })
    expect(writes(spies).at(-1)?.[2]).toEqual({ hp_current: 20 })
  })

  it('warns when the value changed since the action and needs a confirmation before writing', async () => {
    const { spies, layer } = await open()
    await expand()
    await apply('Lanzar hechizo', spend('1'))
    await layer.saveEntityWithDmNotes('pjs', { campaignId: 'c1', id: 1 }, { espacios_conjuro: slots(5) }) // someone edited the slots
    spies.saveEntityWithDmNotes.mockClear()
    fireEvent.click(await undoButton('Lanzar hechizo'))
    const box = within(await dialog('Deshacer Lanzar hechizo'))
    expect(await box.findByRole('list', { name: 'Avisos' })).toHaveTextContent('cambió después de la acción (se esperaba 1, ahora es 5)')
    expect(box.queryByRole('button', { name: 'Deshacer' })).toBeNull()
    expect(writes(spies)).toHaveLength(0)
    fireEvent.click(box.getByRole('button', { name: 'Deshacer igual' }))
    await waitFor(() => expect(writes(spies)).toHaveLength(1))
    expect(writes(spies)[0][2]).toEqual({ espacios_conjuro: slots(4) })
  })

  it('Cancelar leaves the action in the list and writes nothing', async () => {
    const { spies } = await open()
    await expand()
    await apply('Bendición')
    spies.saveEntityWithDmNotes.mockClear()
    fireEvent.click(await undoButton('Bendición'))
    fireEvent.click(within(await dialog('Deshacer Bendición')).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('list', { name: 'Acciones aplicadas' })).toBeInTheDocument()
    expect(writes(spies)).toHaveLength(0)
  })

  it('a conflict while undoing warns, and Sobrescribir plans again on the fresh data', async () => {
    const { spies, layer } = await open()
    await expand()
    await apply('Lanzar hechizo', spend('1'))
    fireEvent.click(await undoButton('Lanzar hechizo'))
    const box = within(await dialog('Deshacer Lanzar hechizo'))
    await waitFor(() => expect(box.getByRole('button', { name: 'Deshacer' })).toBeEnabled())
    await layer.saveEntityWithDmNotes('pjs', { campaignId: 'c1', id: 1 }, { espacios_conjuro: slots(2) }) // edited while the dialog is open
    spies.saveEntityWithDmNotes.mockClear()
    fireEvent.click(box.getByRole('button', { name: 'Deshacer' }))
    expect(await box.findByRole('alert')).toHaveTextContent('Alguien más modificó este personaje')
    fireEvent.click(box.getByRole('button', { name: 'Sobrescribir' }))
    expect(await box.findByRole('list', { name: 'Avisos' })).toHaveTextContent('ahora es 2')
    expect(writes(spies)).toHaveLength(1) // only the refused attempt
    fireEvent.click(box.getByRole('button', { name: 'Deshacer igual' }))
    await waitFor(() => expect(writes(spies)).toHaveLength(2))
    expect(writes(spies)[1][2]).toEqual({ espacios_conjuro: slots(1) })
  })

  it('the history belongs to the open screen: a new screen starts empty', async () => {
    await open()
    await expand()
    await apply('Bendición')
    expect(await screen.findByRole('list', { name: 'Acciones aplicadas' })).toBeInTheDocument()
    document.body.innerHTML = ''
    await open()
    await expand()
    await screen.findByRole('button', { name: 'Usar Bendición' })
    expect(screen.queryByRole('list', { name: 'Acciones aplicadas' })).toBeNull()
  })
})

describe('session screen: partial failures (G6c-2 fix, S22)', () => {
  const pause = () => new Promise((resolve) => setTimeout(resolve, 60))

  it('the character saved but the link state did not: the dialog leaves the ready state for good and the heal is never applied twice', async () => {
    const { spies } = await open()
    await expand()
    spies.updateLinkState.mockRejectedValueOnce(new ConflictError())
    fireEvent.click(await screen.findByRole('button', { name: 'Usar Imponer manos' }))
    const box = within(await dialog('Usar Imponer manos'))
    set(box.getByLabelText('Puntos'), '3')
    fireEvent.click(box.getByRole('button', { name: 'Aplicar' }))
    expect(await box.findByRole('alert')).toHaveTextContent('Se guardó el personaje, pero no se pudo guardar el estado de la acción. Revisá la ficha antes de repetir.')
    expect(await screen.findByRole('list', { name: 'Acciones aplicadas' })).toBeInTheDocument() // the history update re-renders everything
    await pause()
    expect(box.queryByRole('button', { name: 'Aplicar' })).toBeNull()
    expect(box.queryByRole('button', { name: 'Forzar' })).toBeNull()
    expect(box.queryByRole('button', { name: 'Sobrescribir' })).toBeNull()
    expect(box.queryByRole('list', { name: 'Cambios' })).toBeNull()
    expect(box.getByRole('button', { name: 'Cerrar' })).toBeEnabled()
    expect(writes(spies)).toHaveLength(1)
    expect(writes(spies)[0][2]).toEqual({ hp_current: 23 })
    fireEvent.click(box.getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(writes(spies)).toHaveLength(1)
  })

  it('a partial undo (character undone, link state not) never undoes the character part twice: the item keeps only the link part', async () => {
    const { spies } = await open()
    await expand()
    fireEvent.click(await screen.findByRole('button', { name: 'Usar Imponer manos' }))
    const run = within(await dialog('Usar Imponer manos'))
    set(run.getByLabelText('Puntos'), '3')
    fireEvent.click(run.getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(await screen.findByRole('button', { name: 'Deshacer Imponer manos de Eldric' }))
    let box = within(await dialog('Deshacer Imponer manos'))
    await waitFor(() => expect(box.getByRole('button', { name: 'Deshacer' })).toBeEnabled())
    spies.updateLinkState.mockRejectedValueOnce(new ConflictError())
    spies.saveEntityWithDmNotes.mockClear()
    fireEvent.click(box.getByRole('button', { name: 'Deshacer' }))
    expect(await box.findByRole('alert')).toHaveTextContent('Se deshizo en el personaje, pero no se pudo deshacer el estado de la acción')
    await pause()
    expect(box.queryByRole('button', { name: 'Deshacer' })).toBeNull()
    expect(box.queryByRole('button', { name: 'Deshacer igual' })).toBeNull()
    expect(writes(spies)).toHaveLength(1)
    expect(writes(spies)[0][2]).toEqual({ hp_current: 20 })
    fireEvent.click(box.getByRole('button', { name: 'Cerrar' }))
    // the item stays with the link part only: no misleading changed-since, no second character write
    fireEvent.click(await screen.findByRole('button', { name: 'Deshacer Imponer manos de Eldric' }))
    box = within(await dialog('Deshacer Imponer manos'))
    await waitFor(() => expect(box.getByRole('button', { name: 'Deshacer' })).toBeEnabled())
    expect(box.queryByRole('list', { name: 'Avisos' })).toBeNull()
    expect(box.getByRole('list', { name: 'Cambios' })).toHaveTextContent('Gastar reserva')
    expect(box.getByRole('list', { name: 'Cambios' })).not.toHaveTextContent('Curar')
    fireEvent.click(box.getByRole('button', { name: 'Deshacer' }))
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Acciones aplicadas' })).toBeNull())
    expect(writes(spies)).toHaveLength(1)
    expect(spies.updateLinkState).toHaveBeenLastCalledWith(1, 2, { reserva: 5 }, { base: { updated_at: 'l1+' } })
  })

  it('an item whose character cannot be read any more can be removed from the list', async () => {
    const { spies } = await open()
    await expand()
    fireEvent.click(await screen.findByRole('button', { name: 'Usar Bendición' }))
    fireEvent.click(within(await dialog('Usar Bendición')).getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    spies.entityGet.mockResolvedValue(null) // the character was deleted
    spies.saveEntityWithDmNotes.mockClear()
    fireEvent.click(await screen.findByRole('button', { name: 'Deshacer Bendición de Eldric' }))
    const box = within(await dialog('Deshacer Bendición'))
    expect(await box.findByRole('alert')).toHaveTextContent('No se pudo leer el personaje')
    fireEvent.click(box.getByRole('button', { name: 'Quitar de la lista' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('list', { name: 'Acciones aplicadas' })).toBeNull()
    expect(writes(spies)).toHaveLength(0)
  })
})

describe('session screen: undo that cannot proceed (G6c-2 round 2)', () => {
  async function applyHands() {
    fireEvent.click(await screen.findByRole('button', { name: 'Usar Imponer manos' }))
    const run = within(await dialog('Usar Imponer manos'))
    set(run.getByLabelText('Puntos'), '3')
    fireEvent.click(run.getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  }

  it('an item with only link-state effects whose action was unlinked can be removed from the list', async () => {
    const { spies } = await open()
    await expand()
    await applyHands()
    fireEvent.click(await screen.findByRole('button', { name: 'Deshacer Imponer manos de Eldric' }))
    let box = within(await dialog('Deshacer Imponer manos'))
    await waitFor(() => expect(box.getByRole('button', { name: 'Deshacer' })).toBeEnabled())
    spies.updateLinkState.mockRejectedValueOnce(new ConflictError())
    fireEvent.click(box.getByRole('button', { name: 'Deshacer' }))
    expect(await box.findByRole('alert')).toHaveTextContent('Se deshizo en el personaje')
    fireEvent.click(box.getByRole('button', { name: 'Cerrar' }))
    spies.listLinkedActions.mockResolvedValue([]) // the action was unlinked meanwhile
    spies.saveEntityWithDmNotes.mockClear()
    fireEvent.click(await screen.findByRole('button', { name: 'Deshacer Imponer manos de Eldric' }))
    box = within(await dialog('Deshacer Imponer manos'))
    expect(await box.findByText('No hay nada que deshacer en la ficha actual.')).toBeInTheDocument()
    expect(box.getByRole('button', { name: 'Deshacer' })).toBeDisabled()
    fireEvent.click(box.getByRole('button', { name: 'Quitar de la lista' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('list', { name: 'Acciones aplicadas' })).toBeNull()
    expect(writes(spies)).toHaveLength(0)
  })

  it('a target stored as text blocks the undo: no confirmation, nothing written, the item stays whole', async () => {
    const { spies, layer } = await open()
    await expand()
    await applyHands()
    await layer.saveEntityWithDmNotes('pjs', { campaignId: 'c1', id: 1 }, { hp_current: '23' }) // hand-edited
    spies.saveEntityWithDmNotes.mockClear()
    spies.updateLinkState.mockClear()
    fireEvent.click(await screen.findByRole('button', { name: 'Deshacer Imponer manos de Eldric' }))
    const box = within(await dialog('Deshacer Imponer manos'))
    expect(await box.findByRole('list', { name: 'Avisos' })).toHaveTextContent('no es un número')
    expect(box.queryByRole('button', { name: 'Deshacer' })).toBeNull()
    expect(box.queryByRole('button', { name: 'Deshacer igual' })).toBeNull()
    expect(box.queryByRole('button', { name: 'Quitar de la lista' })).toBeNull()
    fireEvent.click(box.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByRole('button', { name: 'Deshacer Imponer manos de Eldric' })).toBeInTheDocument()
    expect(writes(spies)).toHaveLength(0)
    expect(spies.updateLinkState).not.toHaveBeenCalled()
  })
})
