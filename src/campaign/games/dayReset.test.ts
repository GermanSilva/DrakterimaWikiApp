import { describe, expect, it } from 'vitest'
import { describeDailyReset, formatLocalReset, formatTimeUntilReset, nextUtcMidnight, utcDay } from './dayReset'

describe('UTC day boundary', () => {
  it('names the UTC day, not the local one', () => {
    expect(utcDay(new Date('2026-10-08T23:30:00Z'))).toBe('2026-10-08')
    expect(utcDay(new Date('2026-10-09T00:00:00Z'))).toBe('2026-10-09')
  })

  it('resets at the next 00:00 UTC, including month and year ends', () => {
    expect(nextUtcMidnight(new Date('2026-10-08T21:00:00Z')).toISOString()).toBe('2026-10-09T00:00:00.000Z')
    expect(nextUtcMidnight(new Date('2026-10-31T23:59:59Z')).toISOString()).toBe('2026-11-01T00:00:00.000Z')
    expect(nextUtcMidnight(new Date('2026-12-31T12:00:00Z')).toISOString()).toBe('2027-01-01T00:00:00.000Z')
    expect(nextUtcMidnight(new Date('2026-10-09T00:00:00Z')).toISOString()).toBe('2026-10-10T00:00:00.000Z')
  })

  it('counts the time remaining against UTC midnight, rounding the minute up', () => {
    expect(formatTimeUntilReset(new Date('2026-10-08T21:00:00Z'))).toBe('3h 0m')
    expect(formatTimeUntilReset(new Date('2026-10-08T20:47:30Z'))).toBe('3h 13m')
    expect(formatTimeUntilReset(new Date('2026-10-08T23:59:59Z'))).toBe('0h 1m')
    expect(formatTimeUntilReset(new Date('2026-10-08T00:00:00Z'))).toBe('24h 0m')
  })

  it('shows the local equivalent of 00:00 UTC in the given time zone', () => {
    const now = new Date('2026-10-08T21:00:00Z')
    expect(formatLocalReset(now, 'UTC')).toBe('00:00')
    expect(formatLocalReset(now, 'America/Argentina/Buenos_Aires')).toBe('21:00')
    expect(formatLocalReset(now, 'Asia/Kolkata')).toBe('05:30')
  })

  it('writes the full message', () => {
    expect(describeDailyReset(new Date('2026-10-08T21:00:00Z'), 'America/Argentina/Buenos_Aires')).toBe(
      'Podés volver a jugar a las 00:00 UTC (en 3h 0m · 21:00 en tu zona horaria).',
    )
  })
})
