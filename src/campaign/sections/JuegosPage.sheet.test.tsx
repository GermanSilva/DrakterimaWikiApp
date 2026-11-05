import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameLog, GamePot } from '../../data'
import { DND5E_SHEET } from '../system/sheet/dnd5eSheet'
import { dnd5eProfile } from '../system/systemProfile'
import { createFakeLayer } from '../testing/fakeLayer'
import { entity, renderSection } from '../testing/renderSection'

configure({ asyncUtilTimeout: 5000 })

// the real overlay needs three.js: here it only completes on demand
vi.mock('../../components/dice/D20Overlay', async () => {
  const { createElement } = await import('react')
  return {
    default: (props: { roll: number; onComplete: (roll: number) => void }) =>
      createElement('button', { onClick: () => props.onComplete(props.roll) }, 'dado: terminó'),
  }
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-08T21:00:00Z'))
  vi.stubGlobal('matchMedia', undefined)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const sheetOf = (items: unknown[]) => ({ categories: [{ key: 'c', label: 'C', sections: [{ key: 'alpha', label: 'Alpha', items, blocks: [] }] }], roles: {} })
const coins = (rows: unknown[], extra: Record<string, unknown> = {}) => ({ kind: 'table', type: 'monedas', key: 'dinero', label: 'Dinero', rows, ...extra })
const bolsa = { kind: 'table', type: 'economia', key: 'bolsa', label: 'Bolsa', editableBy: 'dm', rewardDestination: true }
const CUSTOM = [{ key: 'cobre', label: 'cobre', value: 1 }, { key: 'plata', label: 'plata', value: 10 }, { key: 'oro', label: 'oro', value: 100 }]
const LEGACY_KEYS = [{ key: 'cp', label: 'Cobre', value: 1 }, { key: 'gp', label: 'Oro', value: 100 }]
const withSheet = (sheet: unknown) => ({ system_profile: { ...dnd5eProfile(), sheet } as unknown as Record<string, unknown> })

const POT: GamePot = { campaign_id: 'c1', cp: 5, sp: 0, ep: 0, gp: 12, pp: 0, updated_at: '' }
const PJS = { pjs: [entity(10, { nombre: 'Eldric' })] }
const config = (value: Record<string, unknown>) => ({ loteria: { value, visibility: 'members' as const } })
const CUSTOM_CONFIG = config({ commonMinRoll: 15, commonPrize: { oro: 2 }, specialPrize: { cobre: 3, plata: 1 } })

const setup = (sheet: unknown, options: { isDM?: boolean; cfg?: ReturnType<typeof config>; logs?: GameLog[] } = {}) => {
  const made = createFakeLayer({ entities: PJS, pot: POT, gameLogs: options.logs ?? [], config: (options.cfg ?? CUSTOM_CONFIG) as never })
  const play = made.layer.games.playLoteria as unknown as ReturnType<typeof vi.fn>
  renderSection('/c/demo/juegos', { layer: made.layer, isDM: options.isDM ?? false, characterIds: [10], campaign: withSheet(sheet) })
  return { ...made, play }
}
const playButton = () => screen.findByRole('button', { name: /Tirar el dado/ })

describe('Juegos on a campaign with a sheet: the lottery needs denominations and a reward destination (S12, S28)', () => {
  it('hides the lottery when the coin table is not marked as the destination of anything', async () => {
    const { play } = setup(sheetOf([coins(CUSTOM)]))
    expect(await screen.findByRole('heading', { level: 1, name: 'Juegos' })).toBeInTheDocument()
    expect(await screen.findByText('La lotería todavía no está disponible.')).toBeInTheDocument()
    expect(screen.queryByText('La Lotería del Dado')).toBeNull()
    expect(screen.queryByRole('button', { name: /Tirar el dado/ })).toBeNull()
    expect(screen.queryByLabelText('Pozo acumulado')).toBeNull()
    expect(play).not.toHaveBeenCalled()
  })

  it('hides it when the coin table has no denominations, even if it is marked', async () => {
    setup(sheetOf([coins([], { rewardDestination: true })]))
    expect(await screen.findByText('La lotería todavía no está disponible.')).toBeInTheDocument()
    expect(screen.queryByText('La Lotería del Dado')).toBeNull()
  })

  it('tells the DM what is missing, and a player nothing technical', async () => {
    setup(sheetOf([coins(CUSTOM)]), { isDM: true })
    expect(await screen.findByText(/marcá un destino de recompensa/)).toBeInTheDocument()
  })

  it('does not tell a player how to fix the sheet', async () => {
    setup(sheetOf([coins(CUSTOM)]))
    await screen.findByText('La lotería todavía no está disponible.')
    expect(screen.queryByText(/destino de recompensa/)).toBeNull()
  })

  it('shows the prizes in the denominations of the sheet, with its labels, and pays the player in them', async () => {
    const { play } = setup(sheetOf([coins(CUSTOM, { rewardDestination: true })]))
    play.mockResolvedValue({ roll: 18, prize: { cobre: 3, plata: 1, oro: 0 }, prize_target: 'player' })
    expect(await screen.findByText('2 oro')).toBeInTheDocument() // common prize
    expect(screen.getByText('1 plata, 3 cobre')).toBeInTheDocument() // special prize, most valuable first
    expect(screen.getByText('(≥15):', { exact: false })).toBeInTheDocument()
    fireEvent.click(await playButton())
    fireEvent.click(await screen.findByRole('button', { name: 'dado: terminó' }))
    const status = screen.getByRole('status', { name: 'Resultado' })
    expect(await within(status).findByText('1 plata, 3 cobre añadidos a tu bolsa.')).toBeInTheDocument()
    expect(play).toHaveBeenCalledExactlyOnceWith('c1', 10)
  })

  it('the pot cannot hold custom denominations: no pot card and no DM play, a note instead', async () => {
    const { play } = setup(sheetOf([coins(CUSTOM, { rewardDestination: true })]), { isDM: true })
    expect(await screen.findByText(/El pozo todavía no admite las denominaciones de esta hoja/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Pozo acumulado')).toBeNull()
    expect(screen.queryByRole('button', { name: /Tirar el dado/ })).toBeNull()
    expect(play).not.toHaveBeenCalled()
  })

  it('an economy table as destination keeps the lottery, and the pot while the denominations are pot columns', async () => {
    const { play } = setup(sheetOf([coins(LEGACY_KEYS), bolsa]), { isDM: true, cfg: config({ commonMinRoll: 10, commonPrize: { gp: 2 }, specialPrize: { cp: 4 } }) })
    expect(await screen.findByText('2 Oro')).toBeInTheDocument()
    expect(screen.getByText('4 Cobre')).toBeInTheDocument()
    expect(await screen.findByLabelText('Pozo acumulado')).toHaveTextContent('12 Oro, 5 Cobre')
    play.mockResolvedValue({ roll: 11, prize: { cp: 0, gp: 2 }, prize_target: 'pot' })
    fireEvent.click(await playButton())
    fireEvent.click(await screen.findByRole('button', { name: 'dado: terminó' }))
    expect(await within(screen.getByRole('status', { name: 'Resultado' })).findByText('2 Oro enviados al pozo.')).toBeInTheDocument()
    expect(play).toHaveBeenCalledExactlyOnceWith('c1', undefined)
  })

  it('shows what an old log won even if its key is no longer a denomination', async () => {
    const old: GameLog = { id: 1, campaign_id: 'c1', actor_type: 'dm', character_id: null, game: 'loteria', play_date: '2026-10-08', roll: 17, prize: { gp: 4 }, prize_target: 'pot', created_at: '2026-10-08T10:00:00Z' }
    setup(sheetOf([coins(LEGACY_KEYS), bolsa]), { isDM: true, logs: [old] })
    const recent = await screen.findByRole('region', { name: 'Últimas tiradas' })
    await waitFor(() => expect(within(recent).getByText('4 Oro')).toBeInTheDocument())
  })

  it('the D&D preset sheet (coin table marked) keeps the lottery with its five denominations', async () => {
    setup(DND5E_SHEET, { cfg: config({ commonMinRoll: 15, commonPrize: { gp: 2 }, specialPrize: { pp: 1, gp: 5 } }) })
    expect(await screen.findByText('2 Oro')).toBeInTheDocument()
    expect(screen.getByText('1 Platino, 5 Oro')).toBeInTheDocument()
    expect(await playButton()).toBeEnabled()
    expect(await screen.findByLabelText('Pozo acumulado')).toHaveTextContent('12 Oro, 5 Cobre')
  })
})
