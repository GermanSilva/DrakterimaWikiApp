import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

/** `path` + the current query string, so a link keeps the list's filters (`?tipo=avance`, `?rel=aliado&q=ana`). */
export const withSearch = (path: string, search: string): string => `${path}${search}`

/**
 * One list filter kept in the URL (`?key=value`): it survives opening a detail and coming back, and the
 * browser's back button restores it. The default value is never written, an unknown value reads as the
 * default (a hand-edited URL cannot put the page in an impossible state), and changes REPLACE the
 * history entry so typing in a search box does not create one entry per key stroke.
 */
export function useUrlParam(key: string, fallback: string, allowed?: readonly string[]): [string, (value: string) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get(key)
  const value = raw !== null && (!allowed || allowed.includes(raw)) ? raw : fallback
  const set = useCallback(
    (next: string) => {
      setParams(
        (prev) => {
          const copy = new URLSearchParams(prev)
          if (next === fallback || next === '') copy.delete(key)
          else copy.set(key, next)
          return copy
        },
        { replace: true },
      )
    },
    [key, fallback, setParams],
  )
  return [value, set]
}
