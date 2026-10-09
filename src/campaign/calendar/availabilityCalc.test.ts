import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { BusySlot, Disponibilidad, PlayerAvailability } from '../../data'
import {
  MEMBER_PALETTE, addDaysStr, asBlock, blockOverlapsDay, blocksOverlap, buildMemberMarkers, buildMonthCells, clipBlockToDay,
  conflictingUserIds, initialsOf, monthDates, rowsForCampaign, sessionSlotsOnDay, shortTime, userIdsAvailableOnDay,
  userIdsBusyOnDay, userIdsUnavailableOnDay,
} from './availabilityCalc'

const row = (id: number, user_id: string, over: Partial<PlayerAvailability> = {}): PlayerAvailability => ({
  id, user_id, campaign_id: null, tipo: 'personal', fecha: null, fecha_inicio: '2026-03-06', fecha_fin: '2026-03-06',
  hora_inicio: '18:00', hora_fin: '22:00', created_at: '', updated_at: '', ...over,
})
const off = (id: number, user_id: string, fecha: string): PlayerAvailability =>
  row(id, user_id, { tipo: 'no_disponible', fecha, fecha_inicio: null, fecha_fin: null, hora_inicio: null, hora_fin: null })
const busy = (user_id: string, fecha_inicio: string, hora_inicio: string, fecha_fin = fecha_inicio, hora_fin = '23:00'): BusySlot => ({
  user_id, fecha_inicio, fecha_fin, hora_inicio, hora_fin,
})
const block = (fecha_inicio: string, hora_inicio: string, fecha_fin: string, hora_fin: string) => ({ fecha_inicio, hora_inicio, fecha_fin, hora_fin })

describe('dates and windows', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDaysStr('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDaysStr('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysStr('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('lists every date of a 0-based month', () => {
    const feb = monthDates(2028, 1)
    expect(feb).toHaveLength(29)
    expect(feb[0]).toBe('2028-02-01')
    expect(feb.at(-1)).toBe('2028-02-29')
  })

  it('normalises Postgres times', () => {
    expect(shortTime('18:00:00')).toBe('18:00')
    expect(shortTime('18:00')).toBe('18:00')
  })

  it('builds a block only when the four bounds exist', () => {
    expect(asBlock({ fecha_inicio: '2026-03-06', fecha_fin: '2026-03-06', hora_inicio: '18:00', hora_fin: '20:00' })).not.toBeNull()
    expect(asBlock({ fecha_inicio: '2026-03-06', fecha_fin: null, hora_inicio: '18:00', hora_fin: '20:00' })).toBeNull()
    expect(asBlock({ fecha_inicio: null, fecha_fin: null, hora_inicio: null, hora_fin: null })).toBeNull()
  })
})

describe('overlap with a day (06:00 to 06:00)', () => {
  it('counts an evening block, a block past midnight and a multi-day block', () => {
    expect(blockOverlapsDay(block('2026-03-06', '18:00', '2026-03-06', '22:00'), '2026-03-06')).toBe(true)
    // 02:00 of the 7th still belongs to the evening of the 6th
    expect(blockOverlapsDay(block('2026-03-06', '23:00', '2026-03-07', '02:00'), '2026-03-06')).toBe(true)
    expect(blockOverlapsDay(block('2026-03-06', '23:00', '2026-03-07', '02:00'), '2026-03-07')).toBe(false)
    expect(blockOverlapsDay(block('2026-03-05', '10:00', '2026-03-08', '10:00'), '2026-03-06')).toBe(true)
  })

  it('treats a block ending exactly at 06:00 as not touching the next day', () => {
    expect(blockOverlapsDay(block('2026-03-06', '22:00', '2026-03-07', '06:00'), '2026-03-07')).toBe(false)
  })

  it('clips a block to minutes inside the window', () => {
    expect(clipBlockToDay(block('2026-03-06', '18:00', '2026-03-06', '20:00'), '2026-03-06')).toEqual({ startMin: 720, endMin: 840 })
    expect(clipBlockToDay(block('2026-03-06', '04:00', '2026-03-06', '08:00'), '2026-03-06')).toEqual({ startMin: 0, endMin: 120 })
    expect(clipBlockToDay(block('2026-03-06', '18:00', '2026-03-06', '20:00'), '2026-03-08')).toBeNull()
  })

  it('tells overlapping ranges from ranges that only touch', () => {
    const a = block('2026-03-06', '18:00', '2026-03-06', '20:00')
    expect(blocksOverlap(a, block('2026-03-06', '19:00', '2026-03-06', '21:00'))).toBe(true)
    expect(blocksOverlap(a, block('2026-03-06', '20:00', '2026-03-06', '22:00'))).toBe(false)
    expect(blocksOverlap(a, block('2026-03-06', '21:00', '2026-03-06', '22:00'))).toBe(false)
  })
})

