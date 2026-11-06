/** Helpers every item editor uses to read and patch one node of the draft. */
import { useBuilder } from './builderContext'
import { getAt, isNode, setAt, type Node, type Path } from './draft'

/** The node at `path` and `patch`, which merges properties into it (an `undefined` value removes the property). */
export function useNode(path: Path) {
  const { draft, edit } = useBuilder()
  const found = getAt(draft, path)
  const node: Node = isNode(found) ? found : {}
  const patch = (change: Node) =>
    edit((d) => {
      const next: Node = { ...(getAt(d, path) as Node) }
      for (const [key, value] of Object.entries(change)) {
        if (value === undefined) delete next[key]
        else next[key] = value
      }
      return setAt(d, path, next)
    })
  return { node, patch }
}

export const text = (value: unknown): string => (typeof value === 'string' ? value : '')
export const nodes = (value: unknown): Node[] => (Array.isArray(value) ? value.filter(isNode) : [])
