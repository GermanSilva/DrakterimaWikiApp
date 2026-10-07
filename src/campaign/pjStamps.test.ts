import { describe, expect, it, vi } from 'vitest'
import type { FlatEntity } from '../data'
import { markSectionsSeen, pjSectionStamps } from './pjStamps'

const entity = (over: Record<string, unknown> = {}) => ({ id: 3, campaign_id: 'c1', updated_at: '2026-02-01T00:00:00Z', ...over }) as FlatEntity

describe('markSectionsSeen', () => {
  it('uses the stamp the server stored (clamped), not the one the client sent', () => {
    const unread = { isUnread: () => false, markRead: vi.fn() }
    markSectionsSeen(unread, entity({ sections_updated: { equipo: '2026-01-05T00:00:00Z' } }), {
      sections: ['equipo', 'general'],
      stamps: { equipo: '2099-01-01T00:00:00Z', general: '2099-01-01T00:00:00Z' },
    })
    expect(unread.markRead).toHaveBeenCalledWith('pjs', 3, '2026-01-05T00:00:00Z', 'equipo')
    // a section the server did not return falls back to the client stamp
    expect(unread.markRead).toHaveBeenCalledWith('pjs', 3, '2099-01-01T00:00:00Z', 'general')
  })

  it.each([
    ['a number', 123],
    ['null', null],
    ['an object', { at: 'x' }],
    ['a string (used as stored)', '2026-01-05T00:00:00Z'],
  ])('uses the stored stamp only when it is a string: %s', (_label, server) => {
    const unread = { isUnread: () => false, markRead: vi.fn() }
    markSectionsSeen(unread, entity({ sections_updated: { equipo: server } }), { sections: ['equipo'], stamps: { equipo: 'CLIENT' } })
    expect(unread.markRead).toHaveBeenCalledWith('pjs', 3, typeof server === 'string' ? server : 'CLIENT', 'equipo')
  })

  it.each([
    ['a missing sections_updated', undefined],
    ['a string container', 'x'],
    ['null', null],
    ['an array', ['2026-01-05T00:00:00Z']],
  ])('falls back to the client stamp with %s', (_label, container) => {
    const unread = { isUnread: () => false, markRead: vi.fn() }
    markSectionsSeen(unread, entity({ sections_updated: container }), { sections: ['equipo'], stamps: { equipo: 'CLIENT' } })
    expect(unread.markRead).toHaveBeenCalledWith('pjs', 3, 'CLIENT', 'equipo')
  })

  it('tolerates a missing or malformed sections_updated', () => {
    const unread = { isUnread: () => false, markRead: vi.fn() }
    markSectionsSeen(unread, entity({ sections_updated: 'x' }), { sections: ['equipo'], stamps: { equipo: 'T' } })
    markSectionsSeen(unread, entity(), { sections: ['equipo'], stamps: { equipo: 'T' } })
    expect(unread.markRead).toHaveBeenCalledTimes(2)
  })
})

describe('pjSectionStamps', () => {
  it('stamps only the sections the patch really changes', () => {
    const e = entity({ equipo: [{ id: 1, nombre: 'Soga' }] })
    expect(pjSectionStamps(e, { equipo: [{ id: 1, nombre: 'Soga', portando: false }] }).sections).toEqual(['equipo'])
    expect(pjSectionStamps(e, { equipo: [{ id: 1, nombre: 'Soga' }] }).sections).toEqual([])
  })
})
