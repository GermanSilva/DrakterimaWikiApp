import { describe, it, expect } from 'vitest'
import { isVisible } from './helpers.js'

const player = { id: 2, nombre: 'Aria' }

describe('isVisible', () => {
  it('DM sees everything', () => {
    for (const estado of ['publicado', 'secreto', 'borrador']) {
      expect(isVisible({ estado, visibilidad: [] }, true, null)).toBe(true)
    }
  })

  it('hides borrador from players', () => {
    expect(isVisible({ estado: 'borrador' }, false, player)).toBe(false)
  })

  it('shows publicado to everyone', () => {
    expect(isVisible({ estado: 'publicado' }, false, null)).toBe(true)
    expect(isVisible({ estado: 'publicado' }, false, player)).toBe(true)
  })

  it('shows secreto only to players listed in visibilidad', () => {
    const e = { estado: 'secreto', visibilidad: [2] }
    expect(isVisible(e, false, player)).toBe(true)
    expect(isVisible(e, false, { id: 3 })).toBe(false)
    expect(isVisible(e, false, null)).toBe(false)
    expect(isVisible({ estado: 'secreto' }, false, player)).toBe(false)
  })

  it('defaults missing estado to publicado', () => {
    expect(isVisible({}, false, null)).toBe(true)
  })
})
