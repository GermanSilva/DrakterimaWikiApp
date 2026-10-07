import { useEffect } from 'react'
import type { FlatEntity } from '../../data'
import { useUnreadPort } from '../../ports'

/**
 * Marks the entity as read when its detail is shown, once per entity version (a realtime edit of a
 * row you are looking at raises `updated_at`, and the mark follows it so the dot never comes back).
 */
export function useMarkRead(table: string, entity: FlatEntity | null): void {
  const { markRead } = useUnreadPort()
  const id = entity?.id
  const updatedAt = entity?.updated_at
  useEffect(() => {
    if (id !== undefined) markRead(table, id, updatedAt)
    // the port is not a dependency on purpose: its identity changes on every mark
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, id, updatedAt])
}
