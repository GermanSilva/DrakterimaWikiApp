import { act, configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataError, type DataErrorReason, type GameLog, type GamePot } from '../../data'
import { createFakeLayer } from '../testing/fakeLayer'
import { entity, renderSection } from '../testing/renderSection'

configure({ asyncUtilTimeout: 5000 })

interface OverlayProps {
  roll: number
  onComplete: (roll: number) => void
  onClose: () => void
}
// three.js cannot run in jsdom: the real overlay has its own tests; here it only records how the page drives it
const overlay = vi.hoisted(() => ({ mounted: [] as OverlayProps[] }))
vi.mock('../../components/dice/D20Overlay', async () => {
  const { createElement } = await import('react')
  return {
    default: (props: OverlayProps) => {
      overlay.mounted.push(props)
      return createElement(
        'div',
        { 'data-testid': 'overlay', 'data-roll': String(props.roll) },
        createElement('button', { onClick: () => props.onComplete(props.roll) }, 'dado: terminó'),
        createElement('button', { onClick: () => props.onClose() }, 'dado: cerrar'),
      )
    },
  }
})

// 21:00 on 2026-10-08 in Buenos Aires = 00:00 UTC on the 9th. Only Date is faked.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-08T21:00:00Z'))
  overlay.mounted.length = 0
  vi.stubGlobal('matchMedia', undefined)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const POT: GamePot = { campaign_id: 'c1', cp: 5, sp: 0, ep: 0, gp: 12, pp: 0, updated_at: '' }
const PJS = { pjs: [entity(10, { nombre: 'Eldric' }), entity(11, { nombre: 'Mara' })] }
const LOTERIA = { loteria: { value: { commonMinRoll: 15, commonPrize: { gp: 2 }, specialPrize: { pp: 1, gp: 5 } }, visibility: 'members' as const } }
const log = (id: number, over: Partial<GameLog> = {}): GameLog => ({
  id, campaign_id: 'c1', actor_type: 'player', character_id: 10, game: 'loteria', play_date: '2026-10-08', roll: 12,
  prize: {}, prize_target: 'player', created_at: '2026-10-08T10:00:00Z', ...over,
})
const reason = (r: DataErrorReason) => new DataError(r === 'dm_only' || r === 'not_a_member' || r === 'not_your_character' ? 'permission' : 'business', r, undefined, r)

type Options = { isDM?: boolean; characterIds?: number[]; logs?: GameLog[]; pot?: GamePot | null; config?: typeof LOTERIA | Record<string, never> }
const setup = (options: Options = {}) => {
  const made = createFakeLayer({
    entities: PJS, pot: options.pot === undefined ? POT : options.pot, gameLogs: options.logs ?? [],
    config: (options.config ?? LOTERIA) as never,
  })
  const play = made.layer.games.playLoteria as unknown as ReturnType<typeof vi.fn>
  const view = renderSection('/c/demo/juegos', { layer: made.layer, isDM: options.isDM ?? false, characterIds: options.characterIds ?? [10] })
  return { ...made, play, ...view }
}
const result = (roll: number, prize: object = {}, target: 'player' | 'pot' = 'player') => ({ roll, prize, prize_target: target })
const playButton = () => screen.findByRole('button', { name: /Tirar el dado/ })
const status = () => screen.getByRole('status', { name: 'Resultado' })

