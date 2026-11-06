/**
 * Session undo of an action run (S22, S32): subtract what the action applied, floored at the minimum, and warn first when the
 * value is not the one the action left. The history lives only in the session, so an entry is plain data kept by the caller.
 */
import type { Applied } from './run'
import { patchOf, readTarget, startWorking, writeTarget, type Patch } from './working'

export interface UndoEntry {
  effects: Applied[]
}

export type UndoWarningKind = 'changed_since' | 'missing_row'
export interface UndoWarning {
  step: number
  kind: UndoWarningKind
  /** Spanish, for the user. */
  message: string
}

/** The entry that undoes a run; a copy, so later changes to `applied` never reach it. */
export const undoEntry = (applied: readonly Applied[]): UndoEntry => ({ effects: applied.map((a) => structuredClone(a)) })

/**
 * The patch that undoes `entry` on the character and link as they are NOW. Effects are undone last to first. Each one
 * subtracts its delta, never going below its `min`; a value that is not the stored `after` gives a `changed_since`
 * warning (the patch still subtracts, the caller confirms before writing). A row that is gone gives `missing_row` and
 * writes nothing for it. Effects with no change are skipped.
 */
export function planUndo(entry: UndoEntry, currentPj: Record<string, unknown>, currentLink: { state: Record<string, unknown> }): { patch: Patch; warnings: UndoWarning[] } {
  const work = startWorking(currentPj, currentLink.state)
  const warnings: UndoWarning[] = []
  for (const effect of [...entry.effects].reverse()) {
    if (effect.delta === 0) continue
    const current = readTarget(work, effect.target)
    if (!current.found) {
      warnings.push({ step: effect.step, kind: 'missing_row', message: `No se encontró la fila de «${effect.label}»: no se puede deshacer.` })
      continue
    }
    const now = current.value ?? 0
    if (now !== effect.after) warnings.push({ step: effect.step, kind: 'changed_since', message: `«${effect.label}» cambió después de la acción (se esperaba ${effect.after}, ahora es ${now}).` })
    const restored = now - effect.delta
    writeTarget(work, effect.target, effect.min === undefined ? restored : Math.max(effect.min, restored))
  }
  return { patch: patchOf(work), warnings }
}
