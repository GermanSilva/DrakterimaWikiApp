import { createContext, useContext } from 'react'
import type { Node, Path } from './draft'
import type { Sheet, SheetError } from '../sheet/sheetModel'
import type { DisplayError } from './errorsEs'
import type { TestCharacter } from './formula/testCharacters'

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
  /** The sheet the draft validates to now, or null while it has errors. */
  validSheet: Sheet | null
  /** The last draft that validated (null before the first one): the formula workbench falls back to it to list references. */
  lastValidSheet: Sheet | null
  /** The raw validation errors of the draft (paths and messages as the validator gives them). */
  sheetErrors: readonly SheetError[]
  /** Characters to try formulas on (the built-in example is added by the workbench). */
  testCharacters: readonly TestCharacter[]
}

export const BuilderContext = createContext<BuilderApi | null>(null)

export function useBuilder(): BuilderApi {
  const api = useContext(BuilderContext)
  if (!api) throw new Error('useBuilder needs a SheetBuilder')
  return api
}
