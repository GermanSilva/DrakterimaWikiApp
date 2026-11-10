import type { Disponibilidad, DmNotesRow, EntityTable, FlatEntity, PlayerAvailability, PlayerNote } from '../../data'
import { plainText } from '../../helpers'
import { rowsForCampaign, userIdsAvailableOnDay, userIdsUnavailableOnDay } from '../calendar/availabilityCalc'
import { canSee, str } from '../sections/format'

/** The viewer's calendar date as YYYY-MM-DD (never via toISOString: that is UTC and can shift the day). */
export function localToday(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

const isAvance = (e: FlatEntity) => e.tipo === 'avance'
const stamp = (value: unknown): number => {
  const ms = typeof value === 'string' ? Date.parse(value) : NaN
  return Number.isNaN(ms) ? 0 : ms
}

/** The last visible session of the timeline (the list arrives in timeline order), skipping avances. */
export function lastSession(sesiones: FlatEntity[], isDM: boolean): FlatEntity | null {
  for (let i = sesiones.length - 1; i >= 0; i--) {
    if (canSee(sesiones[i], isDM) && !isAvance(sesiones[i])) return sesiones[i]
  }
  return null
}

/** The earliest session slot from `today` (inclusive) on; ties break by start time. */
export function nextSessionSlot(slots: Disponibilidad[], today: string): Disponibilidad | null {
  const upcoming = slots.filter((s): s is Disponibilidad & { fecha_inicio: string } => !!s.fecha_inicio && s.fecha_inicio >= today)
  upcoming.sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio) || (a.hora_inicio ?? '').localeCompare(b.hora_inicio ?? ''))
  return upcoming[0] ?? null
}

const [Y, M, D] = [0, 1, 2]
const parseDay = (day: string): [number, number, number] => day.split('-').map(Number) as [number, number, number]

/** "hoy", "mañana" or "en N días" between two YYYY-MM-DD dates (calendar days, no time zone maths). */
export function daysUntilLabel(today: string, day: string): string {
  const a = parseDay(today)
  const b = parseDay(day)
  const days = Math.round((Date.UTC(b[Y], b[M] - 1, b[D]) - Date.UTC(a[Y], a[M] - 1, a[D])) / 86_400_000)
  if (days <= 0) return 'hoy'
  return days === 1 ? 'mañana' : `en ${days} días`
}

/** The pieces of the date block ("nov", "14", "sábado"). Never `new Date(str)`: that reads it as UTC. */
export function slotDateParts(day: string): { month: string; day: string; weekday: string } {
  const [y, m, d] = parseDay(day)
  const date = new Date(y, m - 1, d)
  return {
    month: date.toLocaleDateString('es-AR', { month: 'short' }).replace('.', ''),
    day: String(d),
    weekday: date.toLocaleDateString('es-AR', { weekday: 'long' }),
  }
}

/** Number of the session after the last real one (avances are not sessions). */
export function nextSessionNumber(sesiones: FlatEntity[]): number {
  return sesiones.reduce((max, s) => (!isAvance(s) && Number(s.numero) > max ? Number(s.numero) : max), 0) + 1
}

export interface Availability {
  available: number
  total: number
  /** Player ids with no availability on the day (not available, or flagged unavailable). */
  missing: string[]
}

/** How many of `playerIds` can play on `day`, from the personal windows and full-day "no disponible" marks. */
export function availabilityOnDay(playerIds: string[], rows: readonly PlayerAvailability[], campaignId: string, day: string): Availability {
  const scoped = rowsForCampaign(rows, campaignId, new Set(playerIds))
  const unavailable = new Set(userIdsUnavailableOnDay(scoped, day))
  const free = new Set(userIdsAvailableOnDay(scoped, day).filter((id) => !unavailable.has(id)))
  return { available: playerIds.filter((id) => free.has(id)).length, total: playerIds.length, missing: playerIds.filter((id) => !free.has(id)) }
}

/** Display name of an entity of any table. */
export function entityTitle(table: EntityTable | string, entity: FlatEntity): string {
  return str(entity.nombre) || str(entity.titulo) || (table === 'sesiones' && entity.numero != null ? `Sesión ${String(entity.numero)}` : `#${entity.id}`)
}

// --- DM: "Para preparar" --------------------------------------------------------------------------------------

export interface PrepItem {
  key: 'disponibilidad' | 'sesiones' | 'pnjs'
  label: string
  count: number
  detail: string
}

const DETAIL_MAX = 3
const shorten = (parts: string[], separator: string): string => parts.slice(0, DETAIL_MAX).join(separator) + (parts.length > DETAIL_MAX ? '…' : '')

/** The DM's pending work, only the rows with something to do. `missingPlayers` is null when there is no next session. */
export function prepItems({ missingPlayers, sesiones, pnjs }: { missingPlayers: string[] | null; sesiones: FlatEntity[]; pnjs: FlatEntity[] }): PrepItem[] {
  const noSummary = sesiones.filter((s) => !isAvance(s) && plainText(str(s.resumen)).trim() === '').map((s) => String(s.numero ?? `#${s.id}`))
  const noImage = pnjs.filter((p) => str(p.imagen_url).trim() === '').map((p) => str(p.nombre) || `#${p.id}`)
  const items: PrepItem[] = [
    { key: 'disponibilidad', label: 'Jugadores sin disponibilidad para la próxima sesión', count: missingPlayers?.length ?? 0, detail: shorten(missingPlayers ?? [], ', ') },
    { key: 'sesiones', label: 'Sesiones sin resumen', count: noSummary.length, detail: shorten(noSummary, ' · ') },
    { key: 'pnjs', label: 'PNJs sin imagen', count: noImage.length, detail: shorten(noImage, ', ') },
  ]
  return items.filter((i) => i.count > 0)
}

