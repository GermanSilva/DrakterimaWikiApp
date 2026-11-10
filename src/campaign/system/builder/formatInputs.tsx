import { useBuilder } from './builderContext'
import { isNode, type Node, type Path } from './draft'
import { text, useNode } from './nodeHooks'
import { NumberInput } from './nodeInputs'
import { SelectInput } from './ui'

/**
 * Dots and tracks of a number (odd/tasks/ficha-indice-lateral.md S15): "Puntos" draws the value as that many dots (1 to 10,
 * empty = a plain number); a track draws the value as boxes and counts the damage in two other number fields.
 */
export function DotsInput({ path, label = 'Mostrar como puntos (máximo, 1 a 10)' }: { path: Path; label?: string }) {
  const { node, patch } = useNode(path)
  return <NumberInput label={label} value={node.dots} onChange={(dots) => patch({ dots })} />
}

const nodes = (v: unknown): Node[] => (Array.isArray(v) ? v.filter(isNode) : [])

export function TrackInputs({ path }: { path: Path }) {
  const { draft } = useBuilder()
  const { node, patch } = useNode(path)
  const self = text(node.key)
  const track = isNode(node.track) ? node.track : null
  const numbers = nodes(draft.categories)
    .flatMap((c) => nodes(c.sections))
    .flatMap((s) => nodes(s.items))
    .filter((i) => i.kind === 'field' && i.type === 'number' && typeof i.key === 'string' && i.key !== self)
    .map((i) => ({ value: i.key as string, label: `${text(i.label)} (${i.key as string})` }))
  const set = (name: 'superficial' | 'aggravated', key: string) => {
    const next = Object.fromEntries(Object.entries({ ...(track ?? {}), [name]: key === '' ? undefined : key }).filter(([, v]) => v !== undefined))
    patch({ track: Object.keys(next).length === 0 ? undefined : next })
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectInput label="Casillas: daño leve en" value={track && typeof track.superficial === 'string' ? track.superficial : ''} onChange={(v) => set('superficial', v)} options={[{ value: '', label: 'Sin casillas' }, ...numbers]} />
      {track && (
        <SelectInput label="Casillas: daño agravado en" value={typeof track.aggravated === 'string' ? track.aggravated : ''} onChange={(v) => set('aggravated', v)} options={[{ value: '', label: 'Sin daño agravado' }, ...numbers]} />
      )}
    </div>
  )
}
