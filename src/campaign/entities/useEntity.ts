import { useMemo } from 'react'
import type { EntityTable, FlatEntity } from '../../data'
import { useEntities } from './useEntities'

export interface EntityState {
  entity: FlatEntity | null
  loading: boolean
  /** The list LOADED successfully and has no row with that id (never existed, deleted, or not visible to you). A failed load is `error`, never this. */
  notFound: boolean
  error: Error | null
  /** Re-lists the table (the "Reintentar" of a failed load). */
  reload: () => void
}

/** One entity out of the shared realtime list (no extra request, no extra channel). */
export function useEntity(table: EntityTable, id: number | null): EntityState {
  const { items, loading, error, reload } = useEntities(table)
  const entity = useMemo(() => (id === null ? null : (items.find((e) => e.id === id) ?? null)), [items, id])
  return { entity, loading: id !== null && loading && !entity, notFound: id !== null && !loading && !entity && !error, error, reload }
}
