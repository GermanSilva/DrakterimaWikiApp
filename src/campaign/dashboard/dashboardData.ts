import type { Disponibilidad, FlatEntity } from '../../data'
import { canSee } from '../sections/format'

/** Entries shown by "PNJs recientes" and "Últimos artículos". */
export const RECENT_MAX = 5

/** The collections whose newest rows feed "Últimos artículos". */
export const ARTICLE_TABLES = ['lugares', 'facciones', 'lore', 'items'] as const
export type ArticleTable = (typeof ARTICLE_TABLES)[number]

export interface Article {
  table: ArticleTable
  entity: FlatEntity
}

/** The viewer's calendar date as YYYY-MM-DD (never via toISOString: that is UTC and can shift the day). */
export function localToday(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** `YYYY-MM-DD` shown as a local date. Never `new Date(str)`: that reads it as UTC and can shift the day. */
export function formatDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}

const isAvance = (e: FlatEntity) => e.tipo === 'avance'

/** How many rows the viewer can see. `withoutAvances` is for sessions (an "avance" is not a session). */
export function countVisible(rows: FlatEntity[], isDM: boolean, options: { withoutAvances?: boolean } = {}): number {
  return rows.filter((e) => canSee(e, isDM) && !(options.withoutAvances && isAvance(e))).length
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

const created = (e: FlatEntity) => (typeof e.created_at === 'string' ? e.created_at : '')
const newestFirst = (a: FlatEntity, b: FlatEntity) => created(b).localeCompare(created(a)) || b.id - a.id

export function recentPnjs(pnjs: FlatEntity[], isDM: boolean, max: number = RECENT_MAX): FlatEntity[] {
  return pnjs.filter((p) => canSee(p, isDM)).sort(newestFirst).slice(0, max)
}

export function recentArticles(byTable: Record<ArticleTable, FlatEntity[]>, isDM: boolean, max: number = RECENT_MAX): Article[] {
  return ARTICLE_TABLES.flatMap((table) => byTable[table].filter((e) => canSee(e, isDM) && created(e) !== '').map((entity) => ({ table, entity })))
    .sort((a, b) => newestFirst(a.entity, b.entity))
    .slice(0, max)
}
