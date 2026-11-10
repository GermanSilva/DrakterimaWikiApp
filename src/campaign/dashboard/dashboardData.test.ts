import { describe, expect, it } from 'vitest'
import type { Disponibilidad, DmNotesRow, FlatEntity, PlayerAvailability, PlayerNote } from '../../data'
import {
  availabilityOnDay, daysUntilLabel, entityTitle, lastSession, localToday, newsSince, nextSessionNumber, nextSessionSlot, openHooks, ownNotes,
  playerNoteFeed, prepItems, sheetChanges, slotDateParts,
} from './dashboardData'

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

describe('daysUntilLabel', () => {
  it('says hoy, mañana or en N días', () => {
    expect(daysUntilLabel('2026-03-10', '2026-03-10')).toBe('hoy')
    expect(daysUntilLabel('2026-03-10', '2026-03-11')).toBe('mañana')
    expect(daysUntilLabel('2026-03-10', '2026-03-13')).toBe('en 3 días')
  })
  it('counts calendar days across a month end', () => {
    expect(daysUntilLabel('2026-02-27', '2026-03-02')).toBe('en 3 días')
  })
})

describe('slotDateParts', () => {
  it('splits a local date into month, day and weekday', () => {
    expect(slotDateParts('2026-11-14')).toEqual({ month: 'nov', day: '14', weekday: 'sábado' })
  })
})

describe('nextSessionNumber', () => {
  it('is the last non-avance number plus one, 1 when there is none', () => {
    expect(nextSessionNumber([ent(1, { numero: 3 }), ent(2, { numero: 24 }), ent(3, { tipo: 'avance', numero: 99 })])).toBe(25)
    expect(nextSessionNumber([])).toBe(1)
  })
})

const av = (user_id: string, over: Partial<PlayerAvailability> = {}): PlayerAvailability => ({
  id: 1, user_id, campaign_id: null, tipo: 'personal', fecha: null, fecha_inicio: '2026-03-12', fecha_fin: '2026-03-12',
  hora_inicio: '18:00', hora_fin: '23:00', created_at: '', updated_at: '', ...over,
})

describe('availabilityOnDay', () => {
  const players = ['a', 'b', 'c', 'd']
  it('counts players with a personal window that day, minus the ones flagged unavailable', () => {
    const rows = [
      av('a'),
      av('b'),
      av('b', { tipo: 'no_disponible', fecha: '2026-03-12', fecha_inicio: null, fecha_fin: null, hora_inicio: null, hora_fin: null }),
      av('c', { fecha_inicio: '2026-03-20', fecha_fin: '2026-03-20' }),
    ]
    expect(availabilityOnDay(players, rows, 'c1', '2026-03-12')).toEqual({ available: 1, total: 4, missing: ['b', 'c', 'd'] })
  })
  it('ignores rows of other campaigns and of non-players', () => {
    const rows = [av('a', { campaign_id: 'other' }), av('dm'), av('d', { campaign_id: 'c1' })]
    expect(availabilityOnDay(players, rows, 'c1', '2026-03-12')).toEqual({ available: 1, total: 4, missing: ['a', 'b', 'c'] })
  })
})

describe('entityTitle', () => {
  it('prefers nombre, then titulo, then the session number', () => {
    expect(entityTitle('pnjs', ent(1, { nombre: 'Ilvane' }))).toBe('Ilvane')
    expect(entityTitle('lore', ent(1, { titulo: 'La caída' }))).toBe('La caída')
    expect(entityTitle('sesiones', ent(1, { numero: 4 }))).toBe('Sesión 4')
    expect(entityTitle('lugares', ent(7))).toBe('#7')
  })
})

describe('prepItems', () => {
  const sesiones = [
    ent(1, { numero: 22, resumen: '' }),
    ent(2, { numero: 23, resumen: '   ' }),
    ent(3, { numero: 24, resumen: 'ok' }),
    ent(4, { tipo: 'avance', numero: 25, resumen: '' }),
  ]
  const pnjs = [ent(1, { nombre: 'Ilvane', imagen_url: '' }), ent(2, { nombre: 'Dorrel' }), ent(3, { nombre: 'Con', imagen_url: 'https://x.test/a.png' })]
  it('lists only what has a count, with the details', () => {
    const items = prepItems({ missingPlayers: ['Joaquín'], sesiones, pnjs })
    expect(items.map((i) => [i.label, i.count, i.detail])).toEqual([
      ['Jugadores sin disponibilidad para la próxima sesión', 1, 'Joaquín'],
      ['Sesiones sin resumen', 2, '22 · 23'],
      ['PNJs sin imagen', 2, 'Ilvane, Dorrel'],
    ])
  })
  it('is empty when nothing is pending or the next session is unknown', () => {
    expect(prepItems({ missingPlayers: null, sesiones: [], pnjs: [] })).toEqual([])
  })
  it('shortens long details', () => {
    const many = [1, 2, 3, 4, 5].map((i) => ent(i, { nombre: `P${i}` }))
    expect(prepItems({ missingPlayers: null, sesiones: [], pnjs: many })[0].detail).toBe('P1, P2, P3…')
  })
})

