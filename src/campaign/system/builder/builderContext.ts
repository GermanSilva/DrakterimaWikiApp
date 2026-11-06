import { createContext, useContext } from 'react'
import type { Node, Path } from './draft'
import type { DisplayError } from './errorsEs'

export interface BuilderApi {
  draft: Node
  /** Applies a pure change to the draft. */
  edit: (change: (draft: Node) => Node) => void
  /** Removes `list[index]`, asking first when it may hold character data (the only removal path). */
  requestRemoval: (list: Path, index: number) => void
  /** The validation errors that belong to the part at `path` itself (not to the parts inside it that have their own panel). */
  errorsFor: (path: Path) => DisplayError[]
  /** True when the part at `path`, or anything inside it, has an error. */
  hasErrorsUnder: (path: Path) => boolean
}

export const BuilderContext = createContext<BuilderApi | null>(null)

export function useBuilder(): BuilderApi {
  const api = useContext(BuilderContext)
  if (!api) throw new Error('useBuilder needs a SheetBuilder')
  return api
}
