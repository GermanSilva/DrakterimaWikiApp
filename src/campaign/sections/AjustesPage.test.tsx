import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataError, type DataErrorReason, type GameLog, type GamePot, type Member } from '../../data'
import { here } from '../../app/testing/renderApp'
import { createFakeLayer } from '../testing/fakeLayer'
import { entity, renderSection } from '../testing/renderSection'
import { downloadJson } from './ajustes/exportCampaign'

configure({ asyncUtilTimeout: 5000 })

vi.mock('./ajustes/exportCampaign', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./ajustes/exportCampaign')>()),
  downloadJson: vi.fn(),
}))

// 12:00 UTC on 2026-10-09. Only Date is faked: timers and promises keep running.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-09T12:00:00Z'))
  vi.mocked(downloadJson).mockClear()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const POT: GamePot = { campaign_id: 'c1', cp: 5, sp: 0, ep: 0, gp: 12, pp: 0, updated_at: '' }
const PJS = [entity(10, { nombre: 'Eldric', owner_id: 'u-ana' }), entity(11, { nombre: 'Mara', owner_id: 'u-bob' })]
const LOTERIA = { loteria: { value: { commonMinRoll: 15, commonPrize: { gp: 2 }, specialPrize: { pp: 1, gp: 5 } }, visibility: 'members' as const } }
const log = (id: number, over: Partial<GameLog> = {}): GameLog => ({
  id, campaign_id: 'c1', actor_type: 'player', character_id: 10, game: 'loteria', play_date: '2026-10-08', roll: 12,
  prize: {}, prize_target: 'player', created_at: '2026-10-08T10:00:00Z', ...over,
})
const member = (user_id: string, name: string | null, role: 'dm' | 'player' = 'player'): Member => ({
  campaign_id: 'c1', user_id, role, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  profile: name === null ? null : { id: user_id, display_name: name, avatar_url: null },
})
const reason = (r: DataErrorReason) => new DataError(r === 'dm_only' ? 'permission' : 'business', r, undefined, r)

type Made = ReturnType<typeof createFakeLayer>
type Options = NonNullable<Parameters<typeof createFakeLayer>[0]> & { isDM?: boolean; before?: (made: Made) => void }
function setup({ isDM = true, before, ...layerOptions }: Options = {}) {
  const made = createFakeLayer({ entities: { pjs: PJS }, pot: POT, config: LOTERIA as never, ...layerOptions })
  const games = made.layer.games as unknown as { assignPotToCharacter: ReturnType<typeof vi.fn>; removeLog: ReturnType<typeof vi.fn> }
  before?.(made)
  const view = renderSection('/c/demo/ajustes', { layer: made.layer, isDM })
  return { ...made, games, ...view }
}
const sectionOf = (name: string) => screen.findByRole('region', { name })
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } })

