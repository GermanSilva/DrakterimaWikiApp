import { createContext, useContext } from 'react'

/** One entry of `layout.cards[]`: the card type plus the state the card persists on itself (notes text, combatants). */
export interface SessionCardEntry {
  id: number
  tipo: string
  [extra: string]: unknown
}

/**
 * What the DM session screen needs from its host. The screen renders `layout.cards[]` (the single source of truth
 * for tabs, stack and drag-and-drop) and never writes anywhere itself: the legacy app persists through Firestore,
 * the hub through `campaign_config` / the entity actions.
 */
export interface SessionScreenPort {
  /**
   * Replaces the ordered card list (add / remove / reorder). The host applies the updater to its LATEST list, so two
   * quick actions compose instead of overwriting each other.
   */
  setCards(updater: (cards: SessionCardEntry[]) => SessionCardEntry[]): boolean | void
  /** Merges `patch` into one card's entry (notes text, combatants) without touching the rest of the layout. */
  /** `false` = refused (not loaded yet, over the size limit): the caller must NOT treat the change as sent. */
  patchCard(entryId: number, patch: Record<string, unknown>): boolean | void
  /** Saves ONLY the given fields of a character (never the whole object). Resolves true when saved. */
  savePj(pj: Record<string, unknown>, patch: Record<string, unknown>): Promise<boolean>
  createRule(rule: { nombre: string; texto: string }): Promise<boolean>
  deleteRule(id: number): Promise<boolean>
}

export const SessionScreenPortContext = createContext<SessionScreenPort | null>(null)

export function useSessionScreenPort(): SessionScreenPort {
  const port = useContext(SessionScreenPortContext)
  if (!port) throw new Error('useSessionScreenPort must be used inside a SessionScreenPortContext provider (legacy or hub)')
  return port
}
