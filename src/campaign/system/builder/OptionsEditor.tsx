import { useBuilder } from './builderContext'
import { appendAt, moveIn, type Path } from './draft'
import { newOption } from './factories'
import { NameAndKey } from './NameAndKey'
import { nodes, text, useNode } from './nodeHooks'
import { FormulaInput } from './nodeInputs'
import { CheckInput, Panel, ReorderButtons, SelectInput, smallBtn, TextInput } from './ui'

/** The default of a field or column, by type; an empty value removes it. `names` are the labels of the inputs. */
export function DefaultEditor({ path, names }: { path: Path; names: { value: string; checked: string } }) {
  const { node, patch } = useNode(path)
  const type = text(node.type)
  if (type === 'boolean') return <CheckInput label={names.checked} checked={node.default === true} onChange={(on) => patch({ default: on ? true : undefined })} />
  if (type === 'options') {
    const keys = nodes(node.options).map((o) => text(o.key))
    return (
      <SelectInput
        label={names.value}
        value={typeof node.default === 'string' ? node.default : ''}
        onChange={(v) => patch({ default: v === '' ? undefined : v })}
        options={[{ value: '', label: 'Sin valor por defecto' }, ...keys.map((k) => ({ value: k, label: text(nodes(node.options).find((o) => o.key === k)?.label) || k }))]}
      />
    )
  }
  if (type === 'number') {
    return (
      <TextInput
        label={names.value}
        value={typeof node.default === 'number' ? String(node.default) : ''}
        inputMode="decimal"
        onChange={(v) => {
          const n = Number(v.trim().replace(',', '.'))
          patch({ default: v.trim() === '' || !Number.isFinite(n) ? undefined : n })
        }}
      />
    )
  }
  return <TextInput label={names.value} value={typeof node.default === 'string' ? node.default : ''} onChange={(v) => patch({ default: v === '' ? undefined : v })} />
}

/** The choices of an options field or column (2 to 20), how they are drawn, and one formula per choice. */
export function OptionsEditor({ path }: { path: Path }) {
  const { edit } = useBuilder()
  const { node, patch } = useNode(path)
  const options = nodes(node.options)
  return (
    <div className="flex flex-col gap-2">
      <SelectInput
        label="Mostrar como"
        value={text(node.display) || 'select'}
        onChange={(display) => patch({ display })}
        options={[{ value: 'select', label: 'Lista desplegable' }, { value: 'checkbox', label: 'Casilla (exactamente dos opciones)' }]}
      />
      {options.map((option, i) => (
        <OptionPanel key={i} path={[...path, 'options', i]} index={i} count={options.length} label={text(option.label)} />
      ))}
      <div>
        <button type="button" className={smallBtn} disabled={options.length >= 20} onClick={() => edit((d) => appendAt(d, [...path, 'options'], newOption(options)))}>
          Agregar opción
        </button>
      </div>
    </div>
  )
}

function OptionPanel({ path, index, count, label }: { path: Path; index: number; count: number; label: string }) {
  const { edit, requestRemoval } = useBuilder()
  const { node, patch } = useNode(path)
  const list = path.slice(0, -1)
  return (
    <Panel name={`Opción ${label}`}>
      <NameAndKey path={path} nameLabel="Nombre de la opción" keyLabel="Clave de la opción" scope="siblings" />
      <FormulaInput label="Fórmula de la opción" value={text(node.formula)} optional onChange={(v) => patch({ formula: v === '' ? undefined : v })} />
      <ReorderButtons noun="opción" index={index} count={count} onMove={(delta) => edit((d) => moveIn(d, list, index, delta))} onRemove={() => requestRemoval(list, index)} />
    </Panel>
  )
}
