import { ENTITY_TABLES, type EntityTable, type FlatEntity } from '../../data'

type Compare = (a: FlatEntity, b: FlatEntity) => number

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const byId: Compare = (a, b) => a.id - b.id

/**
 * Timeline order of sesiones and avances, as the legacy snapshot listener sorted them:
 * `orden`, falling back to `numero * 100` for rows that never got an explicit position.
 */
export const bySesionOrden: Compare = (a, b) => {
  const diff = num(a.orden ?? num(a.numero) * 100) - num(b.orden ?? num(b.numero) * 100)
  return diff !== 0 ? diff : a.id - b.id
}

/**
 * List order per table. The legacy app only ordered sesiones (by timeline position); every other
 * collection kept the creation order, which is `id` ascending here. Pages that want an alphabetical
 * or filtered view sort/filter the list themselves.
 */
export const ENTITY_SORT: Record<EntityTable, Compare> = Object.fromEntries(
  ENTITY_TABLES.map((t) => [t, t === 'sesiones' ? bySesionOrden : byId]),
) as Record<EntityTable, Compare>
