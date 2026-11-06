import { BLOCK_MODES, type BlockMode } from '../sheet/sheetModel'
import { useBuilder } from './builderContext'
import { getAt, isNode, moveIn, setAt, type Node, type Path } from './draft'
import { NameAndKey } from './NameAndKey'
import { CheckInput, Panel, ReorderButtons, SelectInput, smallBtn, TextInput } from './ui'

const MODE_LABEL: Record<BlockMode, string> = { stat: 'Stat', tile: 'Tile', capacidades: 'Capacidades', plano: 'Plano', modal: 'Modal' }

const text = (v: unknown) => (typeof v === 'string' ? v : '')
const nodes = (v: unknown): Node[] => (Array.isArray(v) ? v.filter(isNode) : [])
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/** Which items a display mode can show (the validator's rule): fields in a tile, one table type per other mode, anything flat. */
function fits(mode: string, item: Node): boolean {
  const type = item.kind === 'table' ? item.type : null
  switch (mode) {
    case 'stat':
      return type === 'stat'
    case 'capacidades':
      return type === 'capacidades'
    case 'modal':
      return type === 'habilidad'
    case 'tile':
      return type === null
    default:
      return true
  }
}

const blockName = (block: Node) => text(block.title) || text(block.key)

interface Props {
  /** Path of the block. */
  path: Path
  /** The items of the section the block belongs to. */
  items: Node[]
  /** The other blocks of the section: an item is shown by one block only. */
  others: Node[]
  index: number
  count: number
}

export function BlockPanel({ path, items, others, index, count }: Props) {
  const { draft, edit, requestRemoval } = useBuilder()
  const found = getAt(draft, path)
  const block = isNode(found) ? found : {}
  const list = path.slice(0, -1)
  const mode = text(block.mode)
  const shown = strings(block.items)
  const usedElsewhere = new Set(others.flatMap((b) => strings(b.items)))
  const patch = (change: Node) => edit((d) => setAt(d, path, { ...(getAt(d, path) as Node), ...change }))

  const changeMode = (next: string) =>
    edit((d) => {
      const { filterCategories, ...rest } = getAt(d, path) as Node
      const keep = shown.filter((k) => items.some((i) => i.key === k && fits(next, i)))
      return setAt(d, path, { ...rest, mode: next, items: keep, ...(next === 'modal' ? { filterCategories: filterCategories ?? [] } : {}) })
    })
  const toggle = (key: string, on: boolean) => patch({ items: on ? [...shown, key] : shown.filter((k) => k !== key) })

  const candidates = items.filter((i) => fits(mode, i))
  const table = items.find((i) => i.kind === 'table' && i.type === 'habilidad' && shown.includes(i.key as string))
  const declared = nodes(table?.categories)
  const filter = strings(block.filterCategories)
  const labelOf = (key: string) => text(declared.find((c) => c.key === key)?.label) || key
  const moveFilter = (at: number, delta: -1 | 1) => edit((d) => moveIn(d, [...path, 'filterCategories'], at, delta))

  return (
    <Panel name={`Bloque ${blockName(block)}`}>
      <NameAndKey path={path} nameLabel="Título del bloque" keyLabel="Clave del bloque" scope="siblings" field="title" />
      <SelectInput label="Modo" value={mode} onChange={changeMode} options={BLOCK_MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }))} />
      <fieldset className="flex flex-col gap-1">
        <legend className="font-exo text-[10px] tracking-[0.2em] uppercase text-txt-muted mb-1">Ítems que muestra</legend>
        {candidates.length === 0 && <p className="text-[12px] text-txt-muted">Esta sección no tiene ítems que encajen con el modo elegido.</p>}
        {candidates.map((item) => (
          <CheckInput key={text(item.key)} label={text(item.label)} checked={shown.includes(text(item.key))} disabled={usedElsewhere.has(text(item.key))} onChange={(on) => toggle(text(item.key), on)} />
        ))}
      </fieldset>
      {mode === 'modal' && declared.length > 0 && (
        <fieldset className="flex flex-col gap-1">
          <legend className="font-exo text-[10px] tracking-[0.2em] uppercase text-txt-muted mb-1">Categorías que muestra</legend>
          {declared.map((c) => (
            <CheckInput
              key={text(c.key)}
              label={text(c.label)}
              checked={filter.includes(text(c.key))}
              onChange={(on) => patch({ filterCategories: on ? [...filter, text(c.key)] : filter.filter((k) => k !== c.key) })}
            />
          ))}
          <p className="text-[12px] text-txt-muted">{`Orden: ${filter.map(labelOf).join(', ')}`}</p>
          <div className="flex flex-wrap gap-2">
            {filter.map((key, at) => (
              <span key={key} className="flex gap-1">
                <button type="button" className={smallBtn} disabled={at === 0} onClick={() => moveFilter(at, -1)}>{`Subir categoría filtrada ${labelOf(key)}`}</button>
                <button type="button" className={smallBtn} disabled={at === filter.length - 1} onClick={() => moveFilter(at, 1)}>{`Bajar categoría filtrada ${labelOf(key)}`}</button>
              </span>
            ))}
          </div>
        </fieldset>
      )}
      {mode === 'modal' && declared.length === 0 && table && (
        <TextInput label="Categorías que muestra (separadas por coma)" value={filter.join(', ')} onChange={(v) => patch({ filterCategories: v.split(',').map((s) => s.trim()).filter(Boolean) })} />
      )}
      <ReorderButtons noun="bloque" index={index} count={count} onMove={(delta) => edit((d) => moveIn(d, list, index, delta))} onRemove={() => requestRemoval(list, index)} />
    </Panel>
  )
}