describe('Ajustes: access', () => {
  it('is a 404 for a player and requests none of the DM data', async () => {
    const { spies, games } = setup({ isDM: false })
    expect(await screen.findByRole('heading', { level: 1, name: 'Sección no encontrada' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Ajustes' })).not.toBeInTheDocument()
    expect(spies.configGet).not.toHaveBeenCalledWith('c1', 'loteria')
    expect(spies.presenceList).not.toHaveBeenCalled()
    expect(spies.gameLogsList).not.toHaveBeenCalled()
    expect(spies.membersList).not.toHaveBeenCalled()
    expect(games.removeLog).not.toHaveBeenCalled()
  })

  it('shows the DM the stacked sections', async () => {
    setup()
    expect(await screen.findByRole('heading', { level: 1, name: 'Ajustes' })).toBeInTheDocument()
    for (const title of ['Pantalla de sesión', 'Juegos: configuración de la lotería', 'Juegos: pozo acumulado', 'Juegos: registro de tiradas', 'Jugadores', 'Exportar']) {
      expect(await sectionOf(title)).toBeInTheDocument()
    }
  })

  it('links to the session screen', async () => {
    const { router } = setup({ config: { ...LOTERIA, session_screen: { value: { cards: [{ id: 1, tipo: 'notes', text: '' }] }, visibility: 'dm' } } as never })
    const session = await sectionOf('Pantalla de sesión')
    fireEvent.click(within(session).getByRole('button', { name: 'Abrir' }))
    await waitFor(() => expect(here(router)).toBe('/c/demo/sesion-en-vivo'))
  })
})

describe('Ajustes: lottery configuration', () => {
  const form = async () => within(await screen.findByRole('form', { name: 'Configuración de la lotería' }))
  const save = (f: Awaited<ReturnType<typeof form>>) => fireEvent.click(f.getByRole('button', { name: 'Guardar configuración' }))

  it('shows the stored values', async () => {
    setup()
    const f = await form()
    expect(f.getByLabelText(/Tirada mínima/)).toHaveValue(15)
    const common = within(f.getByRole('group', { name: 'Premio común' }))
    expect(common.getByLabelText('oro')).toHaveValue(2)
    expect(common.getByLabelText('platino')).toHaveValue(0)
    expect(within(f.getByRole('group', { name: /Premio especial/ })).getByLabelText('platino')).toHaveValue(1)
  })

  it('saves the edited values guarded by the version it read, and keeps working from the version it wrote', async () => {
    const { spies } = setup()
    const f = await form()
    type(f.getByLabelText(/Tirada mínima/), '12')
    type(within(f.getByRole('group', { name: 'Premio común' })).getByLabelText('plata'), '4')
    save(f)
    expect(await screen.findByText('Configuración guardada.')).toBeInTheDocument()
    expect(spies.configPatch).toHaveBeenCalledWith(
      'c1',
      'loteria',
      {
        commonMinRoll: 12,
        commonPrize: { cp: 0, sp: 4, ep: 0, gp: 2, pp: 0 },
        specialPrize: { cp: 0, sp: 0, ep: 0, gp: 5, pp: 1 },
      },
      'members',
      'v1',
    )
    save(await form())
    await waitFor(() => expect(spies.configPatch).toHaveBeenCalledTimes(2))
    expect(spies.configPatch.mock.calls[1][4]).toBe('v2')
  })

  it('creates the document the first time (no stored row: base is null) from the defaults', async () => {
    const { spies } = setup({ config: {} as never })
    const f = await form()
    expect(f.getByLabelText(/Tirada mínima/)).toHaveValue(17)
    save(f)
    await screen.findByText('Configuración guardada.')
    expect(spies.configPatch.mock.calls[0][4]).toBeNull()
  })

  it.each(['0', '20', '', '7.5'])('refuses a minimum roll of %j without calling the server', async (value) => {
    const { spies } = setup()
    const f = await form()
    type(f.getByLabelText(/Tirada mínima/), value)
    save(f)
    expect(await screen.findByRole('alert')).toHaveTextContent('entre 1 y 19')
    expect(spies.configPatch).not.toHaveBeenCalled()
  })

  it.each(['-1', '2.5'])('refuses a prize amount of %s', async (value) => {
    const { spies } = setup()
    const f = await form()
    type(within(f.getByRole('group', { name: 'Premio común' })).getByLabelText('oro'), value)
    save(f)
    expect(await screen.findByRole('alert')).toHaveTextContent('números enteros de 0 o más')
    expect(spies.configPatch).not.toHaveBeenCalled()
  })

  it('on a concurrent change it explains, re-reads and shows the other writer values without overwriting them', async () => {
    const { spies } = setup()
    const f = await form()
    spies.configRows.set('loteria', { value: { commonMinRoll: 9, commonPrize: { gp: 1 }, specialPrize: { gp: 1 } }, updated_at: 'v7', visibility: 'members' })
    type(f.getByLabelText(/Tirada mínima/), '12')
    save(f)
    expect(await screen.findByRole('alert')).toHaveTextContent('cambió mientras la editabas')
    await waitFor(() => expect(screen.getByLabelText(/Tirada mínima/)).toHaveValue(9))
    expect(spies.configRows.get('loteria')?.value.commonMinRoll).toBe(9) // the other writer's value is untouched
    expect(spies.configGet.mock.calls.filter(([, key]) => key === 'loteria').length).toBeGreaterThanOrEqual(2)
  })

  it('reports a permission failure clearly', async () => {
    const { spies } = setup()
    spies.configPatch.mockRejectedValueOnce(reason('dm_only'))
    const f = await form()
    save(f)
    expect(await screen.findByRole('alert')).toHaveTextContent('Solo el DM puede hacer esto.')
  })

  it('offers no form when the configuration cannot be read (saving would overwrite blindly), and retries', async () => {
    const { spies } = setup({ before: ({ spies: s }) => { s.configGet.mockRejectedValueOnce(new Error('down')) } })
    const region = await sectionOf('Juegos: configuración de la lotería')
    expect(await within(region).findByRole('alert')).toHaveTextContent('No pudimos cargar la configuración')
    expect(within(region).queryByRole('form')).not.toBeInTheDocument()
    fireEvent.click(within(region).getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('form', { name: 'Configuración de la lotería' })).toBeInTheDocument()
    expect(spies.configPatch).not.toHaveBeenCalled()
  })
})

describe('Ajustes: pot and transfer', () => {
  const form = async () => within(await screen.findByRole('form', { name: 'Transferir del pozo a un personaje' }))
  const give = (f: Awaited<ReturnType<typeof form>>, coin: string, amount: string) => type(f.getByLabelText(coin), amount)

  it('shows the pot', async () => {
    setup()
    expect(await screen.findByText('12 oro, 5 bronce')).toBeInTheDocument()
  })

  it('shows an empty pot as such', async () => {
    setup({ pot: null })
    expect(await screen.findByText('Vacío')).toBeInTheDocument()
  })

  it('transfers coins to the chosen character and clears the amounts', async () => {
    const { games, spies } = setup()
    const f = await form()
    fireEvent.change(f.getByLabelText('Transferir al personaje'), { target: { value: '10' } })
    give(f, 'oro', '3')
    give(f, 'bronce', '2')
    fireEvent.click(f.getByRole('button', { name: 'Transferir del pozo' }))
    expect(await screen.findByText('Se transfirieron 3 oro, 2 bronce a Eldric.')).toBeInTheDocument()
    expect(games.assignPotToCharacter).toHaveBeenCalledWith('c1', 10, { cp: 2, sp: 0, ep: 0, gp: 3, pp: 0 })
    expect(f.getByLabelText('oro')).toHaveValue(0)
    await waitFor(() => expect(spies.potGet.mock.calls.length).toBeGreaterThanOrEqual(2)) // the pot is re-read
  })

  it('maps an insufficient pot to a clear message and re-reads the pot', async () => {
    const { games, spies } = setup()
    games.assignPotToCharacter.mockRejectedValueOnce(reason('insufficient_pot'))
    const f = await form()
    fireEvent.change(f.getByLabelText('Transferir al personaje'), { target: { value: '11' } })
    give(f, 'platino', '9')
    fireEvent.click(f.getByRole('button', { name: 'Transferir del pozo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('El pozo no tiene monedas suficientes.')
    await waitFor(() => expect(spies.potGet.mock.calls.length).toBeGreaterThanOrEqual(2))
    expect(f.getByLabelText('platino')).toHaveValue(9) // the DM can adjust and retry
  })

  it.each([
    ['dm_only' as const, 'Solo el DM puede hacer esto.'],
    ['character_not_found' as const, 'No encontramos ese personaje.'],
  ])('maps %s', async (code, message) => {
    const { games } = setup()
    games.assignPotToCharacter.mockRejectedValueOnce(reason(code))
    const f = await form()
    fireEvent.change(f.getByLabelText('Transferir al personaje'), { target: { value: '10' } })
    give(f, 'oro', '1')
    fireEvent.click(f.getByRole('button', { name: 'Transferir del pozo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
  })

  it('needs a character and an amount before calling the server', async () => {
    const { games } = setup()
    const f = await form()
    fireEvent.click(f.getByRole('button', { name: 'Transferir del pozo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Elegí el personaje')
    fireEvent.change(f.getByLabelText('Transferir al personaje'), { target: { value: '10' } })
    fireEvent.click(f.getByRole('button', { name: 'Transferir del pozo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ingresá una cantidad')
    give(f, 'oro', '-2')
    fireEvent.click(f.getByRole('button', { name: 'Transferir del pozo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('números enteros')
    expect(games.assignPotToCharacter).not.toHaveBeenCalled()
  })

  it('ignores a second submit while the first is in flight', async () => {
    let finish: () => void = () => undefined
    const { games } = setup()
    games.assignPotToCharacter.mockImplementation(() => new Promise((resolve) => { finish = () => resolve(POT) }))
    const f = await form()
    fireEvent.change(f.getByLabelText('Transferir al personaje'), { target: { value: '10' } })
    give(f, 'oro', '1')
    fireEvent.submit(screen.getByRole('form', { name: 'Transferir del pozo a un personaje' }))
    fireEvent.submit(screen.getByRole('form', { name: 'Transferir del pozo a un personaje' }))
    expect(games.assignPotToCharacter).toHaveBeenCalledTimes(1)
    finish()
    await screen.findByText(/Se transfirieron/)
  })
})

describe('Ajustes: game log', () => {
  const LOGS = [
    log(3, { actor_type: 'dm', character_id: null, roll: 20, prize: { gp: 5 }, prize_target: 'pot' }),
    log(2, { character_id: 11, roll: 17, prize: { cp: 3 } }),
    log(1, { character_id: 10 }),
  ]
  const logs = async () => within(await sectionOf('Juegos: registro de tiradas'))
  const rowsOf = (l: Awaited<ReturnType<typeof logs>>) => l.getAllByRole('row').slice(1)

  it('lists every play with its actor, roll, prize and destination', async () => {
    setup({ gameLogs: LOGS })
    const l = await logs()
    await l.findByText('Eldric')
    const rows = rowsOf(l)
    expect(rows).toHaveLength(3)
    expect(within(rows[0]).getByText('DM')).toBeInTheDocument()
    expect(within(rows[0]).getByText('5 oro')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Pozo')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Mara')).toBeInTheDocument()
    expect(within(rows[2]).getByText('—')).toBeInTheDocument() // no prize
  })

  it('shows an empty state', async () => {
    setup({ gameLogs: [] })
    expect(await (await logs()).findByText('Sin tiradas aún.')).toBeInTheDocument()
  })

  it('select-all selects and clears every row and drives the delete button', async () => {
    setup({ gameLogs: LOGS })
    const l = await logs()
    const all = await l.findByRole('checkbox', { name: 'Seleccionar todas las tiradas' })
    fireEvent.click(all)
    expect(l.getByText('3 seleccionadas')).toBeInTheDocument()
    expect(l.getByRole('button', { name: 'Eliminar seleccionadas (3)' })).toBeInTheDocument()
    fireEvent.click(all)
    expect(l.queryByRole('button', { name: /Eliminar seleccionadas/ })).not.toBeInTheDocument()
  })

  it('asks for confirmation and a visible close button keeps everything', async () => {
    const { games } = setup({ gameLogs: LOGS })
    const l = await logs()
    fireEvent.click(await l.findByRole('checkbox', { name: 'Seleccionar todas las tiradas' }))
    fireEvent.click(l.getByRole('button', { name: 'Eliminar seleccionadas (3)' }))
    const dialog = await screen.findByRole('dialog', { name: 'Eliminar tiradas' })
    expect(within(dialog).getByText(/Vas a eliminar 3 tiradas/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(l.getByRole('button', { name: 'Eliminar seleccionadas (3)' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(games.removeLog).not.toHaveBeenCalled()
  })

  it('sends one request per selected row, shows progress, and removes the rows', async () => {
    const { games, spies } = setup({ gameLogs: LOGS })
    const pending: (() => void)[] = []
    games.removeLog.mockImplementation(() => new Promise<void>((resolve) => { pending.push(resolve) }))
    const l = await logs()
    fireEvent.click(await l.findByRole('checkbox', { name: /Seleccionar la tirada de Mara/ }))
    fireEvent.click(l.getByRole('checkbox', { name: /Seleccionar la tirada de Eldric/ }))
    fireEvent.click(l.getByRole('button', { name: 'Eliminar seleccionadas (2)' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Eliminar 2 tiradas' }))
    expect(await l.findByText('Eliminando 0 de 2…')).toBeInTheDocument()
    await waitFor(() => expect(pending).toHaveLength(1)) // sequential: the second waits for the first
    pending[0]()
    expect(await l.findByText('Eliminando 1 de 2…')).toBeInTheDocument()
    await waitFor(() => expect(pending).toHaveLength(2))
    spies.gameLogsList.mockResolvedValue([LOGS[0]]) // what the re-read returns afterwards
    pending[1]()
    expect(await l.findByText('Se eliminaron 2 tiradas.')).toBeInTheDocument()
    expect(games.removeLog.mock.calls.map(([id]) => id).sort()).toEqual([1, 2])
    await waitFor(() => expect(rowsOf(l)).toHaveLength(1))
  })

  it('reports a partial failure, keeps the failed rows selected and removes the others', async () => {
    const { games, spies } = setup({ gameLogs: LOGS })
    games.removeLog.mockImplementation(async (id: number) => {
      if (id === 2) throw new DataError('permission', 'denied', { code: '42501' })
    })
    const l = await logs()
    fireEvent.click(await l.findByRole('checkbox', { name: 'Seleccionar todas las tiradas' }))
    fireEvent.click(l.getByRole('button', { name: 'Eliminar seleccionadas (3)' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Eliminar 3 tiradas' }))
    const alert = await l.findByRole('alert')
    expect(alert).toHaveTextContent('Se eliminaron 2 de 3 tiradas. No se pudieron eliminar 1: No tenés permiso para hacer esto.')
    expect(games.removeLog).toHaveBeenCalledTimes(3) // a failure does not stop the rest
    await waitFor(() => expect(rowsOf(l)).toHaveLength(1))
    expect(l.getByRole('checkbox', { name: /Seleccionar la tirada de Mara/ })).toBeChecked()
    expect(l.getByText('1 seleccionada')).toBeInTheDocument()
    expect(spies.gameLogsList.mock.calls.length).toBeGreaterThanOrEqual(2) // re-read after the run
  })

  it('counts a row that is already gone as removed', async () => {
    const { games } = setup({ gameLogs: LOGS })
    games.removeLog.mockImplementation(async (id: number) => {
      if (id === 1) throw new DataError('not_found', 'game_logs/1: not found')
    })
    const l = await logs()
    fireEvent.click(await l.findByRole('checkbox', { name: /Seleccionar la tirada de Eldric/ }))
    fireEvent.click(l.getByRole('button', { name: 'Eliminar seleccionadas (1)' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Eliminar 1 tirada' }))
    expect(await l.findByText('Se eliminó 1 tirada.')).toBeInTheDocument()
  })

  it('offers a retry when the log cannot be read', async () => {
    setup({ before: ({ spies }) => { spies.gameLogsList.mockRejectedValueOnce(new Error('down')) } })
    const l = await logs()
    expect(await l.findByRole('alert')).toHaveTextContent('No pudimos cargar el registro de tiradas.')
    fireEvent.click(l.getByRole('button', { name: 'Reintentar' }))
    expect(await l.findByText('Sin tiradas aún.')).toBeInTheDocument()
  })
})

describe('Ajustes: players and last connection', () => {
  const MEMBERS = [member('u-bob', 'Bob'), member('u-dm', 'Ana DM', 'dm'), member('u-ana', 'Ana'), member('u-x', null)]
  const PRESENCE = [
    { campaign_id: 'c1', user_id: 'u-ana', last_seen_at: '2026-10-09T11:55:00Z' },
    { campaign_id: 'c1', user_id: 'u-dm', last_seen_at: '2026-10-09T11:59:50Z' },
  ]
  const players = async () => within(await sectionOf('Jugadores'))
  const rowOf = (p: Awaited<ReturnType<typeof players>>, name: RegExp) => within(p.getByRole('row', { name }))

  it('lists members (DM first) with their character and last connection, relative with an absolute tooltip', async () => {
    setup({ members: MEMBERS, presence: PRESENCE })
    const p = await players()
    await p.findByText('Bob')
    const names = p.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent)
    expect(names).toEqual(['Ana DM', 'Bob', 'Ana', 'Sin nombre'])

    const ana = rowOf(p, /^Ana Jugador/)
    expect(ana.getByText('Eldric')).toBeInTheDocument()
    const seen = ana.getByText('hace 5 minutos')
    expect(seen.tagName).toBe('TIME')
    expect(seen).toHaveAttribute('datetime', '2026-10-09T11:55:00Z')
    expect(seen.getAttribute('title')).toMatch(/2026/)
    expect(rowOf(p, /^Ana DM/).getByText('hace instantes')).toBeInTheDocument()
  })

  it('shows "Nunca" for a member who never connected', async () => {
    setup({ members: MEMBERS, presence: PRESENCE })
    const p = await players()
    await p.findByText('Bob')
    expect(rowOf(p, /^Bob/).getByText('Nunca')).toBeInTheDocument()
    expect(rowOf(p, /^Bob/).getByText('Mara')).toBeInTheDocument()
  })

  it('tells the DM that the last connection is visible to them', async () => {
    setup({ members: MEMBERS, presence: PRESENCE })
    expect(await (await players()).findByText(/Como DM podés ver cuándo se conectó/)).toBeInTheDocument()
  })

  it('still lists the members, without times, when the connections cannot be read', async () => {
    const { spies } = setup({ members: MEMBERS, before: ({ spies: s }) => { s.presenceList.mockRejectedValue(new Error('down')) } })
    const p = await players()
    expect(await p.findByRole('alert')).toHaveTextContent('No pudimos cargar las últimas conexiones.')
    expect(p.getByText('Bob')).toBeInTheDocument()
    expect(p.queryByText('Nunca')).not.toBeInTheDocument() // unknown is not "never"
    expect(spies.presenceList).toHaveBeenCalled()
  })

  it('re-reads on demand', async () => {
    const { spies } = setup({ members: MEMBERS, presence: PRESENCE })
    const p = await players()
    await p.findByText('Bob')
    const before = spies.presenceList.mock.calls.length
    fireEvent.click(p.getByRole('button', { name: 'Actualizar' }))
    await waitFor(() => expect(spies.presenceList.mock.calls.length).toBeGreaterThan(before))
  })
})

describe('Ajustes: export', () => {
  const exportButton = async () => within(await sectionOf('Exportar')).getByRole('button', { name: 'Exportar' })
  const exported = () => vi.mocked(downloadJson).mock.calls[0] as [string, Record<string, unknown>]

  it('downloads <slug>-<date>.json with the campaign data and no accounts or invite codes', async () => {
    const lore = entity(5, { titulo: 'La caída', estado: 'secreto' })
    setup({
      entities: { pjs: PJS, lore: [lore] },
      dmNotes: { 'lore:5': { notas: 'nota privada', secreto: 'el rey miente', ganchos: '' } },
      visibility: { 5: [10] },
      gameLogs: [log(1)],
      playerNotes: [{ campaign_id: 'c1', user_id: 'u-ana', entity_type: 'lore', entity_id: 5, character_id: 10, text: 'sospecho', created_at: '', updated_at: '' }],
      config: { ...LOTERIA, session_screen: { value: { cards: [] }, visibility: 'dm' } } as never,
      members: [member('u-ana', 'Ana')],
    })
    fireEvent.click(await exportButton())
    expect(await screen.findByText('Se descargó demo-2026-10-09.json.')).toBeInTheDocument()

    const [filename, data] = exported()
    expect(filename).toBe('demo-2026-10-09.json')
    expect(data).toMatchObject({ format: 'drakterima-campaign-export', version: 1, exportedAt: '2026-10-09T12:00:00.000Z' })
    expect(data.campaign).toMatchObject({ id: 'c1', slug: 'demo', name: 'Demo' })
    const entities = data.entities as Record<string, { id: number }[]>
    expect(entities.pjs.map((e) => e.id)).toEqual([10, 11])
    expect(entities.lore.map((e) => e.id)).toEqual([5])
    expect(Object.keys(entities)).toEqual(expect.arrayContaining(['sesiones', 'pnjs', 'lugares', 'facciones', 'items', 'mapas', 'map_points', 'homebrew_rules']))
    expect(data.dmNotes).toEqual([expect.objectContaining({ entity_type: 'lore', entity_id: 5, secreto: 'el rey miente' })])
    expect(data.visibility).toEqual({ lore: { 5: [10] } })
    expect(data.playerNotes).toEqual([expect.objectContaining({ text: 'sospecho' })])
    expect(data.config).toMatchObject({ loteria: { value: LOTERIA.loteria.value }, session_screen: { value: { cards: [] } } })
    expect(data.games).toMatchObject({ pot: { gp: 12 }, logs: [{ id: 1 }] })
    // nothing about accounts, membership or invitations
    expect(Object.keys(data).sort()).toEqual(['campaign', 'config', 'dmNotes', 'entities', 'exportedAt', 'format', 'games', 'playerNotes', 'version', 'visibility'])
    expect(JSON.stringify(data)).not.toMatch(/u-ana"?,"role|invite|email/)
  })

  it('exports a campaign without a configuration or pot', async () => {
    setup({ config: {} as never, pot: null })
    fireEvent.click(await exportButton())
    await screen.findByText(/Se descargó/)
    expect(exported()[1]).toMatchObject({ config: { loteria: null, session_screen: null }, games: { pot: null, logs: [] } })
  })

  it('fails as a whole, naming the part, when something cannot be read: no file is produced', async () => {
    setup({
      before: ({ spies }) => {
        spies.entityList.mockImplementation(async (table: string) => {
          if (table === 'lore') throw new Error('down')
          return []
        })
      },
    })
    fireEvent.click(await exportButton())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No se pudo exportar la campaña. Falló la lectura de: lore.')
    expect(alert).toHaveTextContent('No se descargó ningún archivo')
    expect(downloadJson).not.toHaveBeenCalled()
    expect(await exportButton()).toBeEnabled() // can be retried
  })

  it('fails when the download itself fails', async () => {
    setup()
    vi.mocked(downloadJson).mockImplementationOnce(() => {
      throw new Error('blocked')
    })
    fireEvent.click(await exportButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo exportar la campaña.')
  })

  it('does not offer to import', async () => {
    setup()
    await sectionOf('Exportar')
    expect(screen.queryByText(/importar/i)).not.toBeInTheDocument()
  })
})