describe('who is on a day', () => {
  it('lists users with a personal window, once each, and ignores full-day markers and incomplete rows', () => {
    const rows = [row(1, 'ana'), row(2, 'ana'), row(3, 'beto', { fecha_inicio: '2026-03-07', fecha_fin: '2026-03-07' }), off(4, 'cris', '2026-03-06'), row(5, 'dani', { hora_fin: null })]
    expect(userIdsAvailableOnDay(rows, '2026-03-06')).toEqual(['ana'])
    expect(userIdsAvailableOnDay(rows, '2026-03-07')).toEqual(['beto'])
  })

  it('lists users that marked the full day unavailable', () => {
    const rows = [off(1, 'ana', '2026-03-06'), off(2, 'ana', '2026-03-06'), off(3, 'beto', '2026-03-07'), row(4, 'cris')]
    expect(userIdsUnavailableOnDay(rows, '2026-03-06')).toEqual(['ana'])
  })

  it('lists users booked by another campaign on that day', () => {
    const slots = [busy('ana', '2026-03-06', '19:00'), busy('beto', '2026-03-09', '19:00')]
    expect(userIdsBusyOnDay(slots, '2026-03-06')).toEqual(['ana'])
    expect(userIdsBusyOnDay(slots, '2026-03-10')).toEqual([])
  })

  it('builds the cell of every day of the month', () => {
    const cells = buildMonthCells([row(1, 'ana'), off(2, 'beto', '2026-03-10')], [busy('cris', '2026-03-31', '20:00')], 2026, 2)
    expect(Object.keys(cells)).toHaveLength(31)
    expect(cells['2026-03-06']).toEqual({ available: ['ana'], unavailable: [], busy: [] })
    expect(cells['2026-03-10'].unavailable).toEqual(['beto'])
    expect(cells['2026-03-31'].busy).toEqual(['cris'])
  })

  it('finds session slots overlapping a day', () => {
    const slot = (id: number, fecha: string, hi: string | null): Disponibilidad => ({
      id, campaign_id: 'c1', tipo: 'sesion', fecha_inicio: fecha, fecha_fin: fecha, hora_inicio: hi, hora_fin: hi && '22:00', created_by: null, created_at: '', updated_at: '',
    })
    expect(sessionSlotsOnDay([slot(1, '2026-03-06', '18:00'), slot(2, '2026-03-07', '18:00'), slot(3, '2026-03-06', null)], '2026-03-06').map((s) => s.id)).toEqual([1])
  })
})

describe('rowsForCampaign', () => {
  const members = new Set(['ana', 'beto'])
  it('keeps the general rows of members and rows pinned to this campaign, drops everything else', () => {
    const rows = [
      row(1, 'ana'),
      row(2, 'ana', { campaign_id: 'c1' }),
      row(3, 'ana', { campaign_id: 'other' }),
      row(4, 'outsider'), // shares another campaign with the viewer, not this one
      row(5, 'beto', { campaign_id: 'c1' }),
    ]
    expect(rowsForCampaign(rows, 'c1', members).map((r) => r.id)).toEqual([1, 2, 5])
  })
})

describe('session conflicts', () => {
  it('names the wanted users whose busy slot overlaps the candidate session', () => {
    const slots = [busy('ana', '2026-03-06', '19:00'), busy('beto', '2026-03-06', '12:00', '2026-03-06', '14:00'), busy('cris', '2026-03-06', '19:00')]
    const candidate = block('2026-03-06', '18:00', '2026-03-06', '22:00')
    expect(conflictingUserIds(candidate, slots, ['ana', 'beto'])).toEqual(['ana'])
    expect(conflictingUserIds(candidate, [], ['ana'])).toEqual([])
  })
})

