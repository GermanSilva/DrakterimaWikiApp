import { createContext, useContext } from 'react'
import type { ActionCollectionRepository, CampaignAction, FlatEntity, LinkedAction } from '../../../data'
import type { ActionFunction } from '../../../campaign/system/actions/function/model'
import type { ParamValue, RunResult } from '../../../campaign/system/actions/function/run'

/** A character and one of its links as they are stored NOW (read when the DM clicks, never the copy the screen loaded). */
export interface ActionSource {
  pj: FlatEntity
  linked: LinkedAction
}
export type ParsedFunction = { ok: true; fn: ActionFunction } | { ok: false; errors: string[] }
export type ApplyOutcome = { status: 'ok' } | { status: 'conflict' } | { status: 'error'; message: string }

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
}

export const SessionActionsContext = createContext<SessionActions | null>(null)

/** The session actions of the host, or null when the screen has none (legacy app, campaign without a Habilidad table). */
export const useSessionActionsOptional = (): SessionActions | null => useContext(SessionActionsContext)

export function useSessionActions(): SessionActions {
  const api = useContext(SessionActionsContext)
  if (!api) throw new Error('useSessionActions must be used inside a SessionActionsContext provider')
  return api
}
