import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_MAP_SIZE } from './mapGeometry'
import { IMAGE_LOAD_TIMEOUT_MS, UNKNOWN_SIZE_MAP, useImageSize } from './useImageSize'

const instances: FakeImage[] = []
class FakeImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  naturalWidth = 0
  naturalHeight = 0
  srcs: string[] = []
  constructor() {
    instances.push(this)
  }
  set src(v: string) {
    this.srcs.push(v)
  }
}

beforeEach(() => {
  instances.length = 0
  vi.useFakeTimers()
  vi.stubGlobal('Image', FakeImage)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useImageSize', () => {
  it('is ready at once without an image', () => {
    const { result } = renderHook(() => useImageSize(null))
    expect(result.current).toEqual({ ready: true, size: DEFAULT_MAP_SIZE, failed: false })
  })

  it('measures the loaded image', () => {
    const { result } = renderHook(() => useImageSize('https://i.test/a.png'))
    expect(result.current).toEqual({ ready: false })
    instances[0].naturalWidth = 3000
    instances[0].naturalHeight = 1500
    act(() => instances[0].onload?.())
    expect(result.current).toEqual({ ready: true, size: { w: 1000, h: 500 }, failed: false })
  })

  it('an image without intrinsic size (SVG) gets the neutral 4:3 plane, not a zero / NaN one', () => {
    const { result } = renderHook(() => useImageSize('https://i.test/a.svg'))
    act(() => instances[0].onload?.())
    expect(result.current).toEqual({ ready: true, size: UNKNOWN_SIZE_MAP, failed: false })
    expect(UNKNOWN_SIZE_MAP.w / UNKNOWN_SIZE_MAP.h).toBeCloseTo(4 / 3)
  })

  it('a load error settles to the square, marked failed', () => {
    const { result } = renderHook(() => useImageSize('https://i.test/a.png'))
    act(() => instances[0].onerror?.())
    expect(result.current).toEqual({ ready: true, size: DEFAULT_MAP_SIZE, failed: true })
  })

  it('a silent host times out into the failed state', () => {
    const { result } = renderHook(() => useImageSize('https://i.test/slow.png'))
    act(() => {
      vi.advanceTimersByTime(IMAGE_LOAD_TIMEOUT_MS - 1)
    })
    expect(result.current).toEqual({ ready: false })
    act(() => {
      vi.advanceTimersByTime(2)
    })
    expect(result.current).toEqual({ ready: true, size: DEFAULT_MAP_SIZE, failed: true })
  })

  it('cleanup aborts the download and cancels the timer; a late event is ignored', () => {
    const { result, unmount } = renderHook(() => useImageSize('https://i.test/a.png'))
    const img = instances[0]
    unmount()
    expect(img.srcs.at(-1)).toBe('')
    expect(img.onload).toBeNull()
    act(() => {
      vi.advanceTimersByTime(IMAGE_LOAD_TIMEOUT_MS * 2)
    })
    expect(result.current).toEqual({ ready: false })
  })

  it('a new url is not ready until it is measured (never reports the previous image)', () => {
    const { result, rerender } = renderHook(({ url }) => useImageSize(url), { initialProps: { url: 'https://i.test/a.png' } })
    instances[0].naturalWidth = 10
    instances[0].naturalHeight = 10
    act(() => instances[0].onload?.())
    expect(result.current.ready).toBe(true)
    rerender({ url: 'https://i.test/b.png' })
    expect(result.current).toEqual({ ready: false })
  })
})
