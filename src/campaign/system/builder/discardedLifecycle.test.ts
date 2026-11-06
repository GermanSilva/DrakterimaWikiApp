/** G9 (S26, S32): a discarded entry is deleted 60 days after its date; the DM is warned in the last 7 days. */
import { describe, expect, it } from 'vitest'
import { DISCARDED_RETENTION_DAYS, DISCARDED_WARNING_DAYS, deletionDate, expiringSoon, formatDeletionDate, isNearDeletion } from './discardedLifecycle'

const AT = '2026-09-01T10:00:00.000Z'
const DAY = 24 * 60 * 60 * 1000
const at = (now: string) => new Date(now)

describe('discarded lifecycle constants', () => {
  it('keeps for 60 days and warns 7 days before', () => {
    expect(DISCARDED_RETENTION_DAYS).toBe(60)
    expect(DISCARDED_WARNING_DAYS).toBe(7)
  })
})

describe('deletionDate / formatDeletionDate', () => {
  it('is the discard date plus 60 days', () => {
    expect(deletionDate(AT).toISOString()).toBe('2026-10-31T10:00:00.000Z')
    expect(formatDeletionDate(AT)).toBe('31/10/2026')
  })

  it('crosses a year end', () => {
    expect(formatDeletionDate('2026-11-06T10:00:00.000Z')).toBe('05/01/2027')
  })

  it('reads an unreadable date as no date', () => {
    expect(formatDeletionDate('not a date')).toBeNull()
    expect(isNearDeletion('not a date', new Date('2026-10-31T00:00:00.000Z'))).toBe(false)
  })
})

describe('isNearDeletion: the 7 day boundary (fixed clock)', () => {
  const deletion = deletionDate(AT).getTime()
  it('is not near 8 days before', () => {
    expect(isNearDeletion(AT, new Date(deletion - 8 * DAY))).toBe(false)
  })
  it('is not near 7 days and 1 second before', () => {
    expect(isNearDeletion(AT, new Date(deletion - 7 * DAY - 1000))).toBe(false)
  })
  it('is near exactly 7 days before', () => {
    expect(isNearDeletion(AT, new Date(deletion - 7 * DAY))).toBe(true)
  })
  it('is near the day before, and the day of', () => {
    expect(isNearDeletion(AT, new Date(deletion - DAY))).toBe(true)
    expect(isNearDeletion(AT, at('2026-10-31T10:00:00.000Z'))).toBe(true)
  })
  it('stays near once overdue (the daily job has not run yet)', () => {
    expect(isNearDeletion(AT, new Date(deletion + 3600 * 1000))).toBe(true)
  })
  it('a fresh entry is not near', () => {
    expect(isNearDeletion(AT, at('2026-09-02T10:00:00.000Z'))).toBe(false)
  })
})

describe('expiringSoon', () => {
  const now = at('2026-10-26T10:00:00.000Z') // 5 days before the deletion of AT
  const entries = [
    { at: AT, label: 'Cerca' },
    { at: '2026-10-20T10:00:00.000Z', label: 'Fresco' },
    { at: '2026-08-01T10:00:00.000Z', label: 'Vencido' },
  ]
  it('keeps the entries within 7 days of deletion (or overdue), in order', () => {
    expect(expiringSoon(entries, now).map((e) => e.label)).toEqual(['Cerca', 'Vencido'])
  })
  it('is empty when none is', () => {
    expect(expiringSoon([entries[1]], now)).toEqual([])
  })
})
