import { describe, expect, it } from 'vitest'
import { accentStyle } from './branding'

describe('accentStyle', () => {
  it('sets the hex and every RGB triplet together, from the same parsed value', () => {
    const style = accentStyle({ accent_color: '#1E90FF' }) as Record<string, string>
    expect(Object.keys(style).sort()).toEqual(
      ['--accent', '--accent-bright-rgb', '--accent-dim-rgb', '--accent-rgb', '--accent-subtle-rgb'].sort(),
    )
    expect(style['--accent']).toBe('#1e90ff')
    // the base triplet is exactly the hex, channel by channel
    const hex = style['--accent'].slice(1)
    const channels = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
    expect(style['--accent-rgb']).toBe(channels.join(' '))
  })

  it('sets none of them for an invalid colour (never a partial palette)', () => {
    expect(accentStyle({ accent_color: 'red' })).toBeUndefined()
    expect(accentStyle({})).toBeUndefined()
  })

  it('only emits digits and spaces in the triplets', () => {
    const style = accentStyle({ accent_color: '#ff0000' }) as Record<string, string>
    for (const [key, value] of Object.entries(style)) {
      if (key.endsWith('-rgb')) expect(value).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/)
    }
  })
})
