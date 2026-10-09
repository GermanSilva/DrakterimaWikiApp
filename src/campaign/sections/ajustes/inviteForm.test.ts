import { describe, expect, it } from 'vitest'
import { DataError } from '../../../data'
import { createInviteErrorMessage, expiryOptions, inviteStatus, inviteUrl } from './inviteForm'

const NOW = new Date('2026-10-09T12:00:00Z')

describe('inviteStatus', () => {
  const base = { uses: 0, max_uses: 2, expires_at: '2026-10-10T00:00:00Z' }
  it('is active while it has uses left and has not expired', () => {
    expect(inviteStatus(base, NOW)).toBe('active')
    expect(inviteStatus({ ...base, expires_at: null }, NOW)).toBe('active')
  })
  it('is expired exactly at its expiry instant (the database uses <=)', () => {
    expect(inviteStatus({ ...base, expires_at: NOW.toISOString() }, NOW)).toBe('expired')
  })
  it('is used when the uses reach the maximum, even if it is also expired', () => {
    expect(inviteStatus({ ...base, uses: 2 }, NOW)).toBe('used')
    expect(inviteStatus({ ...base, uses: 2, expires_at: '2020-01-01T00:00:00Z' }, NOW)).toBe('used')
  })
})

describe('invite helpers', () => {
  it('limits a DM invite to the 7 days the database enforces', () => {
    expect(expiryOptions('dm')).toEqual([1, 3, 7])
    expect(expiryOptions('player')).toContain(30)
  })
  it('builds the shareable link from the origin and the code', () => {
    expect(inviteUrl('https://app.test', 'abc')).toBe('https://app.test/invite/abc')
  })
  it('maps trigger reasons to Spanish and hides anything unknown', () => {
    expect(createInviteErrorMessage(new DataError('validation', 'character_already_owned', undefined, 'character_already_owned'))).toMatch(/ya tiene jugador/)
    expect(createInviteErrorMessage(new DataError('validation', 'character_already_has_pending_invite', undefined, 'character_already_has_pending_invite'))).toMatch(/vigente/)
    expect(createInviteErrorMessage(new DataError('permission', 'x'))).toMatch(/Solo el DM/)
    expect(createInviteErrorMessage(new Error('pg internals'))).toBe('No pudimos crear la invitación. Volvé a intentar.')
  })
})
