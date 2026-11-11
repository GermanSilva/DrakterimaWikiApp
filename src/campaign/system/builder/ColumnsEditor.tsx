import type { FormulaContext } from '../sheet/formulaScope'
import { useBuilder } from './builderContext'
import { appendAt, getAt, isNode, moveIn, type Path } from './draft'
import { initialOptions, newColumnNode } from './factories'
import { NameAndKey } from './NameAndKey'
import { nodes, text, useNode } from './nodeHooks'
import { FormulaWorkbench } from './formula/FormulaWorkbench'
import { NumberInput } from './nodeInputs'
import { DefaultEditor, OptionsEditor } from './OptionsEditor'
import { CheckInput, Panel, ReorderButtons, SelectInput, smallBtn } from './ui'
import { DotsInput } from './formatInputs'

const TYPE_OPTIONS = [
  { value: 'short', label: 'Texto corto' },
  { value: 'paragraph', label: 'Párrafo' },
  { value: 'number', label: 'Número' },
  { value: 'boolean', label: 'Sí/No' },
  { value: 'options', label: 'Opciones' },
]
const EDITOR_OPTIONS = [
  { value: 'dm', label: 'Solo el DM' },
  { value: 'player', label: 'El jugador del personaje' },
]
const RESET_OPTIONS = [
  { value: 'none', label: 'Sin reinicio' },
  { value: 'zero', label: 'A cero' },
  { value: 'column', label: 'Al valor de otra columna' },
  { value: 'value', label: 'A un valor fijo' },
]
const SCOPE_OPTIONS = [
  { value: 'entry', label: 'La entrada (compartida)' },
  { value: 'character', label: 'Cada personaje' },
]

export type TableKind = 'capacidades' | 'libre' | 'habilidad'

/** The columns of a Capacidades, Libre or Habilidad table (1..12). */
export function ColumnsEditor({ path, kind }: { path: Path; kind: TableKind }) {
  const { edit } = useBuilder()
  const { node } = useNode(path)
  const columns = nodes(node.columns)
  return (
    <div className="flex flex-col gap-2">
      <h4 className="font-exo text-[10px] tracking-[0.2em] uppercase text-txt-muted">Columnas</h4>
      {columns.map((column, i) => (
        <ColumnPanel key={i} path={[...path, 'columns', i]} index={i} count={columns.length} kind={kind} label={text(column.label)} siblings={columns} />
      ))}
      <div>
        <button type="button" className={smallBtn} disabled={columns.length >= 12} onClick={() => edit((d) => appendAt(d, [...path, 'columns'], newColumnNode(columns)))}>
          Agregar columna
        </button>
      </div>
    </div>
  )
}

interface ColumnProps {
  path: Path
  index: number
  count: number
  kind: TableKind
  label: string
  siblings: Record<string, unknown>[]
}

function ColumnPanel({ path, index, count, kind, label, siblings }: ColumnProps) {
  const { draft, edit, requestRemoval } = useBuilder()
  const { node, patch } = useNode(path)
  const type = text(node.type)
  const table = getAt(draft, path.slice(0, -2))
  const context: FormulaContext = { kind: 'column', table: isNode(table) ? text(table.key) : '', column: text(node.key) }
  const isNew = node._new === true
  const list = path.slice(0, -1)
  const formula = node.formula !== undefined
  const reset = typeof node.reset === 'object' && node.reset !== null ? (node.reset as Record<string, unknown>) : null
  const resetKind = reset ? text(reset.to) : 'none'
  const resettable = kind !== 'capacidades' && type === 'number' && !formula
  const otherNumbers = siblings.filter((c) => c.type === 'number' && c.key !== node.key)

  const changeType = (next: string) => {
    const formulaOk = next === 'number' || next === 'boolean'
    patch({
      type: next,
      default: undefined,
      formula: formulaOk ? node.formula : undefined,
      format: next === 'number' || next === 'options' ? node.format : undefined,
      options: next === 'options' ? initialOptions() : undefined,
      display: next === 'options' ? 'select' : undefined,
      reset: next === 'number' && !formula ? node.reset : undefined,
    })
  }
  const changeReset = (to: string) => {
    if (to === 'none') patch({ reset: undefined })
    else if (to === 'zero') patch({ reset: { to: 'zero' } })
    else if (to === 'column') patch({ reset: { to: 'column', column: text(otherNumbers[0]?.key) } })
    else patch({ reset: { to: 'value', value: 0 } })
  }

  return (
    <Panel name={`Columna ${label}`} path={path}>
      <NameAndKey path={path} nameLabel="Nombre de la columna" keyLabel="Clave de la columna" scope="siblings" />
      <div className="grid gap-3 sm:grid-cols-3">
        <SelectInput label="Tipo de la columna" value={type} onChange={changeType} options={TYPE_OPTIONS} disabled={!isNew} />
        <SelectInput label="Editable por (columna)" value={text(node.editableBy)} onChange={(editableBy) => patch({ editableBy })} options={EDITOR_OPTIONS} />
        {kind === 'habilidad' && !formula && <SelectInput label="Pertenece a" value={text(node.scope) || 'entry'} onChange={(scope) => patch({ scope })} options={SCOPE_OPTIONS} />}
      </div>
      {(type === 'number' || type === 'boolean') && (
        <SelectInput
          label="Origen de la columna"
          value={formula ? 'formula' : 'custom'}
          onChange={(source) => patch(source === 'formula' ? { formula: '', reset: undefined, scope: undefined } : { formula: undefined })}
          options={[{ value: 'custom', label: 'Valor propio' }, { value: 'formula', label: 'Fórmula' }]}
        />
      )}
      {formula && (
        <FormulaWorkbench
          label="Fórmula de la columna"
          value={text(node.formula)}
          onChange={(v) => patch({ formula: v })}
          context={context}
          path={[...path, 'formula']}
          expects={type === 'boolean' ? 'boolean' : 'number'}
          format={node.format === 'signed' ? 'signed' : undefined}
        />
      )}
      {(type === 'number' || type === 'options') && <CheckInput label="Mostrar con signo (columna)" checked={node.format === 'signed'} onChange={(on) => patch({ format: on ? 'signed' : undefined })} />}
      {type === 'number' && <DotsInput path={path} label="Mostrar la columna como puntos (máximo, 1 a 10)" />}
      <DefaultEditor path={path} names={{ value: 'Valor por defecto de la columna', checked: 'Marcado por defecto (columna)' }} />
      {type === 'options' && <OptionsEditor path={path} context={context} />}
      {resettable && (
        <div className="grid gap-3 sm:grid-cols-3">
          <SelectInput label="Reinicio de la columna" value={resetKind} onChange={changeReset} options={RESET_OPTIONS} />
          {resetKind === 'column' && (
            <SelectInput
              label="Columna de reinicio"
              value={text(reset?.column)}
              onChange={(column) => patch({ reset: { to: 'column', column } })}
              options={[{ value: '', label: 'Elegí una columna' }, ...otherNumbers.map((c) => ({ value: text(c.key), label: text(c.label) }))]}
            />
          )}
          {resetKind === 'value' && <NumberInput label="Valor de reinicio" value={reset?.value} onChange={(value) => patch({ reset: { to: 'value', value: value ?? 0 } })} />}
        </div>
      )}
      <ReorderButtons noun="columna" index={index} count={count} onMove={(delta) => edit((d) => moveIn(d, list, index, delta))} onRemove={() => requestRemoval(list, index)} />
    </Panel>
  )
}
