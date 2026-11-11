/** Splits a formula into coloured pieces for the editor overlay (S42 a). Tolerant: it never fails on a formula the parser rejects. */
import { FORMULA_FUNCTION_NAMES, type SourceSpan } from '../../formula/formula'

export type TokenKind = 'ref' | 'fn' | 'str' | 'num' | 'op' | 'text'

export interface Segment {
  text: string
  kind: TokenKind
  /** Offset in the formula. */
  start: number
  /** A reference the sheet does not have. */
  unknown?: true
  /** Inside the span the parser complained about. */
  error?: true
}

const PIECE = /(\{[^}\n]*\}?)|("[^"\n]*"?)|(\d+(?:\.\d+)?)|([a-z]+)|([+\-*/%&<>=!(),])|([\s\S])/g

function pieces(source: string, unknown: ReadonlySet<string>): Segment[] {
  const out: Segment[] = []
  for (const match of source.matchAll(PIECE)) {
    const [text, ref, str, num, name, op] = match
    const start = match.index ?? 0
    if (ref) out.push({ text, kind: 'ref', start, ...(unknown.has(ref.slice(1).replace(/\}$/, '')) ? { unknown: true as const } : {}) })
    else if (str) out.push({ text, kind: 'str', start })
    else if (num) out.push({ text, kind: 'num', start })
    else if (name) out.push({ text, kind: FORMULA_FUNCTION_NAMES.includes(name) ? 'fn' : 'text', start })
    else if (op) out.push({ text, kind: 'op', start })
    else out.push({ text, kind: 'text', start })
  }
  return out
}

/** The pieces of `source`, with the ones in `error` flagged (cut at its edges). An empty span at the end of the text becomes a marker space. */
export function highlight(source: string, unknown: ReadonlySet<string>, error: SourceSpan | null): Segment[] {
  const all = pieces(source, unknown)
  if (!error) return all
  if (error.start >= error.end) return error.start >= source.length ? [...all, { text: ' ', kind: 'text', start: source.length, error: true }] : all
  const out: Segment[] = []
  for (const seg of all) {
    const end = seg.start + seg.text.length
    const from = Math.max(seg.start, error.start)
    const to = Math.min(end, error.end)
    if (from >= to) {
      out.push(seg)
      continue
    }
    const cut = (a: number, b: number, flagged: boolean) => {
      if (a < b) out.push({ ...seg, text: seg.text.slice(a - seg.start, b - seg.start), start: a, ...(flagged ? { error: true as const } : {}) })
    }
    cut(seg.start, from, false)
    cut(from, to, true)
    cut(to, end, false)
  }
  return out
}
