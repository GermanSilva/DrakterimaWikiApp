import { configure, fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createFakeLayer } from '../testing/fakeLayer'
import { entity, renderSection } from '../testing/renderSection'

configure({ asyncUtilTimeout: 5000 })

// the dice chunk fails to download (offline, deploy in between): the server already decided, so the result must still show
vi.mock('../../components/dice/D20Overlay', () => {
  throw new Error('chunk failed')
})

describe('JuegosPage when the dice chunk cannot be loaded', () => {
  it('reveals the server result without animation', async () => {
    const made = createFakeLayer({ entities: { pjs: [entity(10, { nombre: 'Eldric' })] }, pot: null })
    const play = made.layer.games.playLoteria as unknown as ReturnType<typeof vi.fn>
    play.mockResolvedValue({ roll: 16, prize: {}, prize_target: 'player' })
    renderSection('/c/demo/juegos', { layer: made.layer, isDM: false, characterIds: [10] })
    fireEvent.click(await screen.findByRole('button', { name: /Tirar el dado/ }))
    expect(await within(screen.getByRole('status', { name: 'Resultado' })).findByText('16')).toBeInTheDocument()
    expect(play).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
