import { useBuilder } from './builderContext'
import { getAt, isNode, moveIn, type Path } from './draft'
import { itemKindLabel } from './itemLabels'
import { Panel, ReorderButtons } from './ui'

interface Props {
  path: Path
  index: number
  count: number
}

/** One field or table of a section: what it is, where it sits, and (once opened) its editor. */
export function ItemRow({ path, index, count }: Props) {
  const { draft, edit, requestRemoval } = useBuilder()
  const found = getAt(draft, path)
  const item = isNode(found) ? found : {}
  const list = path.slice(0, -1)
  const label = typeof item.label === 'string' ? item.label : ''
  return (
    <Panel name={`Ítem ${label}`}>
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="font-exo text-[12px] font-semibold text-txt-primary">{label}</span>
        <span className="text-[12px] text-txt-muted">{itemKindLabel(item)}</span>
        <span className="text-[12px] text-txt-muted">{typeof item.key === 'string' ? item.key : ''}</span>
      </div>
      <ReorderButtons noun="ítem" index={index} count={count} onMove={(delta) => edit((d) => moveIn(d, list, index, delta))} onRemove={() => requestRemoval(list, index)} />
    </Panel>
  )
}
