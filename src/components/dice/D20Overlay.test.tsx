import { act, fireEvent, render } from '@testing-library/react'
import { Component, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DISMISS_MS, DISMISS_ZOOM } from './dismissFade'
import { ROLL_TOTAL_SEC, faceIndexForRoll, faceNormal, rotateVec } from './d20Orientation'

// three.js needs WebGL: replace it with recording stubs (the geometry/orientation math is tested on its own)
const three = vi.hoisted(() => {
  const state = {
    renderers: [] as { render: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; setSize: ReturnType<typeof vi.fn>; setClearColor: ReturnType<typeof vi.fn>; domElement: HTMLCanvasElement }[],
    meshes: [] as { quaternion: { set: ReturnType<typeof vi.fn> }; position: { set: ReturnType<typeof vi.fn> }; scale: { setScalar: ReturnType<typeof vi.fn> } }[],
    disposed: 0,
    failRenderer: false,
  }
  const vec = () => ({ set: vi.fn(), copy: vi.fn(), setScalar: vi.fn() })
  class Disposable {
    dispose = vi.fn(() => {
      state.disposed++
    })
  }
  class Renderer extends Disposable {
    domElement = document.createElement('canvas')
    render = vi.fn()
    setPixelRatio = vi.fn()
    setSize = vi.fn()
    setClearColor = vi.fn()
    outputColorSpace = ''
    constructor() {
      super()
      if (state.failRenderer) throw new Error('WebGL context creation failed')
      state.renderers.push(this)
    }
  }
  class Camera {
    up = vec()
    position = vec()
    aspect = 1
    lookAt = vi.fn()
    updateProjectionMatrix = vi.fn()
  }
  class Obj {
    add = vi.fn()
    position = vec()
  }
  class Mesh extends Obj {
    quaternion = vec()
    scale = vec()
    constructor() {
      super()
      state.meshes.push(this as never)
    }
  }
  class Geometry extends Disposable {
    setAttribute = vi.fn()
    computeVertexNormals = vi.fn()
    addGroup = vi.fn()
  }
  return {
    state,
    module: {
      PerspectiveCamera: Camera,
      WebGLRenderer: Renderer,
      Scene: Obj,
      AmbientLight: Obj,
      DirectionalLight: Obj,
      BufferGeometry: Geometry,
      BufferAttribute: class {},
      EdgesGeometry: Geometry,
      MeshPhongMaterial: Disposable,
      LineBasicMaterial: Disposable,
      LineSegments: Obj,
      Mesh,
      SRGBColorSpace: 'srgb',
    },
  }
})
vi.mock('three', () => three.module)
vi.mock('./faceTexture', () => ({
  makeFaceTexture: () => ({
    dispose: vi.fn(() => {
      three.state.disposed++
    }),
  }),
}))

import D20Overlay from './D20Overlay'

let frames: FrameRequestCallback[] = []
const flushFonts = () => act(async () => { await Promise.resolve() })
/** Runs the queued animation frame with the given timestamp (ms). */
const tick = (ms: number) => act(() => {
  const queued = frames
  frames = []
  queued.forEach((cb) => cb(ms))
})

