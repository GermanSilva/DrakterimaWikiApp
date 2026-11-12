import { useContext, useEffect, useLayoutEffect, useRef } from 'react'
import { TabSaveContext, TabScopeContext, type SaveBlock } from './tabSaveContext'

/**
 * Registers a block's draft with the save bar of the tab it lives in, for as long as it is mounted. Returns true when a bar
 * hosts the block (inside Ajustes); false outside it, where the block keeps its own save button. Pass null to not register.
 * The latest `save` / `discard` are always the ones the bar calls, so they may close over the current render.
 */
export function useTabSaveBlock(block: SaveBlock | null): boolean {
  const api = useContext(TabSaveContext)
  const tab = useContext(TabScopeContext)
  const hosted = api !== null && tab !== null && block !== null
  const latest = useRef(block)
  useLayoutEffect(() => {
    latest.current = block
  })

  const key = block?.key
  const { register, publish } = api ?? {}
  useEffect(() => {
    if (!hosted || !register || tab === null || key === undefined) return undefined
    return register(tab, key, latest as { current: SaveBlock })
  }, [hosted, register, tab, key])

  const label = block?.label ?? ''
  const order = block?.order ?? 0
  const dirtyCount = block?.dirtyCount ?? 0
  const errorCount = block?.errorCount ?? 0
  const errorReason = block?.errorReason
  const savableWhenClean = block?.savableWhenClean ?? false
  useEffect(() => {
    if (!hosted || !publish || tab === null || key === undefined) return
    publish({ tab, key, label, order, dirtyCount, errorCount, errorReason, savableWhenClean })
  }, [hosted, publish, tab, key, label, order, dirtyCount, errorCount, errorReason, savableWhenClean])

  return hosted
}
