import { useBuilder } from './builderContext'
import { appendAt, moveIn, type Node, type Path } from './draft'
import { newCapacidadRow, newStatRow } from './factories'
import { NameAndKey } from './NameAndKey'
import { nodes, text, useNode } from './nodeHooks'
import { FormulaWorkbench } from './formula/FormulaWorkbench'
import { statRows } from './sheetIndex'
import { Panel, ReorderButtons, SelectInput, smallBtn } from './ui'

const EDITOR_OPTIONS = [
  { value: 'dm', label: 'Solo el DM' },
  { value: 'player', label: 'El jugador del personaje' },
]

export type RowsKind = 'stat' | 'capacidades'

/** The rows the DM defines in the template: stats, or capabilities linked to a stat (S11). Coin denominations are edited in Sistema › Economía. */
export function RowsEditor({ path, kind }: { path: Path; kind: RowsKind }) {
  const { draft, edit } = useBuilder()
  const { node } = useNode(path)
  const rows = nodes(node.rows)
  const stats = statRows(draft)
  const add = (d: Node) => (kind === 'stat' ? newStatRow(d) : newCapacidadRow(d, stats[0]?.key ?? ''))
  return (
    <div className="flex flex-col gap-2">
      <h4 className="font-exo text-[10px] tracking-[0.2em] uppercase text-txt-muted">Filas</h4>
      {kind === 'capacidades' && stats.length === 0 && <p className="text-[12px] text-txt-muted">Primero definí una tabla de stats: cada capacidad se vincula a uno.</p>}
      {rows.map((row, i) => (
        <RowPanel key={i} path={[...path, 'rows', i]} index={i} count={rows.length} kind={kind} label={text(row.label)} />
      ))}
      <div>
        <button type="button" className={smallBtn} disabled={rows.length >= 100} onClick={() => edit((d) => appendAt(d, [...path, 'rows'], add(d)))}>
          Agregar fila
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
    <Panel name={`Fila ${label}`} path={path}>
      <NameAndKey path={path} nameLabel="Nombre de la fila" keyLabel="Clave de la fila" scope="global" />
      {kind === 'stat' && (
        <FormulaWorkbench
          label="Fórmula del modificador"
          value={text(node.modifier)}
          onChange={(modifier) => patch({ modifier })}
          context={{ kind: 'stat', row: text(node.key) }}
          path={[...path, 'modifier']}
          format="signed"
        />
      )}
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
      <SelectInput label="Valor editable por" value={text(node.editableBy)} onChange={(editableBy) => patch({ editableBy })} options={EDITOR_OPTIONS} />
      <ReorderButtons noun="fila" index={index} count={count} onMove={(delta) => edit((d) => moveIn(d, list, index, delta))} onRemove={() => requestRemoval(list, index)} />
    </Panel>
  )
}
