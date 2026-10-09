import { act, configure, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeLayer } from '../testing/fakeLayer'
import { entity, renderSection } from '../testing/renderSection'

configure({ asyncUtilTimeout: 5000 })

// the dice chunk download stalls forever (flaky network): the page must not hold the result back
vi.mock('../../components/dice/D20Overlay', () => new Promise(() => undefined))

beforeEach(() => {
  vi.stubGlobal('matchMedia', undefined)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('JuegosPage when the dice chunk stalls', () => {
  it('waits for the chunk up to 8 s after the server answered, then skips the animation and reveals the result', async () => {
    const made = createFakeLayer({ entities: { pjs: [entity(10, { nombre: 'Eldric' })] }, pot: null })
    const play = made.layer.games.playLoteria as unknown as ReturnType<typeof vi.fn>
    play.mockResolvedValue({ roll: 14, prize: {}, prize_target: 'player' })
    renderSection('/c/demo/juegos', { layer: made.layer, isDM: false, characterIds: [10] })
    const button = await screen.findByRole('button', { name: /Tirar el dado/ })

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fireEvent.click(button)
    await act(async () => { await vi.advanceTimersByTimeAsync(7_900) })
    const result = screen.getByRole('status', { name: 'Resultado' })
    expect(within(result).queryByText('14')).toBeNull() // still waiting for the dice
    expect(screen.getByRole('button', { name: /Tirando/ })).toBeDisabled()

    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    expect(within(result).getByText('14')).toBeInTheDocument()
    expect(within(result).getByText('Sin premio esta vez.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Juegos' })).toBeInTheDocument()
    expect(play).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
