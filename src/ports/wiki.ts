import { createContext, useContext } from 'react'

/** What a wiki link points at, resolved by the host app (legacy db or hub index). */
export interface WikiTarget {
  /** Display title (`nombre` or `titulo`, `#id` when the entity has none). */
  title: string
  /** Human label of the collection ("PNJ", "Lugar", ...), shown in the tooltip. */
  section: string
  imagenUrl?: string | null
  /** Collection key (`pnjs`, `lugares`, ...), the argument `navigate` expects. */
  table: string
}

export interface WikiSearchItem {
  table: string
  /** Wiki-link letter of the collection (S, P, N, G, F, L, I, M, H). */
  letter: string
  id: number
  title: string
}

/**
 * Port read by WikiText / WikiLink / WikiLinkPicker. Shared components never touch `useApp()` or
 * the data layer: the host app installs an adapter (legacy: App.jsx state, hub: campaign index).
 */
export interface WikiPort {
  /**
   * True while the data `resolve` would read for this letter is not available yet (still loading, or its
   * load failed): an unresolved link must then render as neutral text, not claim "not found".
   */
  pending(letter: string): boolean
  /** `null` = the article does not exist (or is not visible to the viewer). */
  resolve(letter: string, id: number): WikiTarget | null
  /** Opens the article page. `table` is the collection key of `WikiTarget.table`. */
  navigate(table: string, id: number): void
  /** Entities matching `query` (empty query = all), grouped/ordered by the picker. */
  search(query: string): WikiSearchItem[]
}

export const WikiPortContext = createContext<WikiPort | null>(null)

/** Throws outside a provider: a missing adapter is a wiring bug, not a state to render around. */
export function useWikiPort(): WikiPort {
  const port = useContext(WikiPortContext)
  if (!port) throw new Error('useWikiPort must be used inside a WikiPortContext provider (legacy or hub adapter)')
  return port
}