beforeEach(() => {
  frames = []
  three.state.renderers.length = 0
  three.state.meshes.length = 0
  three.state.disposed = 0
  three.state.failRenderer = false
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
  vi.stubGlobal('cancelAnimationFrame', () => { frames = [] })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const queryHint = () => document.querySelector('[data-testid="d20-hint"]')
const liveRegion = () => document.querySelector('[role="status"]')
const LANDING_MS = 1000 + (ROLL_TOTAL_SEC + 0.01) * 1000

/** Lands the die: first frame at t = 1000 ms, then past the end of the throw. Returns the landing timestamp. */
const land = async () => {
  await flushFonts()
  await tick(1000)
  await tick(LANDING_MS)
  return LANDING_MS
}

describe('D20Overlay', () => {
  it('mounts a click-through transparent full-viewport layer with a transparent WebGL canvas', () => {
    const { getByTestId } = render(<D20Overlay roll={7} />)
    const layer = getByTestId('d20-overlay')
    expect(layer.style.position).toBe('fixed')
    expect(layer.style.pointerEvents).toBe('none')
    expect(getByTestId('d20-canvas').getAttribute('aria-hidden')).toBe('true')
    expect(getByTestId('d20-canvas')).toContainElement(three.state.renderers[0].domElement)
    expect(three.state.renderers[0].setClearColor).toHaveBeenCalledWith(0x000000, 0)
    expect(queryHint()).toBeNull()
    expect(liveRegion()).toBeNull()
  })

  it('animates to the requested roll, reports it once and then STAYS on screen waiting for the user', async () => {
    const onComplete = vi.fn()
    const onClose = vi.fn()
    const { getByTestId } = render(<D20Overlay roll={13} onComplete={onComplete} onClose={onClose} />)
    await flushFonts()
    await tick(1000) // first frame: t = 0
    await tick(1000 + 500)
    expect(onComplete).not.toHaveBeenCalled()
    expect(getByTestId('d20-overlay').style.pointerEvents).toBe('none')
    await tick(LANDING_MS)
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledWith(13)

    // the last pose puts the face of 13 towards the camera
    const quat = three.state.meshes[0].quaternion.set.mock.calls.at(-1) as [number, number, number, number]
    const up = rotateVec(quat, faceNormal(faceIndexForRoll(13)))
    expect(up[1]).toBeCloseTo(1, 9)
    expect(frames).toHaveLength(0) // at rest: the loop stopped

    // landed: it captures input everywhere, hints how to leave and announces the result; it never closes by itself
    expect(getByTestId('d20-overlay').style.pointerEvents).toBe('auto')
    expect(queryHint()).toHaveTextContent('Tocá para continuar')
    expect(liveRegion()).toHaveTextContent('Salió 13')
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(onClose).not.toHaveBeenCalled()
    expect(getByTestId('d20-overlay')).toBeInTheDocument()
  })

  it('ignores clicks, taps and keys while the die is still tumbling', async () => {
    const onClose = vi.fn()
    const { getByTestId } = render(<D20Overlay roll={2} onClose={onClose} />)
    await flushFonts()
    await tick(1000)
    const layer = getByTestId('d20-overlay')
    fireEvent.pointerDown(layer)
    fireEvent.click(layer)
    for (const key of ['Escape', 'Enter', ' ']) act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key })) })
    await tick(1000 + 500)
    expect(frames).toHaveLength(1) // still tumbling: no fade was scheduled
    await tick(LANDING_MS)
    expect(onClose).not.toHaveBeenCalled()
    expect(getByTestId('d20-canvas').style.opacity).toBe('') // never faded
  })

  it('once landed, a click fades the die out while zooming in and closes only when the fade ends', async () => {
    const onClose = vi.fn()
    const { getByTestId } = render(<D20Overlay roll={9} onClose={onClose} />)
    const t = await land()
    const canvas = getByTestId('d20-canvas')
    fireEvent.click(getByTestId('d20-overlay'))
    expect(queryHint()).toBeNull() // the hint goes away at once
    expect(frames).toHaveLength(1)

    await tick(t) // the fade starts here
    await tick(t + DISMISS_MS / 2)
    expect(Number(canvas.style.opacity)).toBeCloseTo(0.5, 5)
    expect(Number(canvas.style.transform.match(/scale\(([\d.]+)\)/)![1])).toBeCloseTo((1 + DISMISS_ZOOM) / 2, 5)
    expect(onClose).not.toHaveBeenCalled()

    await tick(t + DISMISS_MS)
    expect(canvas.style.opacity).toBe('0')
    expect(canvas.style.transform).toBe(`scale(${DISMISS_ZOOM})`)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(frames).toHaveLength(0)
  })

  it('a new roll starts a fresh throw: hint, live region, pointer capture and fade are reset', async () => {
    const { getByTestId, rerender } = render(<D20Overlay roll={9} />)
    await land()
    fireEvent.click(getByTestId('d20-overlay'))
    await tick(LANDING_MS) // the fade starts here
    await tick(LANDING_MS + DISMISS_MS / 2)
    expect(getByTestId('d20-canvas').style.opacity).not.toBe('')

    rerender(<D20Overlay roll={14} />)
    expect(getByTestId('d20-overlay').style.pointerEvents).toBe('none')
    expect(getByTestId('d20-canvas').style.opacity).toBe('')
    expect(getByTestId('d20-canvas').style.transform).toBe('')
    expect(queryHint()).toBeNull()
    expect(liveRegion()).toBeNull()

    await land()
    expect(getByTestId('d20-overlay').style.pointerEvents).toBe('auto')
    expect(queryHint()).toHaveTextContent('Tocá para continuar')
    expect(liveRegion()).toHaveTextContent('Salió 14')
  })

  it.each([
    ['a pointer down (tap)', () => fireEvent.pointerDown(document.querySelector('[data-testid="d20-overlay"]')!)],
    ['Escape', () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))],
    ['Enter', () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))],
    ['Space', () => window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))],
  ])('dismisses on %s once landed', async (_name, trigger) => {
    const onClose = vi.fn()
    render(<D20Overlay roll={9} onClose={onClose} />)
    const t = await land()
    act(() => { trigger() })
    await tick(t)
    await tick(t + DISMISS_MS + 1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores other keys and does not swallow them', async () => {
    const onClose = vi.fn()
    render(<D20Overlay roll={9} onClose={onClose} />)
    const t = await land()
    const e = new KeyboardEvent('keydown', { key: 'a', cancelable: true })
    act(() => { window.dispatchEvent(e) })
    expect(e.defaultPrevented).toBe(false)
    expect(frames).toHaveLength(0)
    await tick(t + DISMISS_MS * 2)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('prevents the default of Space so the page does not scroll', async () => {
    render(<D20Overlay roll={9} />)
    await land()
    const e = new KeyboardEvent('keydown', { key: ' ', cancelable: true })
    act(() => { window.dispatchEvent(e) })
    expect(e.defaultPrevented).toBe(true)
  })

  it('guards against double dismissal: tap + click + keys schedule one fade and one onClose', async () => {
    const onClose = vi.fn()
    const { getByTestId } = render(<D20Overlay roll={9} onClose={onClose} />)
    const t = await land()
    const layer = getByTestId('d20-overlay')
    fireEvent.pointerDown(layer)
    fireEvent.click(layer) // a real tap fires both
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(frames).toHaveLength(1)
    await tick(t)
    await tick(t + DISMISS_MS)
    fireEvent.click(layer)
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })) })
    await tick(t + DISMISS_MS * 3)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('resizes the canvas with the window', async () => {
    render(<D20Overlay roll={2} />)
    await flushFonts()
    act(() => { window.dispatchEvent(new Event('resize')) })
    expect(three.state.renderers[0].setSize).toHaveBeenCalledTimes(2)
  })

  it('disposes the renderer, GPU resources and listeners on unmount, and stops animating', async () => {
    const onClose = vi.fn()
    const onComplete = vi.fn()
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount, getByTestId } = render(<D20Overlay roll={5} onClose={onClose} onComplete={onComplete} />)
    await flushFonts()
    const canvas = three.state.renderers[0].domElement
    const layer = getByTestId('d20-overlay')
    unmount()
    expect(three.state.renderers[0].dispose).toHaveBeenCalledTimes(1)
    expect(three.state.disposed).toBeGreaterThan(20) // geometry, edges, 20 materials and textures
    expect(layer).not.toContainElement(canvas)
    expect(removeSpy.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(['resize', 'keydown']))
    // nothing fires after unmount
    await tick(5000)
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(onComplete).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    removeSpy.mockRestore()
  })

  it('unmounting in the middle of the fade-out cancels it and never calls onClose', async () => {
    const onClose = vi.fn()
    const { unmount, getByTestId } = render(<D20Overlay roll={9} onClose={onClose} />)
    const t = await land()
    fireEvent.click(getByTestId('d20-overlay'))
    await tick(t)
    await tick(t + DISMISS_MS / 2)
    unmount()
    expect(frames).toHaveLength(0)
    await tick(t + DISMISS_MS * 2)
    expect(onClose).not.toHaveBeenCalled()
    expect(three.state.renderers[0].dispose).toHaveBeenCalledTimes(1)
  })

  it('does not start a frame loop when unmounted before the font wait ends', async () => {
    const { unmount } = render(<D20Overlay roll={5} />)
    unmount()
    await flushFonts()
    expect(frames).toHaveLength(0)
  })
})

