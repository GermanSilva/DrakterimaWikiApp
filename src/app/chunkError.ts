const CHUNK_MESSAGE = /dynamically imported module|Importing a module script failed|Loading chunk|Loading CSS chunk/i
export const CHUNK_RELOAD_KEY = 'hub_chunk_reload_at'
/** A second chunk failure within this window is a real problem, not a stale deploy: show the error screen. */
export const CHUNK_RELOAD_WINDOW_MS = 60_000

/** A failed dynamic import (stale hashed chunk after a deploy, offline, blocked). */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === 'ChunkLoadError' || CHUNK_MESSAGE.test(error.message)
}

/** True when a chunk-failure reload already happened inside the guard window (or storage is unusable). */
export function reloadGuardTripped(now: number = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY))
    return Number.isFinite(last) && last > 0 && now - last < CHUNK_RELOAD_WINDOW_MS
  } catch {
    return true
  }
}

/**
 * Reloads at most once per window for a chunk error. The sessionStorage guard prevents a reload
 * loop when the chunk is genuinely unavailable. Returns true when a reload was triggered.
 */
export function reloadOnceForChunkError(
  error: unknown,
  reload: () => void = () => window.location.reload(),
  now: number = Date.now(),
): boolean {
  if (!isChunkLoadError(error)) return false
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY))
    if (Number.isFinite(last) && last > 0 && now - last < CHUNK_RELOAD_WINDOW_MS) return false
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now))
  } catch {
    return false // no storage means no guard: never risk a loop
  }
  reload()
  return true
}
