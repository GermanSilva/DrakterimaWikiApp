import { describe, expect, it } from 'vitest'
import type { Disponibilidad, FlatEntity } from '../../data'
import { countVisible, lastSession, localToday, nextSessionSlot, recentArticles, recentPnjs } from './dashboardData'

const ent = (id: number, over: Record<string, unknown> = {}): FlatEntity => ({
  id,
  campaign_id: 'c1',
  created_at: `2026-01-${String(id).padStart(2, '0')}T10:00:00Z`,
  updated_at: '2026-02-01T10:00:00Z',
  estado: 'publicado',
  ...over,
})

const slot = (id: number, fecha: string | null, over: Partial<Disponibilidad> = {}): Disponibilidad => ({
  id,
  campaign_id: 'c1',
  tipo: 'sesion',
  fecha_inicio: fecha,
  fecha_fin: null,
  hora_inicio: null,
  hora_fin: null,
  created_by: null,
  created_at: '',
  updated_at: '',
  ...over,
})

describe('localToday', () => {
  it('is the local calendar date as YYYY-MM-DD', () => {
    expect(localToday(new Date(2026, 2, 5, 23, 59))).toBe('2026-03-05')
    expect(localToday(new Date(2026, 11, 31, 0, 1))).toBe('2026-12-31')
  })
})

describe('countVisible', () => {
  const rows = [ent(1), ent(2, { estado: 'borrador' }), ent(3, { tipo: 'avance' })]
  it('hides drafts from players and counts them for the DM', () => {
    expect(countVisible(rows, false)).toBe(2)
    expect(countVisible(rows, true)).toBe(3)
  })
  it('can leave out avances (sessions only)', () => {
    expect(countVisible(rows, true, { withoutAvances: true })).toBe(2)
  })
})

describe('lastSession', () => {
  it('is the last visible session in timeline order, skipping avances', () => {
    const rows = [ent(1, { tipo: 'sesion' }), ent(2, { tipo: 'sesion' }), ent(3, { tipo: 'avance' }), ent(4, { tipo: 'sesion', estado: 'borrador' })]
    expect(lastSession(rows, false)?.id).toBe(2)
    expect(lastSession(rows, true)?.id).toBe(4)
  })
  it('is null when there is none', () => {
    expect(lastSession([], true)).toBeNull()
    expect(lastSession([ent(1, { tipo: 'avance' })], true)).toBeNull()
  })
})

describe('nextSessionSlot', () => {
  it('picks the earliest slot from today on (today included), ignoring the past and dateless slots', () => {
    const slots = [slot(1, '2026-03-01'), slot(2, '2026-03-20'), slot(3, '2026-03-10'), slot(4, null), slot(5, '2026-03-09')]
    expect(nextSessionSlot(slots, '2026-03-09')?.id).toBe(5)
    expect(nextSessionSlot(slots, '2026-03-10')?.id).toBe(3)
  })
  it('breaks ties by start time', () => {
    const slots = [slot(1, '2026-03-10', { hora_inicio: '21:00' }), slot(2, '2026-03-10', { hora_inicio: '19:30' })]
    expect(nextSessionSlot(slots, '2026-03-10')?.id).toBe(2)
  })
  it('is null when nothing is ahead', () => {
    expect(nextSessionSlot([slot(1, '2026-03-01')], '2026-03-02')).toBeNull()
    expect(nextSessionSlot([], '2026-03-02')).toBeNull()
  })
})

describe('recentPnjs', () => {
  it('returns the newest visible ones first, at most 5', () => {
    const rows = [1, 2, 3, 4, 5, 6, 7].map((id) => ent(id))
    rows.push(ent(8, { estado: 'borrador' }))
    expect(recentPnjs(rows, false).map((p) => p.id)).toEqual([7, 6, 5, 4, 3])
    expect(recentPnjs(rows, true).map((p) => p.id)).toEqual([8, 7, 6, 5, 4])
  })
  it('falls back to the id when created_at ties or is missing', () => {
    const rows = [ent(1, { created_at: undefined }), ent(2, { created_at: undefined })]
    expect(recentPnjs(rows, true).map((p) => p.id)).toEqual([2, 1])
  })
})

describe('recentArticles', () => {
  it('merges the article tables, newest first, at most 5, tagging the table', () => {
    const out = recentArticles(
      {
        lugares: [ent(1), ent(9)],
        facciones: [ent(5), ent(6, { estado: 'borrador' })],
        lore: [ent(3)],
        items: [ent(7), ent(2)],
      },
      false,
    )
    expect(out.map((a) => `${a.table}:${a.entity.id}`)).toEqual(['lugares:9', 'items:7', 'facciones:5', 'lore:3', 'items:2'])
  })
  it('ignores rows without a creation date', () => {
    expect(recentArticles({ lugares: [ent(1, { created_at: undefined })], facciones: [], lore: [], items: [] }, true)).toEqual([])
  })
})
