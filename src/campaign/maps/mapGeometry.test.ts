import { describe, expect, it } from 'vitest'
import {
  clamp01, DEFAULT_MAP_SIZE, fitImageSize, fromLeaflet, hasValidCoords, mapPath, mapsGridPath, MAX_TRAIL, parseTrail, PIN_DEFAULT_COLOR, pinColor, pinOpacity,
  toLeaflet, trailForOpening,
} from './mapGeometry'

describe('fitImageSize', () => {
  it('makes the longer side 1000 and keeps the aspect ratio', () => {
    expect(fitImageSize(4000, 2000)).toEqual({ w: 1000, h: 500 })
    expect(fitImageSize(1000, 3000)).toEqual({ w: 333, h: 1000 })
    expect(fitImageSize(800, 800)).toEqual({ w: 1000, h: 1000 })
  })

  it('never produces a zero side for an extreme aspect ratio', () => {
    expect(fitImageSize(100000, 1)).toEqual({ w: 1000, h: 1 })
  })

  it.each([
    [0, 100],
    [100, 0],
    [NaN, 100],
    [100, Infinity],
    [-5, 100],
  ])('falls back to a square for %s x %s', (w, h) => {
    expect(fitImageSize(w, h)).toEqual(DEFAULT_MAP_SIZE)
  })
})

describe('toLeaflet / fromLeaflet', () => {
  const size = { w: 1000, h: 500 }

  it('flips the y axis: the top-left of the image is (lat = h, lng = 0)', () => {
    expect(toLeaflet(size, 0, 0)).toEqual([500, 0])
    expect(toLeaflet(size, 1, 1)).toEqual([0, 1000])
    expect(toLeaflet(size, 0.25, 0.5)).toEqual([250, 250])
  })

  it('round-trips a position', () => {
    const [lat, lng] = toLeaflet(size, 0.3, 0.8)
    const back = fromLeaflet(size, { lat, lng })
    expect(back?.x).toBeCloseTo(0.3)
    expect(back?.y).toBeCloseTo(0.8)
  })

  it('clamps a click on the margin around the image to its edge (the database allows 0..1 only)', () => {
    expect(fromLeaflet(size, { lat: -80, lng: 1400 })).toEqual({ x: 1, y: 1 })
    expect(fromLeaflet(size, { lat: 900, lng: -20 })).toEqual({ x: 0, y: 0 })
  })

  it('returns null for a non-finite point instead of NaN coordinates', () => {
    expect(fromLeaflet(size, { lat: NaN, lng: 10 })).toBeNull()
    expect(fromLeaflet(size, { lat: 10, lng: Infinity })).toBeNull()
  })

  it('clamp01 bounds a value', () => {
    expect([clamp01(-1), clamp01(0.4), clamp01(7)]).toEqual([0, 0.4, 1])
  })
})

describe('hasValidCoords', () => {
  it('accepts finite numbers only', () => {
    expect(hasValidCoords({ x: 0, y: 1 })).toBe(true)
    expect(hasValidCoords({ x: NaN, y: 1 })).toBe(false)
    expect(hasValidCoords({ x: '0.5', y: 0.5 })).toBe(false)
    expect(hasValidCoords({ x: null, y: undefined })).toBe(false)
    expect(hasValidCoords({ x: Infinity, y: 0 })).toBe(false)
  })
})

describe('pins', () => {
  it('colours by link type and falls back for none / unknown / prototype names', () => {
    expect(pinColor('lugar')).toBe('#dc2626')
    expect(pinColor('mapa')).toBe('#eab308')
    expect(pinColor(null)).toBe(PIN_DEFAULT_COLOR)
    expect(pinColor('raro')).toBe(PIN_DEFAULT_COLOR)
    expect(pinColor('constructor')).toBe(PIN_DEFAULT_COLOR)
    expect(pinColor('__proto__')).toBe(PIN_DEFAULT_COLOR)
  })

  it('opacity: DM sees drafts and secrets faded, a player never gets a draft', () => {
    expect(pinOpacity('publicado', true)).toBe(1)
    expect(pinOpacity(undefined, false)).toBe(1)
    expect(pinOpacity('borrador', true)).toBe(0.4)
    expect(pinOpacity('secreto', true)).toBe(0.4)
    expect(pinOpacity('borrador', false)).toBeNull()
    // a secret pin that reached a player was shared with them (RLS); visible_to is hidden from players
    expect(pinOpacity('secreto', false)).toBe(1)
  })
})

describe('trail in the URL', () => {
  it('parses ids oldest first, deduped, ignoring nothing malformed', () => {
    expect(parseTrail('3,7')).toEqual([3, 7])
    expect(parseTrail('3,7,3')).toEqual([3, 7])
    expect(parseTrail(null)).toEqual([])
    expect(parseTrail('')).toEqual([])
  })

  it.each(['3,,7', 'a', '3,x', '-1', '0', '1.5', '1e3', ' 3', '3,0', '99999999999999999'])('rejects the whole value %j', (raw) => {
    expect(parseTrail(raw)).toEqual([])
  })

  it('keeps only the most recent MAX_TRAIL entries', () => {
    const raw = Array.from({ length: MAX_TRAIL + 3 }, (_, i) => i + 1).join(',')
    expect(parseTrail(raw)).toHaveLength(MAX_TRAIL)
    expect(parseTrail(raw).at(-1)).toBe(MAX_TRAIL + 3)
  })

  it('builds paths with an encoded slug and an optional trail', () => {
    expect(mapPath('demo', 5)).toBe('/c/demo/mapas/5')
    expect(mapPath('demo', 5, [1, 2])).toBe('/c/demo/mapas/5?trail=1,2')
    expect(mapPath('a b', 5)).toBe('/c/a%20b/mapas/5')
    expect(mapsGridPath('demo')).toBe('/c/demo/mapas?todos=1')
  })

  it('opening a map pushes the current one on the trail; revisiting an ancestor goes back; the current map is a no-op', () => {
    expect(trailForOpening([], 1, 2)).toEqual([1])
    expect(trailForOpening([1], 2, 3)).toEqual([1, 2])
    expect(trailForOpening([1, 2], 3, 1)).toEqual([])
    expect(trailForOpening([1, 2], 3, 2)).toEqual([1])
    expect(trailForOpening([1], 2, 2)).toBeNull()
  })
})
