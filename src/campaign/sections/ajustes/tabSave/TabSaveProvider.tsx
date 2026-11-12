import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BlockSaveCancelled, BlockSaveError, TabSaveContext, type BlockFailure, type BlockSummary, type SaveBlock, type TabResult, type TabSaveApi } from './tabSaveContext'

const MESSAGE_MS = 5000
const GENERIC_FAILURE = 'No se pudo guardar. Intentá de nuevo.'

type Entry = { tab: string; seq: number; ref: { current: SaveBlock } }

const same = (a: BlockSummary, b: BlockSummary) =>
  a.label === b.label && a.order === b.order && a.dirtyCount === b.dirtyCount && a.errorCount === b.errorCount && a.errorReason === b.errorReason && a.savableWhenClean === b.savableWhenClean
const idOf = (tab: string, key: string) => `${tab}\u0000${key}`

/** The blocks of a tab in save order (`order`, then registration order). */
function blocksOf(entries: Map<string, Entry>, tab: string): [string, Entry][] {
  return [...entries.entries()].filter(([, e]) => e.tab === tab).sort(([, a], [, b]) => (a.ref.current.order ?? 0) - (b.ref.current.order ?? 0) || a.seq - b.seq)
}

/**
 * The save registry of the Ajustes page. Blocks with a draft register {key, label, dirty, errors, save, discard} under their
 * tab; the tab's bar saves every dirty block of the tab in order, keeps going when one fails (the others stay saved) and
 * reports which block failed. Decisions read the blocks' refs, not state, so a click always sees the latest render.
 */
export function TabSaveProvider({ children }: { children: ReactNode }) {
  const [summaries, setSummaries] = useState<readonly BlockSummary[]>([])
  const [results, setResults] = useState<Readonly<Record<string, TabResult | undefined>>>({})
  const [saving, setSaving] = useState<ReadonlySet<string>>(() => new Set())
  const entries = useRef(new Map<string, Entry>())
  const sequence = useRef(0)
  const running = useRef(new Set<string>())
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach(clearTimeout)
  }, [])

  const register = useCallback<TabSaveApi['register']>((tab, key, ref) => {
    const id = idOf(tab, key)
    entries.current.set(id, { tab, seq: sequence.current++, ref })
    return () => {
      entries.current.delete(id)
      setSummaries((prev) => prev.filter((b) => !(b.tab === tab && b.key === key)))
    }
  }, [])

  const publish = useCallback<TabSaveApi['publish']>((summary) => {
    const entry = entries.current.get(idOf(summary.tab, summary.key))
    if (!entry) return
    const next: BlockSummary = { ...summary, seq: entry.seq }
    setSummaries((prev) => {
      const at = prev.findIndex((b) => b.tab === next.tab && b.key === next.key)
      if (at < 0) return [...prev, next]
      if (same(prev[at], next)) return prev
      return prev.map((b, i) => (i === at ? next : b))
    })
  }, [])

  /** A saved / discarded message fades after a few seconds; a failure stays until the next attempt. */
  const setResult = useCallback((tab: string, result: TabResult | undefined) => {
    setResults((prev) => ({ ...prev, [tab]: result }))
    if (result && result.kind !== 'failed') {
      const timer = setTimeout(() => {
        timers.current.delete(timer)
        setResults((prev) => (prev[tab] === result ? { ...prev, [tab]: undefined } : prev))
      }, MESSAGE_MS)
      timers.current.add(timer)
    }
  }, [])

  const saveTab = useCallback<TabSaveApi['saveTab']>(
    async (tab) => {
      if (running.current.has(tab)) return
      const all = blocksOf(entries.current, tab)
      if (all.some(([, e]) => (e.ref.current.errorCount ?? 0) > 0)) return
      const dirty = all.filter(([, e]) => e.ref.current.dirtyCount > 0)
      const targets = dirty.length > 0 ? dirty : all.filter(([, e]) => e.ref.current.savableWhenClean)
      if (targets.length === 0) return
      running.current.add(tab)
      setSaving((prev) => new Set(prev).add(tab))
      setResult(tab, undefined)
      const failures: BlockFailure[] = []
      let saved = 0
      try {
        for (const [id, entry] of targets) {
          // the block may have remounted (its draft was rebuilt) while an earlier one was saving: call whatever is registered now
          const current = entries.current.get(id)?.ref.current ?? entry.ref.current
          try {
            await current.save()
            saved += 1
          } catch (e) {
            if (e instanceof BlockSaveCancelled) continue
            failures.push({ key: current.key, label: current.label, message: e instanceof BlockSaveError ? e.message : GENERIC_FAILURE })
          }
        }
      } finally {
        running.current.delete(tab)
        setSaving((prev) => {
          const next = new Set(prev)
          next.delete(tab)
          return next
        })
      }
      setResult(tab, failures.length > 0 ? { kind: 'failed', failures } : saved > 0 ? { kind: 'saved' } : undefined)
    },
    [setResult],
  )

  const discardTab = useCallback<TabSaveApi['discardTab']>(
    (tab) => {
      if (running.current.has(tab)) return
      for (const [, entry] of blocksOf(entries.current, tab)) if (entry.ref.current.dirtyCount > 0) entry.ref.current.discard()
      setResult(tab, { kind: 'discarded' })
    },
    [setResult],
  )

  const value = useMemo<TabSaveApi>(() => ({ summaries, results, saving, register, publish, saveTab, discardTab }), [summaries, results, saving, register, publish, saveTab, discardTab])
  return <TabSaveContext.Provider value={value}>{children}</TabSaveContext.Provider>
}
