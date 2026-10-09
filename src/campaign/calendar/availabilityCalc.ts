import type { BusySlot, Disponibilidad, PlayerAvailability } from '../../data'

/**
 * Pure calendar maths for the availability calendar (port of the legacy `disponibilidadCalc.js`,
 * keyed by user id instead of PJ id). A calendar "day" is the window 06:00 of `fecha` until 06:00 of
 * the next day, so a late-night session still belongs to the evening it started on.
 */

/** A bounded time range: both dates and both times are known. */
export interface Block {
  fecha_inicio: string
  fecha_fin: string
  hora_inicio: string
  hora_fin: string
}

export interface Segment {
  /** Minutes since the window start (06:00), 0..1440. */
  startMin: number
  endMin: number
}

export interface DayCell {
  /** Members with a personal window overlapping the day. */
  available: string[]
  /** Members that flagged the full day as unavailable. */
  unavailable: string[]
  /** Members booked by a session of ANOTHER campaign during the day. */
  busy: string[]
}

/**
 * Wall-clock minutes of a date + time, counted on a UTC calendar (no daylight saving): every calendar
 * day is exactly 1440 minutes, whatever the local time zone does on that day.
 */
function wallMinutes(fecha: string, hora: string): number {
  const [y, m, d] = fecha.split('-').map(Number)
  const [h, min] = hora.split(':').map(Number)
  return Date.UTC(y, m - 1, d, h, min) / 60000
}

export function addDaysStr(fecha: string, n: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** `18:00:00` (Postgres time) and `18:00` are both shown and edited as `18:00`. */
export const shortTime = (hora: string): string => hora.slice(0, 5)

function windowOf(fecha: string): { start: number; end: number } {
  const start = wallMinutes(fecha, '06:00')
  return { start, end: start + 1440 }
}

/** The row as a bounded block, or null when any of its four bounds is missing. */
export function asBlock(row: {
  fecha_inicio: string | null
  fecha_fin: string | null
  hora_inicio: string | null
  hora_fin: string | null
}): Block | null {
  const { fecha_inicio, fecha_fin, hora_inicio, hora_fin } = row
  return fecha_inicio && fecha_fin && hora_inicio && hora_fin ? { fecha_inicio, fecha_fin, hora_inicio, hora_fin } : null
}

function bounds(block: Block): { start: number; end: number } {
  return { start: wallMinutes(block.fecha_inicio, block.hora_inicio), end: wallMinutes(block.fecha_fin, block.hora_fin) }
}

export function blockOverlapsDay(block: Block, fecha: string): boolean {
  const b = bounds(block)
  const d = windowOf(fecha)
  return b.start < d.end && d.start < b.end
}

/** Two ranges that merely touch (one ends when the other starts) do not overlap. */
export function blocksOverlap(a: Block, b: Block): boolean {
  const x = bounds(a)
  const y = bounds(b)
  return x.start < y.end && y.start < x.end
}

/**
 * The part of the block inside the 06:00-06:00 window of `fecha`, in minutes; null when outside.
 * Wall-clock arithmetic: on a daylight-saving change day the result still stays within 0..1440.
 */
export function clipBlockToDay(block: Block, fecha: string): Segment | null {
  const b = bounds(block)
  const d = windowOf(fecha)
  const start = Math.max(b.start, d.start)
  const end = Math.min(b.end, d.end)
  if (start >= end) return null
  return { startMin: start - d.start, endMin: end - d.start }
}

/**
 * The rows that belong on THIS campaign's calendar: rows of its members, either general
 * (`campaign_id` null) or pinned to this campaign. The list the server returns can also hold the
 * general rows of users who only share ANOTHER campaign with the viewer, and rows pinned elsewhere
 * that a stale copy has not dropped yet.
 */
export function rowsForCampaign(
  rows: readonly PlayerAvailability[],
  campaignId: string,
  memberIds: ReadonlySet<string>,
): PlayerAvailability[] {
  return rows.filter((r) => memberIds.has(r.user_id) && (r.campaign_id === null || r.campaign_id === campaignId))
}

const unique = (ids: Iterable<string>): string[] => [...new Set(ids)]

export function userIdsAvailableOnDay(rows: readonly PlayerAvailability[], fecha: string): string[] {
  return unique(
    rows.flatMap((r) => {
      if (r.tipo !== 'personal') return []
      const block = asBlock(r)
      return block && blockOverlapsDay(block, fecha) ? [r.user_id] : []
    }),
  )
}

/** `no_disponible` rows are full-day markers (only `fecha`). */
export function userIdsUnavailableOnDay(rows: readonly PlayerAvailability[], fecha: string): string[] {
  return unique(rows.filter((r) => r.tipo === 'no_disponible' && r.fecha === fecha).map((r) => r.user_id))
}

export function userIdsBusyOnDay(busy: readonly BusySlot[], fecha: string): string[] {
  return unique(busy.filter((s) => blockOverlapsDay(s, fecha)).map((s) => s.user_id))
}

/** `YYYY-MM-DD` of every day of the month (`month` is 0-based, like `Date`). */
export function monthDates(year: number, month: number): string[] {
  const days = new Date(year, month + 1, 0).getDate()
  return Array.from({ length: days }, (_, i) => `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`)
}

/** Who is available / unavailable / busy on each day of the month. */
export function buildMonthCells(
  rows: readonly PlayerAvailability[],
  busy: readonly BusySlot[],
  year: number,
  month: number,
): Record<string, DayCell> {
  return Object.fromEntries(
    monthDates(year, month).map((fecha) => [
      fecha,
      {
        available: userIdsAvailableOnDay(rows, fecha),
        unavailable: userIdsUnavailableOnDay(rows, fecha),
        busy: userIdsBusyOnDay(busy, fecha),
      },
    ]),
  )
}

/** Session slots of the campaign that overlap the day. */
export function sessionSlotsOnDay(slots: readonly Disponibilidad[], fecha: string): Disponibilidad[] {
  return slots.filter((s) => {
    const block = asBlock(s)
    return block !== null && blockOverlapsDay(block, fecha)
  })
}

/** The users among `userIds` that another campaign's session books during `block`. */
export function conflictingUserIds(block: Block, busy: readonly BusySlot[], userIds: Iterable<string>): string[] {
  const wanted = new Set(userIds)
  return unique(busy.filter((s) => wanted.has(s.user_id) && blocksOverlap(block, s)).map((s) => s.user_id))
}

/** Generic member colours, assigned by member order (so every viewer sees the same colour for the same member). */
export const MEMBER_PALETTE = [
  '#a855f7', '#22c55e', '#4f46e5', '#e52b50', '#f97316', '#0ea5e9', '#d946ef', '#14b8a6', '#ca8a04', '#7a2436',
] as const

export interface MemberMarker {
  userId: string
  name: string
  label: string
  color: string
}

/** Up to two initials: first letters of the first two words, or the first two letters of a single word. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const letters = words.length === 1 ? [...words[0]].slice(0, 2) : words.slice(0, 2).map((w) => [...w][0])
  return letters.join('').toLocaleUpperCase('es')
}

/** `members` must already be in a stable order (the repository sorts by join date, then user id). */
export function buildMemberMarkers(members: readonly { user_id: string; name: string }[]): Map<string, MemberMarker> {
  return new Map(
    members.map((m, i) => [
      m.user_id,
      { userId: m.user_id, name: m.name, label: initialsOf(m.name), color: MEMBER_PALETTE[i % MEMBER_PALETTE.length] },
    ]),
  )
}
