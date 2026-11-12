import { createContext, useContext } from 'react'

/** A block failed to save; `message` is the Spanish text the bar shows next to the block's name. */
export class BlockSaveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BlockSaveError'
  }
}

/** The DM backed out of a confirmation the save asked for: nothing failed, nothing was saved, and no message is shown. */
export class BlockSaveCancelled extends Error {
  constructor() {
    super('cancelled')
    this.name = 'BlockSaveCancelled'
  }
}

/**
 * What a block with a draft tells the save bar of its tab. Registered while the block is mounted (see `useTabSaveBlock`).
 * `save` writes the draft and throws `BlockSaveError` (Spanish message) when it cannot; `discard` puts the draft back to the
 * stored values.
 */
export interface SaveBlock {
  /** Unique within the tab. */
  key: string
  /** Name shown in the bar ("No se guardó Regiones: ..."). */
  label: string
  /** Position inside the tab (blocks save in this order; ties keep registration order). */
  order?: number
  /** Number of unsaved changes of the draft (0 = clean). */
  dirtyCount: number
  /** Number of errors that block saving (live validation, like the sheet template). */
  errorCount?: number
  /** Why saving is blocked while `errorCount` > 0. */
  errorReason?: string
  /** A clean block the tab may still save when nothing else is dirty (the first template of a campaign). */
  savableWhenClean?: boolean
  save: () => Promise<void>
  discard: () => void
}

/** The values of a block that the bar and the tab badges read (no functions: the provider re-renders only when they change). */
export interface BlockSummary {
  tab: string
  key: string
  label: string
  order: number
  seq: number
  dirtyCount: number
  errorCount: number
  errorReason?: string
  savableWhenClean: boolean
}

export interface BlockFailure {
  key: string
  label: string
  message: string
}

/** What the last save or discard of a tab left to tell: a failure keeps showing until the next attempt. */
export type TabResult = { kind: 'saved' } | { kind: 'discarded' } | { kind: 'failed'; failures: BlockFailure[] }

export interface TabSaveApi {
  summaries: readonly BlockSummary[]
  results: Readonly<Record<string, TabResult | undefined>>
  saving: ReadonlySet<string>
  register: (tab: string, key: string, ref: { current: SaveBlock }) => () => void
  publish: (summary: Omit<BlockSummary, 'seq'>) => void
  saveTab: (tab: string) => Promise<void>
  discardTab: (tab: string) => void
}

export const TabSaveContext = createContext<TabSaveApi | null>(null)
/** The tab whose panel the block lives in; null outside Ajustes (the block then keeps its own buttons). */
export const TabScopeContext = createContext<string | null>(null)

export function useTabSaveApi(): TabSaveApi {
  const api = useContext(TabSaveContext)
  if (!api) throw new Error('useTabSaveApi must be used inside <TabSaveProvider>')
  return api
}

/** What a tab's blocks add up to. */
export interface TabSummary {
  dirty: number
  errors: number
  reason?: string
  /** Something can be saved: a dirty block, or a clean block that allows saving. */
  savable: boolean
  blocks: readonly BlockSummary[]
}

export function summarizeTab(summaries: readonly BlockSummary[], tab: string): TabSummary {
  const blocks = summaries.filter((b) => b.tab === tab).sort((a, b) => a.order - b.order || a.seq - b.seq)
  return {
    dirty: blocks.reduce((n, b) => n + b.dirtyCount, 0),
    errors: blocks.reduce((n, b) => n + b.errorCount, 0),
    reason: blocks.find((b) => b.errorCount > 0)?.errorReason,
    savable: blocks.some((b) => b.dirtyCount > 0 || b.savableWhenClean),
    blocks,
  }
}

export function useTabSummary(tab: string): TabSummary {
  return summarizeTab(useTabSaveApi().summaries, tab)
}

/** True while the tab of the calling block is writing (blocks lock their lists meanwhile). */
export function useTabSaving(): boolean {
  const api = useContext(TabSaveContext)
  const tab = useContext(TabScopeContext)
  return api !== null && tab !== null && api.saving.has(tab)
}
