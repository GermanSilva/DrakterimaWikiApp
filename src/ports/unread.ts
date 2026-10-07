import { createContext, useContext } from 'react'

/**
 * Unread tracking, per viewer. Semantics shared by both apps: an entity is unread when the viewer
 * never saw it, or when it changed after they last saw it. Entities without a change timestamp are
 * never unread.
 */
export interface UnreadPort {
  /**
   * `updatedAt` is the timestamp of the last change of the entity (or of the PJ section when
   * `section` is given). The page passes it because only the page holds the entity.
   */
  isUnread(type: string, id: number, updatedAt: string | null | undefined, section?: string): boolean
  /**
   * Records that the viewer saw the entity now. Background bookkeeping: never throws, failures are
   * logged. `updatedAt` raises the stored time to the entity's own timestamp when the client clock
   * is behind, so the dot always clears.
   */
  markRead(type: string, id: number, updatedAt?: string | null, section?: string): void
}

export const UnreadPortContext = createContext<UnreadPort | null>(null)

export function useUnreadPort(): UnreadPort {
  const port = useContext(UnreadPortContext)
  if (!port) throw new Error('useUnreadPort must be used inside an UnreadPortContext provider (legacy or hub adapter)')
  return port
}
