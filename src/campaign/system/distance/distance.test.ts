import { describe, expect, it } from 'vitest'
import {
  convert,
  formatDistance,
  parseDistanceMarkup,
  readDistance,
  renderDistanceMarkup,
  validateDistance,
  type DistanceConfig,
  type DistanceUnit,
} from './distance'

const CONFIG: DistanceConfig = {
  main: 'ft',
  units: [
    { key: 'ft', label: 'Pies', value: 1, decimals: 0 },
    { key: 'm', label: 'Metros', value: 3.28084, decimals: 1 },
    { key: 'c', label: 'Casilleros', value: 5, decimals: 0 },
  ],
}
const unit = (key: string) => CONFIG.units.find((u) => u.key === key)!
const tenths: DistanceUnit = { key: 't', label: 'T', value: 0.1, decimals: 0 }

describe('convert', () => {
  it('floors to the precision of the target unit (15 ft is 4.5 m, 3 squares)', () => {
    expect(convert(15, unit('ft'), unit('m'))).toBe(4.5)
    expect(convert(15, unit('ft'), unit('c'))).toBe(3)
  })

  it('is exact on float boundaries (30 ft is exactly 6 squares, 0.3 in tenths is 3)', () => {
    expect(convert(30, unit('ft'), unit('c'))).toBe(6)
    expect(convert(0.3, unit('ft'), tenths)).toBe(3)
    expect(convert(0.7, unit('ft'), tenths)).toBe(7)
  })

  it('rounds DOWN, never to nearest', () => {
    expect(convert(1, unit('ft'), unit('m'))).toBe(0.3) // 0.3048
    expect(convert(4, unit('ft'), unit('m'))).toBe(1.2) // 1.2192
    expect(convert(1, unit('m'), unit('ft'))).toBe(3) // 3.28084
    expect(convert(7, unit('ft'), unit('c'))).toBe(1) // 1.4
    expect(convert(4, unit('ft'), unit('c'))).toBe(0) // 0.8
    expect(convert(9, unit('ft'), unit('c'))).toBe(1) // 1.8 would round to 2
  })

  it('honours precision 0, 1 and 2', () => {
    const d2: DistanceUnit = { key: 'x', label: 'X', value: 1.5, decimals: 2 }
    expect(convert(1, unit('ft'), d2)).toBe(0.66) // 0.666..
    expect(convert(1, unit('ft'), { ...d2, decimals: 1 })).toBe(0.6)
    expect(convert(1, unit('ft'), { ...d2, decimals: 0 })).toBe(0)
  })

  it('converts to the same unit (floored to its own precision) and keeps zero', () => {
    expect(convert(4.57, unit('m'), unit('m'))).toBe(4.5)
    expect(convert(0, unit('ft'), unit('m'))).toBe(0)
  })

  it('returns NaN for amounts that cannot be converted', () => {
    expect(convert(-1, unit('ft'), unit('m'))).toBeNaN()
    expect(convert(Number.NaN, unit('ft'), unit('m'))).toBeNaN()
    expect(convert(Number.POSITIVE_INFINITY, unit('ft'), unit('m'))).toBeNaN()
  })
})

