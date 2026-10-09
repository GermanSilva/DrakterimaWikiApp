import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROLL_TOTAL_SEC, faceIndexForRoll, faceNormal, rotateVec } from './d20Orientation'

// three.js needs WebGL: replace it with recording stubs (the geometry/orientation math is tested on its own)
const three = vi.hoisted(() => {
  const state = {
    renderers: [] as { render: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; setSize: ReturnType<typeof vi.fn>; setClearColor: ReturnType<typeof vi.fn>; domElement: HTMLCanvasElement }[],
    meshes: [] as { quaternion: { set: ReturnType<typeof vi.fn> }; position: { set: ReturnType<typeof vi.fn> }; scale: { setScalar: ReturnType<typeof vi.fn> } }[],
    disposed: 0,
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
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
  vi.stubGlobal('cancelAnimationFrame', () => { frames = [] })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('D20Overlay', () => {
  it('mounts a click-through transparent full-viewport layer with a transparent WebGL canvas', () => {
    const { getByTestId } = render(<D20Overlay roll={7} />)
    const layer = getByTestId('d20-overlay')
    expect(layer.style.position).toBe('fixed')
    expect(layer.style.pointerEvents).toBe('none')
    expect(layer.getAttribute('aria-hidden')).toBe('true')
    expect(layer).toContainElement(three.state.renderers[0].domElement)
    expect(three.state.renderers[0].setClearColor).toHaveBeenCalledWith(0x000000, 0)
  })

  it('animates to the requested roll, reports it once, then closes itself after the hold', async () => {
    const onComplete = vi.fn()
    const onClose = vi.fn()
    render(<D20Overlay roll={13} onComplete={onComplete} onClose={onClose} holdMs={1000} />)
    await flushFonts()
    await tick(1000) // first frame: t = 0
    await tick(1000 + 500)
    expect(onComplete).not.toHaveBeenCalled()
    await tick(1000 + (ROLL_TOTAL_SEC + 0.01) * 1000)
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledWith(13)

    // the last pose puts the face of 13 towards the camera
    const quat = three.state.meshes[0].quaternion.set.mock.calls.at(-1) as [number, number, number, number]
    const up = rotateVec(quat, faceNormal(faceIndexForRoll(13)))
    expect(up[1]).toBeCloseTo(1, 9)
    expect(frames).toHaveLength(0) // at rest: the loop stopped

    expect(onClose).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(1000) })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes right away on Escape and ignores other keys', async () => {
    const onClose = vi.fn()
    render(<D20Overlay roll={2} onClose={onClose} />)
    await flushFonts()
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })) })
    expect(onClose).not.toHaveBeenCalled()
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
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

  it('does not start a frame loop when unmounted before the font wait ends', async () => {
    const { unmount } = render(<D20Overlay roll={5} />)
    unmount()
    await flushFonts()
    expect(frames).toHaveLength(0)
  })
})
