import { useBuilder } from './builderContext'
import { appendAt, moveIn, type Node, type Path } from './draft'
import { newCapacidadRow, newCoinRow, newStatRow } from './factories'
import { NameAndKey } from './NameAndKey'
import { nodes, text, useNode } from './nodeHooks'
import { FormulaInput, NumberInput } from './nodeInputs'
import { statRows } from './sheetIndex'
import { Panel, ReorderButtons, SelectInput, smallBtn } from './ui'

const EDITOR_OPTIONS = [
  { value: 'dm', label: 'Solo el DM' },
  { value: 'player', label: 'El jugador del personaje' },
]

export type RowsKind = 'stat' | 'capacidades' | 'monedas'

const ADD_LABEL: Record<RowsKind, string> = { stat: 'Agregar fila', capacidades: 'Agregar fila', monedas: 'Agregar fila' }

/** The rows the DM defines in the template: stats, capabilities linked to a stat, or coin denominations (S11, S12, S14). */
export function RowsEditor({ path, kind }: { path: Path; kind: RowsKind }) {
  const { draft, edit } = useBuilder()
  const { node } = useNode(path)
  const rows = nodes(node.rows)
  const stats = statRows(draft)
  const add = (d: Node) => (kind === 'stat' ? newStatRow(d) : kind === 'capacidades' ? newCapacidadRow(d, stats[0]?.key ?? '') : newCoinRow(d, rows))
  return (
    <div className="flex flex-col gap-2">
      <h4 className="font-exo text-[10px] tracking-[0.2em] uppercase text-txt-muted">{kind === 'monedas' ? 'Denominaciones' : 'Filas'}</h4>
      {kind === 'capacidades' && stats.length === 0 && <p className="text-[12px] text-txt-muted">Primero definí una tabla de stats: cada capacidad se vincula a uno.</p>}
      {rows.map((row, i) => (
        <RowPanel key={i} path={[...path, 'rows', i]} index={i} count={rows.length} kind={kind} label={text(row.label)} />
      ))}
      <div>
        <button type="button" className={smallBtn} disabled={rows.length >= (kind === 'monedas' ? 8 : 100)} onClick={() => edit((d) => appendAt(d, [...path, 'rows'], add(d)))}>
          {ADD_LABEL[kind]}
        </button>
      </div>
    </div>
  )
}

function RowPanel({ path, index, count, kind, label }: { path: Path; index: number; count: number; kind: RowsKind; label: string }) {
  const { draft, edit, requestRemoval } = useBuilder()
  const { node, patch } = useNode(path)
  const list = path.slice(0, -1)
  const stats = statRows(draft)
  return (
    <Panel name={`Fila ${label}`}>
      <NameAndKey path={path} nameLabel="Nombre de la fila" keyLabel="Clave de la fila" scope="global" />
      {kind === 'stat' && <FormulaInput label="Fórmula del modificador" value={text(node.modifier)} onChange={(modifier) => patch({ modifier })} />}
      {kind === 'capacidades' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectInput
            label="Stat asociado"
            value={text(node.stat)}
            onChange={(stat) => patch({ stat })}
            options={[{ value: '', label: 'Elegí un stat' }, ...stats.map((s) => ({ value: s.key, label: s.label }))]}
          />
          <SelectInput
            label="Usa"
            value={text(node.use)}
            onChange={(use) => patch({ use })}
            options={[{ value: 'modificador', label: 'Modificador' }, { value: 'valor', label: 'Valor' }]}
          />
        </div>
      )}
      {kind !== 'monedas' && <SelectInput label="Valor editable por" value={text(node.editableBy)} onChange={(editableBy) => patch({ editableBy })} options={EDITOR_OPTIONS} />}
      {kind === 'monedas' && <NumberInput label="Valor en unidad base" value={node.value} onChange={(value) => patch({ value })} />}
      <ReorderButtons noun="fila" index={index} count={count} onMove={(delta) => edit((d) => moveIn(d, list, index, delta))} onRemove={() => requestRemoval(list, index)} />
    </Panel>
  )
}