describe('D20Overlay setup failures', () => {
  // React logs the error it rethrows; keep the test output clean
  beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => undefined) })
  afterEach(() => { vi.restoreAllMocks() })

  it('throws (to the error boundary) when the WebGL context cannot be created', () => {
    three.state.failRenderer = true
    expect(() => render(<D20Overlay roll={5} />)).toThrow('WebGL context creation failed')
  })

  it.each([0, 21, 3.5, Number.NaN])('throws for the roll %s before creating any GPU resource', (roll) => {
    expect(() => render(<D20Overlay roll={roll} />)).toThrow(RangeError)
    expect(three.state.renderers).toHaveLength(0)
  })

  it('sends a render error raised in an animation frame to the error boundary', async () => {
    class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
      state = { failed: false }
      static getDerivedStateFromError() {
        return { failed: true }
      }
      render() {
        return this.state.failed ? <p>fallback</p> : this.props.children
      }
    }
    const { getByText } = render(<Boundary><D20Overlay roll={5} /></Boundary>)
    three.state.renderers[0].render.mockImplementation(() => { throw new Error('context lost') })
    await flushFonts()
    await tick(1000)
    expect(getByText('fallback')).toBeInTheDocument()
    expect(three.state.renderers[0].dispose).toHaveBeenCalledTimes(1)
  })
})
