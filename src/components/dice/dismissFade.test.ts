import { describe, expect, it } from 'vitest'
import { DISMISS_MS, DISMISS_ZOOM, dismissFrame } from './dismissFade'

describe('dismissFrame', () => {
  it('starts opaque and untouched', () => {
    expect(dismissFrame(0)).toEqual({ opacity: 1, scale: 1, done: false })
  })

  it('ends transparent and fully zoomed, and is done', () => {
    expect(dismissFrame(DISMISS_MS)).toEqual({ opacity: 0, scale: DISMISS_ZOOM, done: true })
  })

  it('is symmetric at the midpoint (opacity falls while scale grows)', () => {
    const mid = dismissFrame(DISMISS_MS / 2)
    expect(mid.opacity).toBeCloseTo(0.5, 10)
    expect(mid.scale).toBeCloseTo((1 + DISMISS_ZOOM) / 2, 10)
    expect(mid.done).toBe(false)
  })

  it('is monotonic: opacity never rises and scale never shrinks', () => {
    let prev = dismissFrame(0)
    for (let t = 10; t <= DISMISS_MS; t += 10) {
      const f = dismissFrame(t)
      expect(f.opacity).toBeLessThanOrEqual(prev.opacity)
      expect(f.scale).toBeGreaterThanOrEqual(prev.scale)
      prev = f
    }
  })

  it('clamps out-of-range and invalid times', () => {
    expect(dismissFrame(-50)).toEqual({ opacity: 1, scale: 1, done: false })
    expect(dismissFrame(DISMISS_MS * 10)).toEqual({ opacity: 0, scale: DISMISS_ZOOM, done: true })
    expect(dismissFrame(Number.NaN).done).toBe(true)
  })

  it('honours a custom duration and zoom, and a zero duration completes at once', () => {
    expect(dismissFrame(100, 200, 3).scale).toBeCloseTo(2, 10)
    expect(dismissFrame(0, 0)).toEqual({ opacity: 0, scale: DISMISS_ZOOM, done: true })
  })
})
