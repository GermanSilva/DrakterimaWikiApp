import { useState } from 'react'
import { useBuilder } from './builderContext'
import { appendAt, getAt, isNode, moveIn, type Node, type Path } from './draft'
import { newBlock, newField, newTable, TABLE_TYPES, type TableType } from './factories'
import { BlockPanel } from './BlockPanel'
import { ItemRow } from './ItemRow'
import { NameAndKey } from './NameAndKey'
import { Panel, ReorderButtons, SelectInput, smallBtn } from './ui'

const TABLE_LABEL: Record<TableType, string> = {
  stat: 'Stat',
  capacidades: 'Capacidades',
  habilidad: 'Habilidad',
  libre: 'Libre',
  monedas: 'Monedas',
  economia: 'Economía',
}

const nodes = (v: unknown): Node[] => (Array.isArray(v) ? v.filter(isNode) : [])

interface Props {
  path: Path
  index: number
  count: number
}

/** One section: its name, its items (fields and tables), and the blocks that decide how the detail view draws them. */
export function SectionPanel({ path, index, count }: Props) {
  const { draft, edit, requestRemoval } = useBuilder()
  const found = getAt(draft, path)
  const section = isNode(found) ? found : {}
  const items = nodes(section.items)
  const blocks = nodes(section.blocks)
  const [tableType, setTableType] = useState<TableType>('stat')
  const list = path.slice(0, -1)

  return (
    <Panel name={`Sección ${typeof section.label === 'string' ? section.label : ''}`}>
      <NameAndKey path={path} nameLabel="Nombre de la sección" keyLabel="Clave de la sección" scope="sections" />
      <ReorderButtons noun="sección" index={index} count={count} onMove={(delta) => edit((d) => moveIn(d, list, index, delta))} onRemove={() => requestRemoval(list, index)} />

      <div className="flex flex-col gap-2">
        {items.map((item, i) => (
          <ItemRow key={i} path={[...path, 'items', i]} index={i} count={items.length} />
        ))}
        <div className="flex flex-wrap items-end gap-3">
          <button type="button" className={smallBtn} onClick={() => edit((d) => appendAt(d, [...path, 'items'], newField(d)))}>
            Agregar campo
          </button>
          <SelectInput label="Tipo de tabla" value={tableType} onChange={(v) => setTableType(v as TableType)} options={TABLE_TYPES.map((t) => ({ value: t, label: TABLE_LABEL[t] }))} />
          <button type="button" className={smallBtn} onClick={() => edit((d) => appendAt(d, [...path, 'items'], newTable(d, tableType)))}>
            Agregar tabla
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {blocks.map((block, i) => (
          <BlockPanel key={i} path={[...path, 'blocks', i]} items={items} others={blocks.filter((_, j) => j !== i)} index={i} count={blocks.length} />
        ))}
        <div>
          <button type="button" className={smallBtn} onClick={() => edit((d) => appendAt(d, [...path, 'blocks'], newBlock(blocks)))}>
            Agregar bloque
          </button>
        </div>
      </div>
    </Panel>
  )
}