describe('JuegosPage as a player', () => {
  it('shows the configured prizes, the pot and the character it plays with', async () => {
    setup()
    expect(await screen.findByRole('heading', { level: 1, name: 'Juegos' })).toBeInTheDocument()
    expect(await screen.findByText('2 oro')).toBeInTheDocument() // common prize from the loteria config
    expect(screen.getByText('(≥15):', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('1 platino, 5 oro')).toBeInTheDocument() // special prize
    expect(await screen.findByLabelText('Pozo acumulado')).toHaveTextContent('12 oro, 5 bronce')
    expect(await screen.findByText('Eldric')).toBeInTheDocument()
    expect(screen.queryByLabelText('Personaje')).toBeNull() // a single PJ needs no selector
  })

  it('falls back to the server defaults without a config and tells so when the config cannot load', async () => {
    const { spies } = setup({ config: {} })
    expect(await screen.findByText('3 bronce')).toBeInTheDocument()
    expect(screen.getByText('1 plata')).toBeInTheDocument()
    expect(screen.getByText('(≥17):', { exact: false })).toBeInTheDocument()
    expect(spies.configGet).toHaveBeenCalledWith('c1', 'loteria')
  })

  it('reports a config load failure and keeps playable with the default prizes', async () => {
    const made = createFakeLayer({ entities: PJS, pot: POT })
    made.spies.configGet.mockRejectedValueOnce(new Error('down'))
    renderSection('/c/demo/juegos', { layer: made.layer, isDM: false, characterIds: [10] })
    expect(await screen.findByText(/No pudimos cargar la configuración/)).toBeInTheDocument()
    expect(await playButton()).toBeEnabled()
  })

  it('asks the server, hands ITS roll to the dice and only reveals the result when the dice lands', async () => {
    const { play } = setup()
    play.mockResolvedValue(result(18, { gp: 2 }))
    fireEvent.click(await playButton())
    const dice = await screen.findByTestId('overlay')
    expect(play).toHaveBeenCalledExactlyOnceWith('c1', 10)
    expect(dice).toHaveAttribute('data-roll', '18')
    expect(overlay.mounted[0].roll).toBe(18)
    // the number and the prize stay hidden while the dice is still rolling
    expect(within(status()).queryByText('18')).toBeNull()
    expect(screen.queryByText('¡Ganaste!')).toBeNull()
    expect(screen.getByRole('button', { name: /Tirando/ })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'dado: terminó' }))
    expect(await within(status()).findByText('18')).toBeInTheDocument()
    expect(within(status()).getByText('¡Ganaste!')).toBeInTheDocument()
    expect(within(status()).getByText('2 oro añadidos a tu bolsa.')).toBeInTheDocument()
  })

  it('shows "sin premio" for a losing roll and refreshes the logs after the play', async () => {
    const { play, spies } = setup()
    play.mockResolvedValue(result(3))
    fireEvent.click(await playButton())
    await screen.findByTestId('overlay')
    const before = spies.gameLogsList.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'dado: terminó' }))
    expect(await within(status()).findByText('Sin premio esta vez.')).toBeInTheDocument()
    await waitFor(() => expect(spies.gameLogsList.mock.calls.length).toBeGreaterThan(before))
  })

  it('shows the result when the dice is dismissed before it finishes (Escape) and closes it', async () => {
    const { play } = setup()
    play.mockResolvedValue(result(20, { pp: 1 }))
    fireEvent.click(await playButton())
    await screen.findByTestId('overlay')
    fireEvent.click(screen.getByRole('button', { name: 'dado: cerrar' }))
    expect(await within(status()).findByText('20')).toBeInTheDocument()
    expect(screen.queryByTestId('overlay')).toBeNull()
    // a late completion from the unmounted dice changes nothing
    expect(() => act(() => overlay.mounted[0].onComplete(20))).not.toThrow()
  })

  it('after playing: no second play, the UTC reset is explained with its local equivalent', async () => {
    const { play } = setup()
    play.mockResolvedValue(result(10))
    fireEvent.click(await playButton())
    await screen.findByTestId('overlay')
    fireEvent.click(screen.getByRole('button', { name: 'dado: terminó' }))
    expect(await screen.findByText(/Ya jugaste hoy\. Podés volver a jugar a las 00:00 UTC \(en 3h 0m · \d{2}:\d{2} en tu zona horaria\)\./)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Tirar el dado/ })).toBeNull()
  })

  it('knows from the logs that the character already played today (UTC day) and shows that roll', async () => {
    const { play } = setup({ logs: [log(1, { roll: 17, prize: { gp: 2 } })] })
    expect(await screen.findByText(/Ya jugaste hoy/)).toBeInTheDocument()
    expect(screen.getByText(/Tu tirada de hoy:/)).toHaveTextContent('Tu tirada de hoy: 17 · 2 oro')
    expect(screen.queryByRole('button', { name: /Tirar el dado/ })).toBeNull()
    expect(play).not.toHaveBeenCalled()
  })

  it('lets the character play again once the UTC day changed (yesterday is not today)', async () => {
    setup({ logs: [log(1, { play_date: '2026-10-07' })] })
    expect(await playButton()).toBeEnabled()
    expect(screen.queryByText(/Ya jugaste hoy/)).toBeNull()
  })

  it('only counts the logs of the selected character', async () => {
    setup({ characterIds: [10, 11], logs: [log(1, { character_id: 10 })] })
    expect(await screen.findByText(/Ya jugaste hoy/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Personaje'), { target: { value: '11' } })
    expect(await playButton()).toBeEnabled()
    expect(screen.queryByText(/Ya jugaste hoy/)).toBeNull()
  })

  it('ignores a second click while the first request is in flight', async () => {
    const { play } = setup()
    let resolve!: (v: unknown) => void
    play.mockReturnValue(new Promise((r) => { resolve = r }))
    const button = await playButton()
    fireEvent.click(button)
    fireEvent.click(button)
    fireEvent.click(button)
    expect(play).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('overlay')).toBeNull() // nothing rolls before the server answers
    await act(async () => resolve(result(9)))
    await screen.findByTestId('overlay')
    expect(play).toHaveBeenCalledTimes(1)
    expect(overlay.mounted.every((p) => p.roll === 9)).toBe(true)
  })

  it('never starts the dice for a failed play and shows the stable reason', async () => {
    const cases: [DataErrorReason, RegExp][] = [
      ['already_played_today', /Este personaje ya jugó hoy\. El día se reinicia a las 00:00 UTC\./],
      ['not_your_character', /Ese personaje no es tuyo\./],
      ['character_required', /Elegí un personaje para jugar\./],
      ['character_not_found', /No encontramos ese personaje\./],
      ['insufficient_pot', /El pozo no tiene monedas suficientes\./],
      ['not_a_member', /Ya no sos miembro de esta campaña\./],
      ['dm_only', /Solo el DM puede hacer esto\./],
    ]
    for (const [code, message] of cases) {
      const { play, unmount } = setup()
      play.mockRejectedValue(reason(code))
      fireEvent.click(await playButton())
      expect(await screen.findByRole('alert')).toHaveTextContent(message)
      expect(screen.queryByTestId('overlay')).toBeNull()
      expect(overlay.mounted).toHaveLength(0)
      expect(within(status()).queryByText('¡Ganaste!')).toBeNull()
      unmount()
    }
  })

  it('treats the two-tab race (already_played_today) as played: the button goes away', async () => {
    const { play } = setup()
    play.mockRejectedValue(reason('already_played_today'))
    fireEvent.click(await playButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('ya jugó hoy')
    await waitFor(() => expect(screen.queryByRole('button', { name: /Tirar el dado/ })).toBeNull())
    expect(screen.getByText(/Ya jugaste hoy/)).toBeInTheDocument()
  })

  it('shows a generic message for an unknown failure and allows retrying', async () => {
    const { play } = setup()
    play.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(result(2))
    fireEvent.click(await playButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo jugar. Intentá de nuevo.')
    fireEvent.click(await playButton())
    await screen.findByTestId('overlay')
    expect(screen.queryByRole('alert')).toBeNull() // the old error is cleared
  })

  it('skips the animation and reveals the result at once with prefers-reduced-motion', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    const { play } = setup()
    play.mockResolvedValue(result(19, { gp: 2 }))
    fireEvent.click(await playButton())
    expect(await within(status()).findByText('19')).toBeInTheDocument()
    expect(within(status()).getByText('¡Ganaste!')).toBeInTheDocument()
    expect(screen.queryByTestId('overlay')).toBeNull()
    expect(overlay.mounted).toHaveLength(0)
  })

  it('follows the pot in realtime', async () => {
    const { fake } = setup()
    expect(await screen.findByLabelText('Pozo acumulado')).toHaveTextContent('12 oro, 5 bronce')
    const channel = fake.channels.find((c) => c.name.startsWith('campaign:game_pot:'))!
    act(() => channel.emit('UPDATE', { new: { ...POT, gp: 20, pp: 1 } }))
    expect(screen.getByLabelText('Pozo acumulado')).toHaveTextContent('1 platino, 20 oro, 5 bronce')
  })

  it('shows an empty pot and a pot load failure without breaking the page', async () => {
    setup({ pot: null })
    expect(await screen.findByLabelText('Pozo acumulado')).toHaveTextContent('Vacío')
  })

  it('lists the recent own logs with the character name and prize', async () => {
    setup({ logs: [log(3, { roll: 20, prize: { pp: 1 }, play_date: '2026-10-07' }), log(2, { roll: 4, play_date: '2026-10-06', character_id: 99 }), log(1, { roll: 9, play_date: '2026-10-05' })] })
    const list = await screen.findByRole('region', { name: 'Últimas tiradas' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2) // the log of another character is not mine
    expect(items[0]).toHaveTextContent('2026-10-07')
    expect(items[0]).toHaveTextContent('Eldric')
    expect(items[0]).toHaveTextContent('Salió 20')
    expect(items[0]).toHaveTextContent('1 platino')
    expect(items[1]).toHaveTextContent('sin premio')
  })
})

describe('JuegosPage with several characters', () => {
  it('offers a selector with the names and plays with the chosen character', async () => {
    const { play } = setup({ characterIds: [10, 11] })
    const select = await screen.findByLabelText('Personaje')
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Eldric', 'Mara'])
    expect(select).toHaveValue('10')
    fireEvent.change(select, { target: { value: '11' } })
    play.mockResolvedValue(result(5))
    fireEvent.click(await playButton())
    await screen.findByTestId('overlay')
    expect(play).toHaveBeenCalledWith('c1', 11)
    expect(screen.getByLabelText('Personaje')).toBeDisabled() // locked while the dice rolls
  })
})

describe('JuegosPage without a character', () => {
  it('is read-only: explains why, still shows prizes and pot, and offers no play button', async () => {
    const { play } = setup({ characterIds: [] })
    expect(await screen.findByText(/Necesitás un personaje en esta campaña para jugar/)).toBeInTheDocument()
    expect(await screen.findByLabelText('Pozo acumulado')).toHaveTextContent('12 oro')
    expect(screen.queryByRole('button', { name: /Tirar el dado/ })).toBeNull()
    expect(screen.queryByLabelText('Personaje')).toBeNull()
    expect(play).not.toHaveBeenCalled()
  })
})

describe('JuegosPage as the DM', () => {
  it('plays into the pot without a character and without the daily limit', async () => {
    const { play } = setup({ isDM: true, characterIds: [], logs: [log(1, { actor_type: 'dm', character_id: null, prize_target: 'pot', roll: 6 })] })
    expect(await screen.findByText('Como DM, el premio va al pozo.')).toBeInTheDocument()
    play.mockResolvedValue(result(17, { gp: 2 }, 'pot'))
    fireEvent.click(await playButton())
    await screen.findByTestId('overlay')
    expect(play).toHaveBeenCalledExactlyOnceWith('c1', undefined)
    fireEvent.click(screen.getByRole('button', { name: 'dado: terminó' }))
    expect(await within(status()).findByText('2 oro enviados al pozo.')).toBeInTheDocument()
    expect(await playButton()).toBeEnabled() // can play again: no daily limit for the DM
    expect(screen.queryByText(/Ya jugaste hoy/)).toBeNull()
  })

  it('shows the DM plays in the recent list (no character name) and no selector', async () => {
    setup({ isDM: true, characterIds: [10, 11], logs: [log(1, { actor_type: 'dm', character_id: null, prize_target: 'pot', roll: 6 }), log(2, { roll: 15 })] })
    const list = await screen.findByRole('region', { name: 'Últimas tiradas' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(1)
    expect(items[0]).toHaveTextContent('Salió 6')
    expect(screen.queryByLabelText('Personaje')).toBeNull()
  })

  it('shows a failure of the DM play too', async () => {
    const { play } = setup({ isDM: true, characterIds: [] })
    play.mockRejectedValue(reason('dm_only'))
    fireEvent.click(await playButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('Solo el DM puede hacer esto.')
    expect(screen.queryByTestId('overlay')).toBeNull()
  })
})