describe('member markers', () => {
  it('derives up to two initials', () => {
    expect(initialsOf('Ana María López')).toBe('AM')
    expect(initialsOf('beto')).toBe('BE')
    expect(initialsOf('  öloon  ')).toBe('ÖL')
    expect(initialsOf('')).toBe('?')
  })

  it('assigns colours by member order, wrapping around the palette', () => {
    const members = Array.from({ length: MEMBER_PALETTE.length + 1 }, (_, i) => ({ user_id: `u${i}`, name: `Persona ${i}` }))
    const markers = buildMemberMarkers(members)
    expect(markers.get('u0')?.color).toBe(MEMBER_PALETTE[0])
    expect(markers.get('u1')?.color).toBe(MEMBER_PALETTE[1])
    expect(markers.get(`u${MEMBER_PALETTE.length}`)?.color).toBe(MEMBER_PALETTE[0])
    expect(markers.get('u0')).toMatchObject({ name: 'Persona 0', label: 'P0' })
    // same input, same output
    expect(buildMemberMarkers(members).get('u3')).toEqual(markers.get('u3'))
  })
})

describe('daylight-saving change days', () => {
  // The window of the day that holds the clock change is 23h (spring) or 25h (autumn) in elapsed time;
  // wall-clock maths must keep every segment inside the fixed 0..1440 timeline.
  const zones = [
    { tz: 'America/New_York', spring: '2026-03-07', autumn: '2026-10-31' },
    { tz: 'Europe/Madrid', spring: '2026-03-28', autumn: '2026-10-24' },
  ]
  const previousTz = process.env.TZ
  beforeAll(() => {
    process.env.TZ = 'America/New_York'
  })
  afterAll(() => {
    if (previousTz === undefined) delete process.env.TZ
    else process.env.TZ = previousTz
  })

  it.each(zones)('uses a 1440-minute timeline in $tz', ({ tz, spring, autumn }) => {
    process.env.TZ = tz
    // sanity: the zone really has a 23h and a 25h window, so the test would catch elapsed-time maths
    const elapsed = (f: string) => (new Date(...ymd(addDaysStr(f, 1)), 6).getTime() - new Date(...ymd(f), 6).getTime()) / 3600000
    expect(elapsed(spring)).toBe(23)
    expect(elapsed(autumn)).toBe(25)

    for (const f of [spring, autumn]) {
      const overnight = block(f, '20:00', addDaysStr(f, 1), '06:00')
      expect(clipBlockToDay(overnight, f)).toEqual({ startMin: 840, endMin: 1440 })
      const wholeWindow = block(f, '00:00', addDaysStr(f, 1), '12:00')
      expect(clipBlockToDay(wholeWindow, f)).toEqual({ startMin: 0, endMin: 1440 })
      // ends exactly when the next window starts: does not touch it
      expect(blockOverlapsDay(overnight, addDaysStr(f, 1))).toBe(false)
      expect(clipBlockToDay(overnight, addDaysStr(f, 1))).toBeNull()
    }
  })

  it('keeps a block inside the change night at its wall-clock minutes', () => {
    process.env.TZ = 'America/New_York'
    // 02:30 on 2026-03-08 does not exist locally; wall-clock maths still places it 20h30 after 06:00 of the 7th
    expect(clipBlockToDay(block('2026-03-08', '01:00', '2026-03-08', '04:00'), '2026-03-07')).toEqual({ startMin: 1140, endMin: 1320 })
    // the repeated 01:00-02:00 hour of 2026-11-01 counts once
    expect(clipBlockToDay(block('2026-11-01', '00:30', '2026-11-01', '03:00'), '2026-10-31')).toEqual({ startMin: 1110, endMin: 1260 })
  })

  it('adds days across the clock change without drifting', () => {
    process.env.TZ = 'America/New_York'
    expect(addDaysStr('2026-03-07', 1)).toBe('2026-03-08')
    expect(addDaysStr('2026-03-08', 1)).toBe('2026-03-09')
    expect(addDaysStr('2026-10-31', 2)).toBe('2026-11-02')
  })
})

const ymd = (f: string): [number, number, number] => {
  const [y, m, d] = f.split('-').map(Number)
  return [y, m - 1, d]
}