describe('formatDistance', () => {
  it('renders every unit in declared order with the Spanish comma', () => {
    expect(formatDistance('15', 'ft', CONFIG, 'es')).toBe('[15ft|4,5m|3c]')
  })

  it('uses the point for non-Spanish locales', () => {
    expect(formatDistance('15', 'ft', CONFIG, 'en')).toBe('[15ft|4.5m|3c]')
    expect(formatDistance('15', 'ft', CONFIG, 'es-AR')).toBe('[15ft|4,5m|3c]')
  })

  it('keeps the referenced amount as written (comma or point) and shows it with the locale separator', () => {
    expect(formatDistance('4,5', 'ft', CONFIG, 'es')).toBe('[4,5ft|1,3m|0c]')
    expect(formatDistance('4.5', 'ft', CONFIG, 'es')).toBe('[4,5ft|1,3m|0c]')
    expect(formatDistance('4,5', 'ft', CONFIG, 'en')).toBe('[4.5ft|1.3m|0c]')
  })

  it('references a unit that is not the first, keeping declared order', () => {
    expect(formatDistance('4,5', 'm', CONFIG, 'es')).toBe('[14ft|4,5m|2c]')
    expect(formatDistance('6', 'c', CONFIG, 'es')).toBe('[30ft|9,1m|6c]')
  })

  it('accepts a number amount', () => {
    expect(formatDistance(15, 'ft', CONFIG, 'es')).toBe('[15ft|4,5m|3c]')
  })

  it('does not pad with zeros (6 m with one decimal shows 6m)', () => {
    expect(formatDistance('6', 'm', CONFIG, 'es')).toBe('[19ft|6m|3c]')
  })

  it('returns null (caller keeps the original text) for unknown unit, no config or bad amount', () => {
    expect(formatDistance('15', 'yd', CONFIG, 'es')).toBeNull()
    expect(formatDistance('15', 'ft', undefined, 'es')).toBeNull()
    expect(formatDistance('15', 'ft', null, 'es')).toBeNull()
    expect(formatDistance('15', 'ft', { main: 'ft', units: [] }, 'es')).toBeNull()
    for (const bad of ['', 'abc', '-5', '1e3', '1,2,3', '.5', '5.', ' 5', Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(formatDistance(bad, 'ft', CONFIG, 'es'), String(bad)).toBeNull()
    }
  })

  it('never throws on prototype-like unit keys', () => {
    expect(formatDistance('1', 'constructor', CONFIG, 'es')).toBeNull()
    expect(formatDistance('1', '__proto__', CONFIG, 'es')).toBeNull()
  })
})

describe('parseDistanceMarkup', () => {
  it('reads [[{D:key}amount]]', () => {
    expect(parseDistanceMarkup('[[{D:ft}15]]')).toEqual({ unitKey: 'ft', amount: '15' })
    expect(parseDistanceMarkup('[[{D:ft}4,5]]')).toEqual({ unitKey: 'ft', amount: '4,5' })
    expect(parseDistanceMarkup('[[{D:ft}4.5]]')).toEqual({ unitKey: 'ft', amount: '4.5' })
    expect(parseDistanceMarkup('[[{D:unidad_2}0]]')).toEqual({ unitKey: 'unidad_2', amount: '0' })
  })

  it('rejects anything else', () => {
    for (const text of [
      '[[{D:FT}15]]', '[[{D:ft}]]', '[[{D:ft}15 ]]', '[[{D}15]]', '[[{D1}15]]', '[[{D:}15]]', '[[{D:1a}15]]',
      '[[{D:ft}1e3]]', '[[{D:ft}-1]]', '[[{D:ft}1.]]', '[[{D:ft}.5]]', '[[{D:ft}abc]]', '[[{1S}15]]', 'text', '',
      `[[{D:${'a'.repeat(41)}}15]]`, '[[{D:ft}1234567890123]]',
    ]) {
      expect(parseDistanceMarkup(text), text).toBeNull()
    }
  })
})

describe('renderDistanceMarkup', () => {
  it('formats a valid reference', () => {
    expect(renderDistanceMarkup('[[{D:ft}15]]', CONFIG, 'es')).toBe('[15ft|4,5m|3c]')
  })

  it('returns the original markup unchanged when it cannot be formatted', () => {
    expect(renderDistanceMarkup('[[{D:yd}15]]', CONFIG, 'es')).toBe('[[{D:yd}15]]')
    expect(renderDistanceMarkup('[[{D:ft}15]]', undefined, 'es')).toBe('[[{D:ft}15]]')
    expect(renderDistanceMarkup('[[{D:ft}abc]]', CONFIG, 'es')).toBe('[[{D:ft}abc]]')
    expect(renderDistanceMarkup('[[{Dx}15]]', CONFIG, 'es')).toBe('[[{Dx}15]]')
  })
})

describe('validateDistance', () => {
  const one = (patch: Record<string, unknown>) =>
    validateDistance({ main: 'ft', units: [{ key: 'ft', label: 'Pies', value: 1, decimals: 0, ...patch }] })

  it('accepts a valid document and returns it normalised (labels trimmed, unknown properties dropped)', () => {
    const raw = {
      main: 'm',
      extra: 1,
      units: [
        { key: 'ft', label: ' Pies ', value: 1, decimals: 0, junk: true },
        { key: 'm', label: 'Metros', value: 3.28084, decimals: 2 },
      ],
    }
    expect(validateDistance(raw)).toEqual({
      ok: true,
      distance: {
        main: 'm',
        units: [
          { key: 'ft', label: 'Pies', value: 1, decimals: 0 },
          { key: 'm', label: 'Metros', value: 3.28084, decimals: 2 },
        ],
      },
    })
  })

  it('accepts 1 and 8 units, rejects 0 and 9', () => {
    const mk = (n: number) => ({
      main: 'u1',
      units: Array.from({ length: n }, (_, i) => ({ key: `u${i + 1}`, label: `U${i + 1}`, value: 1, decimals: 0 })),
    })
    expect(validateDistance(mk(1)).ok).toBe(true)
    expect(validateDistance(mk(8)).ok).toBe(true)
    expect(validateDistance(mk(9))).toEqual({ ok: false, path: 'distance.units' })
    expect(validateDistance({ main: 'u1', units: [] })).toEqual({ ok: false, path: 'distance.units' })
  })

  it('rejects a non-object, a missing/unknown main and non-array units', () => {
    expect(validateDistance(null)).toEqual({ ok: false, path: 'distance' })
    expect(validateDistance([])).toEqual({ ok: false, path: 'distance' })
    expect(validateDistance({ main: 'yd', units: CONFIG.units })).toEqual({ ok: false, path: 'distance.main' })
    expect(validateDistance({ units: CONFIG.units })).toEqual({ ok: false, path: 'distance.main' })
    expect(validateDistance({ main: 'ft', units: {} })).toEqual({ ok: false, path: 'distance.units' })
  })

  it('rejects bad keys and accepts 40 characters', () => {
    for (const key of ['Ft', '1a', 'a-b', '', 'a'.repeat(41), 'constructor', 'prototype', 7]) {
      expect(one({ key }), String(key)).toEqual({ ok: false, path: 'distance.units[0].key' })
    }
    const long = 'a'.repeat(40)
    expect(validateDistance({ main: long, units: [{ key: long, label: 'L', value: 1, decimals: 0 }] }).ok).toBe(true)
  })

  it('rejects duplicate keys at the second one', () => {
    const units = [CONFIG.units[0], { ...CONFIG.units[1], key: 'ft' }]
    expect(validateDistance({ main: 'ft', units })).toEqual({ ok: false, path: 'distance.units[1].key' })
  })

  it('rejects bad labels', () => {
    for (const label of ['', '   ', 'a'.repeat(61), 'a\nb', 'a\u200bb', 4]) {
      expect(one({ label }), String(label)).toEqual({ ok: false, path: 'distance.units[0].label' })
    }
    expect(one({ label: 'a'.repeat(60) }).ok).toBe(true)
  })

  it('rejects values that are not positive finite numbers in range', () => {
    for (const value of [0, -1, '1', null, 1e13, 1e-7, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(one({ value }), String(value)).toEqual({ ok: false, path: 'distance.units[0].value' })
    }
    expect(one({ value: 1e12 }).ok).toBe(true)
    expect(one({ value: 1e-6 }).ok).toBe(true)
  })

  it('rejects decimals other than the integers 0..2', () => {
    for (const decimals of [3, -1, 1.5, '1', null, undefined]) {
      expect(one({ decimals }), String(decimals)).toEqual({ ok: false, path: 'distance.units[0].decimals' })
    }
    for (const decimals of [0, 1, 2]) expect(one({ decimals }).ok).toBe(true)
  })
})

describe('readDistance', () => {
  it('returns the normalised config, or undefined for anything absent or invalid (never throws)', () => {
    expect(readDistance(CONFIG)).toEqual(CONFIG)
    expect(readDistance(undefined)).toBeUndefined()
    expect(readDistance({ main: 'x', units: [] })).toBeUndefined()
    expect(readDistance('nope')).toBeUndefined()
  })
})
