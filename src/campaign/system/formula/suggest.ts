/** "¿Quisiste decir {x}?": the closest known reference to a mistyped one (S42 e). Pure, deterministic. */

const MAX_DISTANCE = 3

/** Edit distance (insert, delete, replace) between two short texts. */
function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    previous = row
  }
  return previous[b.length]
}

/**
 * The candidate closest to `ref` within 3 edits (and no more than half the longer name, so a short name does not match anything),
 * ignoring case. The nearest wins; a tie goes to the alphabetically first, so the answer does not depend on the order of the
 * candidates. The reference itself is never suggested; null when nothing is close.
 */
export function nearestReference(ref: string, candidates: readonly string[]): string | null {
  const wanted = ref.toLowerCase()
  let best: string | null = null
  let bestDistance = Infinity
  for (const candidate of candidates) {
    if (candidate === ref) continue
    const d = distance(wanted, candidate.toLowerCase())
    if (d > Math.min(MAX_DISTANCE, Math.floor(Math.max(wanted.length, candidate.length) / 2))) continue
    if (d < bestDistance || (d === bestDistance && best !== null && candidate < best)) {
      best = candidate
      bestDistance = d
    }
  }
  return best
}