describe('newsSince', () => {
  const t = (iso: string) => Date.parse(iso)
  const rows = {
    sesiones: [ent(1, { tipo: 'sesion', numero: 24, titulo: 'La torre', created_at: '2026-03-01T10:00:00Z', updated_at: '2026-03-08T10:00:00Z' })],
    pnjs: [
      ent(2, { nombre: 'Ilvane', created_at: '2026-03-09T10:00:00Z', updated_at: '2026-03-09T10:00:10Z' }),
      ent(3, { nombre: 'Secreto', estado: 'borrador', created_at: '2026-03-09T10:00:00Z', updated_at: '2026-03-09T11:00:00Z' }),
    ],
    lugares: [], facciones: [], lore: [], items: [],
  }
  it('orders by updated_at, hides drafts from players and flags unread and new', () => {
    const out = newsSince(rows, false, t('2026-03-08T12:00:00Z'))
    expect(out.entries.map((e) => [e.table, e.entity.id, e.unread, e.fresh])).toEqual([['pnjs', 2, true, true], ['sesiones', 1, false, false]])
    expect(out.unreadCount).toBe(1)
  })
  it('caps the list at max but counts every unread one', () => {
    const many = { ...rows, lore: [1, 2, 3, 4, 5, 6, 7].map((i) => ent(10 + i, { titulo: `L${i}`, updated_at: `2026-03-09T12:0${i}:00Z` })) }
    const out = newsSince(many, false, t('2026-03-01T00:00:00Z'))
    expect(out.entries).toHaveLength(6)
    expect(out.unreadCount).toBe(9)
  })
})

const note = (over: Partial<PlayerNote> = {}): PlayerNote => ({
  campaign_id: 'c1', user_id: 'u1', entity_type: 'pnjs', entity_id: 2, character_id: 5, text: 'Nos ocultó algo', created_at: '', updated_at: '2026-03-09T10:00:00Z', ...over,
})

describe('playerNoteFeed', () => {
  const lookups = { author: (id: string) => (id === 'u1' ? 'Sofi' : 'Martín'), character: (id: number | null) => (id === 5 ? 'Kestrel' : ''), target: () => 'Ilvane' }
  it('shows non-empty notes newest first with author, character, target and unread flag', () => {
    const notes = [note(), note({ user_id: 'u2', character_id: null, updated_at: '2026-03-10T10:00:00Z', text: 'Otra' }), note({ text: '  ' })]
    const out = playerNoteFeed(notes, lookups, Date.parse('2026-03-09T12:00:00Z'))
    expect(out.map((n) => [n.heading, n.excerpt, n.unread])).toEqual([['Martín sobre Ilvane', 'Otra', true], ['Sofi · Kestrel sobre Ilvane', 'Nos ocultó algo', false]])
  })
  it('keeps at most 5 and cuts long excerpts', () => {
    const notes = Array.from({ length: 7 }, (_, i) => note({ entity_id: i, text: 'x'.repeat(300), updated_at: `2026-03-09T10:0${i}:00Z` }))
    const out = playerNoteFeed(notes, lookups, 0)
    expect(out).toHaveLength(5)
    expect(out[0].excerpt.length).toBeLessThanOrEqual(141)
    expect(out[0].excerpt.endsWith('…')).toBe(true)
  })
})

describe('sheetChanges', () => {
  const pj = (id: number, stamps: unknown, over: Record<string, unknown> = {}) => ent(id, { nombre: `PJ${id}`, jugador: `J${id}`, sections_updated: stamps, ...over })
  it('lists characters with stamps, newest first, naming the sections edited since the last visit', () => {
    const since = Date.parse('2026-03-09T00:00:00Z')
    const out = sheetChanges(
      [
        pj(1, { hechizos: '2026-03-09T10:00:00Z', narrativa: '2026-03-10T10:00:00Z', equipo: '2026-03-01T10:00:00Z' }),
        pj(2, { equipo: '2026-03-02T10:00:00Z', stats: '2026-03-03T10:00:00Z' }),
        pj(3, {}),
      ],
      (p) => String(p.jugador),
      since,
    )
    expect(out.map((c) => [c.heading, c.sections, c.unread])).toEqual([
      ['PJ1 · J1', ['Narrativa', 'Hechizos'], true],
      ['PJ2 · J2', ['Estadísticas'], false],
    ])
  })
  it('omits the player part when unknown and tolerates a malformed stamp map', () => {
    const out = sheetChanges([pj(1, { equipo: '2026-03-09T10:00:00Z' }), pj(2, 'nope')], () => '', 0)
    expect(out.map((c) => c.heading)).toEqual(['PJ1'])
  })
})

describe('ownNotes / openHooks', () => {
  it('own notes: only the viewer, non-empty, newest 3', () => {
    const notes = [1, 2, 3, 4].map((i) => note({ entity_id: i, updated_at: `2026-03-0${i}T10:00:00Z` }))
    notes.push(note({ user_id: 'other', updated_at: '2026-03-09T00:00:00Z' }), note({ text: '', updated_at: '2026-03-09T00:00:00Z' }))
    expect(ownNotes(notes, 'u1').map((n) => n.entity_id)).toEqual([4, 3, 2])
  })
  it('hooks: rows with ganchos, newest 3', () => {
    const row = (entity_id: number, ganchos: string, updated_at: string) => ({ entity_type: 'sesiones', entity_id, ganchos, updated_at }) as DmNotesRow
    const out = openHooks([row(1, 'a', '2026-03-01T00:00:00Z'), row(2, '', '2026-03-05T00:00:00Z'), row(3, 'c', '2026-03-03T00:00:00Z'), row(4, 'd', '2026-03-04T00:00:00Z'), row(5, 'e', '2026-03-02T00:00:00Z')])
    expect(out.map((r) => r.entity_id)).toEqual([4, 3, 5])
  })
})