// --- Player: "Desde tu última visita" ---------------------------------------------------------------------------------

export const NEWS_TABLES = ['sesiones', 'pnjs', 'lugares', 'facciones', 'lore', 'items'] as const
export type NewsTable = (typeof NEWS_TABLES)[number]

export const NEWS_MAX = 6
const NEW_WINDOW_MS = 60_000

export interface NewsEntry {
  table: NewsTable
  entity: FlatEntity
  title: string
  /** Created and never edited since (as opposed to "actualizado"). */
  fresh: boolean
  unread: boolean
  at: string
}

/** Newest visible entities (by `updated_at`), the unread flag against `since` (ms), and how many are unread in all. */
export function newsSince(byTable: Record<NewsTable, FlatEntity[]>, isDM: boolean, since: number, max: number = NEWS_MAX): { entries: NewsEntry[]; unreadCount: number } {
  const all = NEWS_TABLES.flatMap((table) =>
    byTable[table]
      .filter((e) => canSee(e, isDM) && stamp(e.updated_at) > 0)
      .map((entity): NewsEntry => ({
        table,
        entity,
        title: entityTitle(table, entity),
        fresh: stamp(entity.updated_at) - stamp(entity.created_at) < NEW_WINDOW_MS,
        unread: stamp(entity.updated_at) > since,
        at: str(entity.updated_at),
      })),
  )
  all.sort((a, b) => stamp(b.at) - stamp(a.at))
  return { entries: all.slice(0, max), unreadCount: all.filter((e) => e.unread).length }
}

// --- DM: "Desde tu última visita" ---------------------------------------------------------------------------------------

const FEED_MAX = 5
const EXCERPT_MAX = 140

export interface NoteFeedEntry {
  note: PlayerNote
  heading: string
  excerpt: string
  unread: boolean
}

export interface NoteLookups {
  author: (userId: string) => string
  character: (characterId: number | null) => string
  target: (note: PlayerNote) => string
}

/** Player notes with text, newest first: "{autor} · {personaje} sobre {entidad}" + an excerpt. */
export function playerNoteFeed(notes: PlayerNote[], lookups: NoteLookups, since: number, max: number = FEED_MAX): NoteFeedEntry[] {
  return notes
    .filter((n) => n.text.trim() !== '')
    .sort((a, b) => stamp(b.updated_at) - stamp(a.updated_at))
    .slice(0, max)
    .map((note) => {
      const who = [lookups.author(note.user_id), lookups.character(note.character_id)].filter(Boolean).join(' · ')
      const text = note.text.trim()
      return {
        note,
        heading: `${who} sobre ${lookups.target(note)}`,
        excerpt: text.length > EXCERPT_MAX ? `${text.slice(0, EXCERPT_MAX)}…` : text,
        unread: stamp(note.updated_at) > since,
      }
    })
}

/** Human names of the stampable sections of a character (`pjs.sections_updated` keys). */
export const SECTION_LABELS: Record<string, string> = {
  general: 'General',
  stats: 'Estadísticas',
  habilidades: 'Habilidades',
  ataques: 'Ataques',
  hechizos: 'Hechizos',
  recursos: 'Recursos',
  equipo: 'Equipo',
  rasgos: 'Rasgos',
  narrativa: 'Narrativa',
  apariencia: 'Apariencia',
}

export interface SheetChange {
  pj: FlatEntity
  heading: string
  /** Sections edited since the last visit (the newest one when all were already seen). */
  sections: string[]
  unread: boolean
  at: number
}

const stampsOf = (pj: FlatEntity): [string, number][] => {
  const raw = pj.sections_updated
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
  return Object.entries(raw as Record<string, unknown>).map(([key, value]): [string, number] => [key, stamp(value)]).filter(([, at]) => at > 0)
}

/** Characters with edit stamps, newest first. There is no author tracking: DM edits are stamped too. */
export function sheetChanges(pjs: FlatEntity[], playerOf: (pj: FlatEntity) => string, since: number, max: number = FEED_MAX): SheetChange[] {
  const changes = pjs.flatMap((pj) => {
    const stamps = stampsOf(pj).sort((a, b) => b[1] - a[1])
    if (stamps.length === 0) return []
    const recent = stamps.filter(([, at]) => at > since)
    const shown = recent.length > 0 ? recent : stamps.slice(0, 1)
    const player = playerOf(pj)
    return [{
      pj,
      heading: [str(pj.nombre) || `#${pj.id}`, player].filter(Boolean).join(' · '),
      sections: shown.map(([key]) => SECTION_LABELS[key] ?? key),
      unread: recent.length > 0,
      at: stamps[0][1],
    }]
  })
  return changes.sort((a, b) => b.at - a.at).slice(0, max)
}

// --- Notes card -----------------------------------------------------------------------------------------------------

const NOTES_MAX = 3

/** The viewer's own notes with text, newest first. */
export function ownNotes(notes: PlayerNote[], userId: string, max: number = NOTES_MAX): PlayerNote[] {
  return notes.filter((n) => n.user_id === userId && n.text.trim() !== '').sort((a, b) => stamp(b.updated_at) - stamp(a.updated_at)).slice(0, max)
}

/** The DM's rows with open hooks (`ganchos`), newest first. */
export function openHooks(rows: DmNotesRow[], max: number = NOTES_MAX): DmNotesRow[] {
  return rows.filter((r) => r.ganchos.trim() !== '').sort((a, b) => stamp(b.updated_at) - stamp(a.updated_at)).slice(0, max)
}
