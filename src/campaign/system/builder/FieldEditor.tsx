import type { FormulaContext } from '../sheet/formulaScope'
import { CALC_OPS } from '../sheet/sheetModel'
import { useBuilder } from './builderContext'
import type { Path } from './draft'
import { NameAndKey } from './NameAndKey'
import { text, useNode } from './nodeHooks'
import { FormulaWorkbench } from './formula/FormulaWorkbench'
import { NumberInput } from './nodeInputs'
import { initialOptions } from './factories'
import { DefaultEditor, OptionsEditor } from './OptionsEditor'
import { calcTables } from './sheetIndex'
import { CheckInput, SelectInput } from './ui'
import { DotsInput, TrackInputs } from './formatInputs'

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
const CALC_LABEL: Record<(typeof CALC_OPS)[number], string> = {
  suma: 'Suma',
  promedio: 'Promedio',
  conteo: 'Conteo',
  mayor: 'Mayor',
  menor: 'Menor',
  mas_frecuente: 'Más frecuente',
  menos_frecuente: 'Menos frecuente',
}

/** Editor of a field: name and key, type, who edits it, where its value comes from, bounds, default and search. */
export function FieldEditor({ path }: { path: Path }) {
  const { draft } = useBuilder()
  const { node, patch } = useNode(path)
  const type = text(node.type)
  const isNew = node._new === true
  const source = node.formula !== undefined ? 'formula' : node.calc !== undefined ? 'calc' : 'custom'
  const computed = source !== 'custom'
  const canFormula = type === 'number' || type === 'boolean' || type === 'short'
  const canCalc = type === 'number' || type === 'short'
  const calc = typeof node.calc === 'object' && node.calc !== null ? (node.calc as Record<string, unknown>) : {}
  const context: FormulaContext = { kind: 'field', key: text(node.key) }
  const tables = calcTables(draft)
  const columns = tables.find((t) => t.key === calc.table)?.columns ?? []

  const changeType = (next: string) => {
    const formulaOk = next === 'number' || next === 'boolean' || next === 'short'
    const calcOk = next === 'number' || next === 'short'
    patch({
      type: next,
      default: undefined,
      min: undefined,
      max: undefined,
      format: next === 'number' || next === 'options' ? node.format : undefined,
      searchable: next === 'number' || next === 'short' ? node.searchable : undefined,
      options: next === 'options' ? initialOptions() : undefined,
      display: next === 'options' ? 'select' : undefined,
      formula: formulaOk ? node.formula : undefined,
      overridable: formulaOk ? node.overridable : undefined,
      calc: calcOk ? node.calc : undefined,
      hidden: formulaOk || calcOk ? node.hidden : undefined,
    })
  }
  const changeSource = (next: string) => {
    if (next === 'formula') patch({ formula: '', calc: undefined, editableBy: 'dm' })
    else if (next === 'calc') patch({ calc: { table: '', op: 'suma' }, formula: undefined, overridable: undefined, editableBy: 'dm' })
    else patch({ formula: undefined, calc: undefined, overridable: undefined, hidden: undefined })
  }
  const patchCalc = (change: Record<string, unknown>) => {
    const next = { ...calc, ...change }
    if (next.column === undefined) delete next.column
    patch({ calc: next })
  }

  return (
    <div className="flex flex-col gap-3">
      <NameAndKey path={path} nameLabel="Nombre del ítem" keyLabel="Clave del ítem" scope="global" />
      <div className="grid gap-3 sm:grid-cols-3">
        <SelectInput label="Tipo" value={type} onChange={changeType} options={TYPE_OPTIONS} disabled={!isNew} />
        <SelectInput label="Editable por" value={computed ? 'dm' : text(node.editableBy)} onChange={(editableBy) => patch({ editableBy })} options={EDITOR_OPTIONS} disabled={computed} />
        {canFormula && (
          <SelectInput
            label="Origen del valor"
            value={source}
            onChange={changeSource}
            options={[{ value: 'custom', label: 'Valor propio' }, { value: 'formula', label: 'Fórmula' }, ...(canCalc ? [{ value: 'calc', label: 'Cálculo de tabla' }] : [])]}
          />
        )}
      </div>

      {source === 'formula' && (
        <div className="flex flex-col gap-2">
          <FormulaWorkbench
            label="Fórmula"
            value={text(node.formula)}
            onChange={(formula) => patch({ formula })}
            context={context}
            path={[...path, 'formula']}
            expects={type === 'boolean' ? 'boolean' : type === 'short' ? 'text' : 'number'}
            format={node.format === 'signed' ? 'signed' : undefined}
          />
          <CheckInput label="Reemplazable por un valor guardado" checked={node.overridable === true} onChange={(on) => patch({ overridable: on ? true : undefined })} />
        </div>
      )}
      {source === 'calc' && (
        <div className="grid gap-3 sm:grid-cols-3">
          <SelectInput
            label="Tabla del cálculo"
            value={text(calc.table)}
            onChange={(table) => patchCalc({ table, column: undefined })}
            options={[{ value: '', label: 'Elegí una tabla' }, ...tables.map((t) => ({ value: t.key, label: t.label }))]}
          />
          <SelectInput
            label="Columna del cálculo"
            value={text(calc.column)}
            onChange={(column) => patchCalc({ column: column === '' ? undefined : column })}
            options={[{ value: '', label: calc.op === 'conteo' ? 'Todas las filas' : 'Elegí una columna' }, ...columns.map((c) => ({ value: c.key, label: c.label }))]}
          />
          <SelectInput label="Operación" value={text(calc.op)} onChange={(op) => patchCalc({ op })} options={CALC_OPS.map((op) => ({ value: op, label: CALC_LABEL[op] }))} />
        </div>
      )}
      {computed && <CheckInput label="Oculto" checked={node.hidden === true} onChange={(on) => patch({ hidden: on ? true : undefined })} />}

      {type === 'number' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberInput label="Mínimo" value={node.min} onChange={(min) => patch({ min })} />
          <NumberInput label="Máximo" value={node.max} onChange={(max) => patch({ max })} />
        </div>
      )}
      {(type === 'number' || type === 'options') && <CheckInput label="Mostrar con signo (+)" checked={node.format === 'signed'} onChange={(on) => patch({ format: on ? 'signed' : undefined })} />}
      {type === 'number' && (
        <>
          <DotsInput path={path} />
          <TrackInputs path={path} />
        </>
      )}
      {(type === 'number' || type === 'short') && <CheckInput label="Buscable" checked={node.searchable === true} onChange={(on) => patch({ searchable: on ? true : undefined })} />}
      {!computed && <DefaultEditor path={path} names={{ value: 'Valor por defecto', checked: 'Marcado por defecto' }} />}
      {type === 'options' && <OptionsEditor path={path} context={context} />}
    </div>
  )
}
