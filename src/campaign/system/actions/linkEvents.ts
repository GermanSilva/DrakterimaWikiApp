/**
 * No realtime event fires when a character links, unlinks or edits the state of a collection entry (the entry row itself does
 * not change), so whoever writes a link announces it here and the readers of that character refetch (G6b).
 */
const bus = new EventTarget()
const EVENT = 'links-changed'

export function notifyLinksChanged(pjId: number): void {
  bus.dispatchEvent(new CustomEvent<number>(EVENT, { detail: pjId }))
}

/** Calls `listener` whenever the links of any character changed; returns the unsubscribe. */
export function onLinksChanged(listener: (pjId: number) => void): () => void {
  const handler = (e: Event) => listener((e as CustomEvent<number>).detail)
  bus.addEventListener(EVENT, handler)
  return () => bus.removeEventListener(EVENT, handler)
}
