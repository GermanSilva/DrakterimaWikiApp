import { describe, expect, it } from 'vitest'
import { describeLastSeen } from './presenceFormat'

const NOW = new Date('2026-10-09T12:00:00Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const MIN = 60_000

describe('describeLastSeen', () => {
  it('reads "just now" within the first minute', () => {
    expect(describeLastSeen(ago(20_000), NOW)?.relative).toBe('hace instantes')
  })

  it('counts minutes, hours and days', () => {
    expect(describeLastSeen(ago(5 * MIN), NOW)?.relative).toBe('hace 5 minutos')
    expect(describeLastSeen(ago(3 * 60 * MIN), NOW)?.relative).toBe('hace 3 horas')
    expect(describeLastSeen(ago(24 * 60 * MIN), NOW)?.relative).toBe('ayer')
    expect(describeLastSeen(ago(4 * 24 * 60 * MIN), NOW)?.relative).toBe('hace 4 días')
  })

  it('falls back to the date itself after a month, which is also what the tooltip shows', () => {
    const seen = describeLastSeen(ago(45 * 24 * 60 * MIN), NOW)
    expect(seen?.relative).toBe(seen?.absolute)
    expect(seen?.absolute).toMatch(/2026/)
  })

  it('treats a timestamp slightly in the future (clock skew) as just now', () => {
    expect(describeLastSeen(new Date(NOW.getTime() + 30_000).toISOString(), NOW)?.relative).toBe('hace instantes')
  })

  it('returns null for an unparsable value', () => {
    expect(describeLastSeen('not a date', NOW)).toBeNull()
  })
})
