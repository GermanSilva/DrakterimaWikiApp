import { describe, expect, it, vi } from 'vitest'
import { createLegacyUnreadPort } from './legacyPorts'

const readState = [
  { id: 'dm_pjs_1_stats', seenAt: '2026-02-01T00:00:00Z' },
  { id: '3_pjs_1_equipo', seenAt: '2026-02-01T00:00:00Z' },
  { id: 'dm_pjs_1', seenAt: '2026-05-01T00:00:00Z' },
]

function port(over = {}) {
  const markRead = vi.fn()
  const markSectionRead = vi.fn()
  const p = createLegacyUnreadPort({ db: { read_state: readState }, isDM: true, currentPlayer: null, markRead, markSectionRead, ...over })
  return { p, markRead, markSectionRead }
}

describe('legacy UnreadPort honours the section argument', () => {
  it('reads the section key of the viewer (dm / player id): unread only when the stamp is newer than seenAt', () => {
    const { p } = port()
    expect(p.isUnread('pjs', 1, '2026-03-01T00:00:00Z', 'stats')).toBe(true)
    expect(p.isUnread('pjs', 1, '2026-01-01T00:00:00Z', 'stats')).toBe(false)
    expect(p.isUnread('pjs', 1, '2026-03-01T00:00:00Z', 'ataques')).toBe(true) // never seen
    expect(p.isUnread('pjs', 1, '2026-03-01T00:00:00Z')).toBe(false) // the whole-entity row is a different key
    const player = port({ isDM: false, currentPlayer: { id: 3 } }).p
    expect(player.isUnread('pjs', 1, '2026-03-01T00:00:00Z', 'equipo')).toBe(true)
    expect(player.isUnread('pjs', 1, '2026-01-01T00:00:00Z', 'equipo')).toBe(false)
    expect(player.isUnread('pjs', 1, '2026-03-01T00:00:00Z', 'stats')).toBe(true) // the DM's row is not theirs
  })

  it('without a viewer nothing is unread (the old guard), and without a stamp neither', () => {
    const { p } = port({ isDM: false, currentPlayer: null })
    expect(p.isUnread('pjs', 1, '2026-03-01T00:00:00Z', 'stats')).toBe(false)
    expect(port().p.isUnread('pjs', 1, null, 'stats')).toBe(false)
  })

  it('markRead with a section goes to markSectionRead(id, section); without one to markRead(type, id)', () => {
    const { p, markRead, markSectionRead } = port()
    p.markRead('pjs', 1, '2026-03-01T00:00:00Z', 'stats')
    expect(markSectionRead).toHaveBeenCalledWith(1, 'stats')
    expect(markRead).not.toHaveBeenCalled()
    p.markRead('pnjs', 4, '2026-03-01T00:00:00Z')
    expect(markRead).toHaveBeenCalledWith('pnjs', 4)
  })
})
