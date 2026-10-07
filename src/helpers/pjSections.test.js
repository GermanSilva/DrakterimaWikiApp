import { describe, expect, it, vi } from 'vitest'
import { changedPjFields, changedPjSections, isPjUnreadVia, isSectionUnreadVia } from './pjSections'

describe('changedPjFields', () => {
  it('keeps real edits and treats empty defaults as equal to a missing key', () => {
    const entity = { nombre: 'A', stat_hp: 10, hechizos: [], monedas: { gp: 0 } }
    const values = { nombre: 'A', stat_hp: 0, stat_str: 0, apariencia: '', hechizos: [], monedas: { gp: 0 }, clase: 'Mago' }
    // stat_hp 10 -> 0 IS an edit; the defaults the entity lacks are not
    expect(changedPjFields(entity, values)).toEqual({ stat_hp: 0, clase: 'Mago' })
  })

  it('compares objects and arrays by content, ignoring key order', () => {
    expect(changedPjFields({ monedas: { gp: 1, cp: 2 } }, { monedas: { cp: 2, gp: 1 } })).toEqual({})
    expect(changedPjFields({ monedas: { gp: 1 } }, { monedas: { gp: 2 } })).toEqual({ monedas: { gp: 2 } })
  })
})

describe('changedPjSections', () => {
  it('maps fields to their sections and everything else to "general"', () => {
    expect(changedPjSections({ monedas: { gp: 1 } }, { monedas: { gp: 2 } })).toEqual(['equipo'])
    expect(changedPjSections({ nombre: 'A', notas: '' }, { nombre: 'B', notas: 'dm' }).sort()).toEqual(['dm', 'general'])
    expect(changedPjSections({ custom_fields: { a: 'x' } }, { custom_fields: { a: 'y' } })).toEqual(['narrativa'])
    expect(changedPjSections({ stat_hp: 1, sections_updated: {} }, { stat_hp: 1, sections_updated: { x: 'y' } })).toEqual([])
  })
})

describe('port-based unread', () => {
  const pj = {
    id: 7,
    equipo: [{ id: 1 }],
    sections_updated: { stats: '2026-01-02T00:00:00Z', equipo: '2026-01-03T00:00:00Z', dm: '2026-01-04T00:00:00Z', ataques: '2026-01-05T00:00:00Z' },
  }
  const port = (unread) => ({ isUnread: vi.fn((_type, _id, _at, section) => unread.includes(section)), markRead: vi.fn() })

  it('asks the port with the section stamp and section key', () => {
    const p = port(['stats'])
    expect(isSectionUnreadVia(p, pj, 'stats', false)).toBe(true)
    expect(p.isUnread).toHaveBeenCalledWith('pjs', 7, '2026-01-02T00:00:00Z', 'stats')
    expect(isSectionUnreadVia(p, pj, 'equipo', false)).toBe(false)
  })

  it('a section without a stamp, or that is not shown, is never unread', () => {
    const p = port(['habilidades', 'ataques', 'dm'])
    expect(isSectionUnreadVia(p, pj, 'habilidades', false)).toBe(false) // no stamp
    expect(isSectionUnreadVia(p, pj, 'ataques', false)).toBe(false) // the character has no attacks: section not shown
    expect(isSectionUnreadVia(p, pj, 'dm', false)).toBe(false) // only the DM, with notes, sees "dm"
    expect(isSectionUnreadVia(p, pj, 'dm', true)).toBe(true)
  })

  it('with a dmStamp (hub) the dm section uses it and ignores sections_updated.dm; null means "no stamp"', () => {
    const p = port(['dm'])
    expect(isSectionUnreadVia(p, pj, 'dm', true, '2026-06-01T00:00:00Z')).toBe(true)
    expect(p.isUnread).toHaveBeenLastCalledWith('pjs', 7, '2026-06-01T00:00:00Z', 'dm')
    expect(isSectionUnreadVia(p, pj, 'dm', true, null)).toBe(false)
    expect(isPjUnreadVia(port(['dm']), { id: 1, sections_updated: {} }, true, '2026-06-01T00:00:00Z')).toBe(true)
    expect(isPjUnreadVia(port(['dm']), { id: 1, sections_updated: { dm: 'x' } }, true, null)).toBe(false)
  })

  it('a character is unread when any shown section is', () => {
    expect(isPjUnreadVia(port([]), pj, true)).toBe(false)
    expect(isPjUnreadVia(port(['equipo']), pj, false)).toBe(true)
    expect(isPjUnreadVia(port(['dm']), pj, false)).toBe(false)
  })
})
