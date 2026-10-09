import { configure, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeLayer } from '../testing/fakeLayer'
import { entity, renderSection } from '../testing/renderSection'

configure({ asyncUtilTimeout: 5000 })

// the REAL overlay runs here; only three.js is replaced, and creating its renderer fails (no WebGL context)
const three = vi.hoisted(() => ({ created: 0 }))
vi.mock('three', () => {
  const vec = () => ({ set: () => undefined })
  return {
    PerspectiveCamera: class {
      up = vec()
      position = vec()
      lookAt = () => undefined
    },
    WebGLRenderer: class {
      constructor() {
        three.created++
        throw new Error('Error creating WebGL context.')
      }
    },
    SRGBColorSpace: 'srgb',
  }
})
vi.mock('../../components/dice/faceTexture', () => ({ makeFaceTexture: () => ({ dispose: () => undefined }) }))

beforeEach(() => {
  three.created = 0
  vi.stubGlobal('matchMedia', undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined) // React logs the caught overlay error
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const play = async (rollFromServer: number, prize: object = {}) => {
  const made = createFakeLayer({ entities: { pjs: [entity(10, { nombre: 'Eldric' })] }, pot: null })
  const playLoteria = made.layer.games.playLoteria as unknown as ReturnType<typeof vi.fn>
  playLoteria.mockResolvedValue({ roll: rollFromServer, prize, prize_target: 'player' })
  renderSection('/c/demo/juegos', { layer: made.layer, isDM: false, characterIds: [10] })
  fireEvent.click(await screen.findByRole('button', { name: /Tirar el dado/ }))
  return playLoteria
}

describe('JuegosPage when the dice overlay cannot mount', () => {
  it('reveals the already-awarded result when the WebGL context cannot be created', async () => {
    const playLoteria = await play(18, { gp: 2 })
    const result = screen.getByRole('status', { name: 'Resultado' })
    expect(await within(result).findByText('18')).toBeInTheDocument()
    expect(within(result).getByText('¡Ganaste!')).toBeInTheDocument()
    expect(three.created).toBe(1) // it did try to mount
    expect(screen.queryByTestId('d20-overlay')).toBeNull()
    expect(screen.queryByRole('heading', { name: /error/i })).toBeNull() // the app-level boundary never showed
    expect(playLoteria).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Juegos' })).toBeInTheDocument() // the page is still alive
  })

  it('reveals the result when the server roll is outside 1-20', async () => {
    await play(25)
    const result = screen.getByRole('status', { name: 'Resultado' })
    expect(await within(result).findByText('25')).toBeInTheDocument()
    expect(within(result).getByText('Sin premio esta vez.')).toBeInTheDocument()
    expect(three.created).toBe(0) // rejected before any GPU resource
    expect(screen.queryByTestId('d20-overlay')).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Juegos' })).toBeInTheDocument()
  })
})
