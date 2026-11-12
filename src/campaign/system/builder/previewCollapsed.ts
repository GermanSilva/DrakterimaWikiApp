const KEY = 'rpgquester:builder-preview-collapsed'

/** Whether the preview pane was left collapsed. Missing, invalid or unreadable storage means expanded. */
export function readPreviewCollapsed(): boolean {
  try {
    return window.localStorage.getItem(KEY) === 'true'
  } catch {
    return false
  }
}

/** Remembers the choice; a storage that refuses the write only loses the memory, never the toggle. */
export function writePreviewCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(KEY, String(collapsed))
  } catch {
    // unavailable or full: the pane still toggles for this visit
  }
}
