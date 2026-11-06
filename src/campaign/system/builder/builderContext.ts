import { createContext, useContext } from 'react'
import type { Node, Path } from './draft'

export interface BuilderApi {
  draft: Node
  /** Applies a pure change to the draft. */
  edit: (change: (draft: Node) => Node) => void
  /** Removes `list[index]`, asking first when it may hold character data (the only removal path). */
  requestRemoval: (list: Path, index: number) => void
}

export const BuilderContext = createContext<BuilderApi | null>(null)

export function useBuilder(): BuilderApi {
  const api = useContext(BuilderContext)
  if (!api) throw new Error('useBuilder needs a SheetBuilder')
  return api
}
