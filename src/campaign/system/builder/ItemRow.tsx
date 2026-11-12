import { useBuilder } from './builderContext'
import { moveIn, type Path } from './draft'
import { isEconomyItem } from './economy'
import { FieldEditor } from './FieldEditor'
import { itemKindLabel } from './itemLabels'
import { useNode } from './nodeHooks'
import { TableEditor } from './TableEditor'
import { Panel, ReorderButtons, smallBtn } from './ui'

interface Props {
  path: Path
  index: number
  count: number
}

/** One field or table of a section: what it is, where it sits, and (once opened) its editor. */
export function ItemRow({ path, index, count }: Props) {
  const { edit, requestRemoval } = useBuilder()
  const { node: item, patch } = useNode(path)
  const open = item._open === true
  const list = path.slice(0, -1)
  const label = typeof item.label === 'string' ? item.label : ''
  return (
    <Panel name={`Ítem ${label}`} path={path}>
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="font-exo text-[12px] font-semibold text-txt-primary">{label}</span>
        <span className="text-[12px] text-txt-muted">{itemKindLabel(item)}</span>
        <span className="text-[12px] text-txt-muted">{typeof item.key === 'string' ? item.key : ''}</span>
      </div>
      <div>
        <button type="button" className={smallBtn} aria-expanded={open} onClick={() => patch({ _open: open ? undefined : true })}>
          {open ? 'Cerrar ítem' : 'Editar ítem'}
        </button>
      </div>
      {open && (item.kind === 'table' ? <TableEditor path={path} /> : <FieldEditor path={path} />)}
      <ReorderButtons noun="ítem" index={index} count={count} onMove={(delta) => edit((d) => moveIn(d, list, index, delta))} onRemove={isEconomyItem(item) ? undefined : () => requestRemoval(list, index)} />
    </Panel>
  )
}
