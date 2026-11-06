import { createContext, useContext, useSyncExternalStore } from 'react'
import type { ActionCollectionRepository, CampaignAction, FlatEntity, LinkedAction } from '../../../data'
import type { ActionFunction } from '../../../campaign/system/actions/function/model'
import type { ParamValue, RunResult } from '../../../campaign/system/actions/function/run'
import type { UndoEntry, UndoWarning } from '../../../campaign/system/actions/function/undo'
import type { Patch } from '../../../campaign/system/actions/function/working'

/** A character and one of its links as they are stored NOW (read when the DM clicks, never the copy the screen loaded). */
export interface ActionSource {
  pj: FlatEntity
  linked: LinkedAction
}
/** One action applied during this session: what `Deshacer` subtracts again (S22, S32). The list lives as long as the open screen. */
export interface HistoryItem {
  id: number
  pjId: number
  pjName: string
  actionId: number
  actionName: string
  entry: UndoEntry
}
/** An undo planned on the character and link as they are now; the link is null when the action was unlinked meanwhile. */
export interface UndoPlan {
  pj: FlatEntity
  linked: LinkedAction | null
  patch: Patch
  warnings: UndoWarning[]
}
export type ParsedFunction = { ok: true; fn: ActionFunction } | { ok: false; errors: string[] }
/** `partial`: the character was written but the link state was not; the dialog can only be closed (repeating would apply the effects twice). */
export type ApplyOutcome = { status: 'ok' } | { status: 'conflict' } | { status: 'error'; message: string } | { status: 'partial'; message: string }
/** The applied-actions list lives outside the `SessionActions` object so a new item never changes the identity of the api (dialogs reload when it changes). */
export interface HistoryStore {
  get(): HistoryItem[]
  subscribe(listener: () => void): () => void
}

/**
 * What the DM session screen needs to run the functions of the actions its characters link (S22). Provided by the hub host
 * only when the campaign has a valid sheet with a Habilidad table; without it (legacy app, no sheet) the Acciones card does
 * not exist.
 */
export interface SessionActions {
  repo: ActionCollectionRepository
  read(pjId: number, actionId: number): Promise<ActionSource>
  /** Validates the stored function of an entry against the sheet. */
  parse(action: CampaignAction): ParsedFunction
  /** Pure: nothing is written. */
  run(fn: ActionFunction, source: ActionSource, params: Record<string, ParamValue>): RunResult
  /** Writes only the touched keys (character) and link state with the versions of `source`, never a section stamp. */
  apply(source: ActionSource, result: RunResult): Promise<ApplyOutcome>
  /** Newest first. */
  history: HistoryStore
  /** Reads the character and link now and plans the undo (pure after the read). */
  planUndo(item: HistoryItem): Promise<UndoPlan>
  /** Writes the plan like `apply` does (touched keys only, current versions, no stamp); on success the item leaves the list, on a partial undo it keeps only the part not undone. */
  undo(item: HistoryItem, plan: UndoPlan): Promise<ApplyOutcome>
  /** Drops an item from the list without writing (its character is gone). */
  discard(item: HistoryItem): void
}

export const SessionActionsContext = createContext<SessionActions | null>(null)

/** The session actions of the host, or null when the screen has none (legacy app, campaign without a Habilidad table). */
export const useSessionActionsOptional = (): SessionActions | null => useContext(SessionActionsContext)

/** The applied actions, newest first; re-renders when the list changes. */
export function useSessionHistory(): HistoryItem[] {
  const { history } = useSessionActions()
  return useSyncExternalStore(history.subscribe, history.get)
}

export function useSessionActions(): SessionActions {
  const api = useContext(SessionActionsContext)
  if (!api) throw new Error('useSessionActions must be used inside a SessionActionsContext provider')
  return api
}
