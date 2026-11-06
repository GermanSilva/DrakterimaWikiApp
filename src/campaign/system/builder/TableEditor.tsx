import { useBuilder } from './builderContext'
import { appendAt, moveIn, type Path } from './draft'
import { newActionCategory } from './factories'
import { ColumnsEditor } from './ColumnsEditor'
import { NameAndKey } from './NameAndKey'
import { nodes, text, useNode } from './nodeHooks'
import { RowsEditor } from './RowsEditor'
import { setRewardDestination } from './sheetIndex'
import { CheckInput, Panel, ReorderButtons, SelectInput, smallBtn } from './ui'

const EDITOR_OPTIONS = [
  { value: 'dm', label: 'Solo el DM' },
  { value: 'player', label: 'El jugador del personaje (toda la tabla)' },
]

/** Editor of a table; what it shows depends on the table type. */
export function TableEditor({ path }: { path: Path }) {
  const { edit } = useBuilder()
  const { node, patch } = useNode(path)
  const type = text(node.type)
  const columns = nodes(node.columns)
  const sort = typeof node.sortBy === 'object' && node.sortBy !== null ? (node.sortBy as Record<string, unknown>) : null
  const reward = (
    <CheckInput label="Destino de recompensa" checked={node.rewardDestination === true} onChange={(on) => edit((d) => setRewardDestination(d, path, on))} />
  )

  return (
    <div className="flex flex-col gap-3">
      <NameAndKey path={path} nameLabel="Nombre del ítem" keyLabel="Clave del ítem" scope="global" />
      {(type === 'libre' || type === 'habilidad') && (
        <SelectInput label="Editable por" value={text(node.editableBy)} onChange={(editableBy) => patch({ editableBy })} options={EDITOR_OPTIONS} />
      )}
      {type === 'stat' && <RowsEditor path={path} kind="stat" />}
      {type === 'capacidades' && (
        <>
          <ColumnsEditor path={path} kind="capacidades" />
          <RowsEditor path={path} kind="capacidades" />
        </>
      )}
      {(type === 'libre' || type === 'habilidad') && (
        <>
          <ColumnsEditor path={path} kind={type} />
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectInput
              label="Ordenar por columna"
              value={text(sort?.column)}
              onChange={(column) => patch({ sortBy: column === '' ? undefined : { column, direction: text(sort?.direction) || 'asc' } })}
              options={[{ value: '', label: 'Sin orden' }, ...columns.map((c) => ({ value: text(c.key), label: text(c.label) }))]}
            />
            {sort && (
              <SelectInput
                label="Dirección"
                value={text(sort.direction)}
                onChange={(direction) => patch({ sortBy: { ...sort, direction } })}
                options={[{ value: 'asc', label: 'Ascendente' }, { value: 'desc', label: 'Descendente' }]}
              />
            )}
          </div>
        </>
      )}
      {type === 'habilidad' && <ActionCategories path={path} />}
      {type === 'monedas' && (
        <>
          <RowsEditor path={path} kind="monedas" />
          {reward}
        </>
      )}
      {type === 'economia' && (
        <>
          <p className="text-[12px] text-txt-muted">Guarda cantidades por denominación de la tabla de monedas. Solo la edita el DM.</p>
          {reward}
        </>
      )}
    </div>
  )
}

/** The classes of actions a Habilidad table declares (cantrips, spells by level...); modal blocks filter by them. */
function ActionCategories({ path }: { path: Path }) {
  const { edit, requestRemoval } = useBuilder()
  const { node } = useNode(path)
  const categories = nodes(node.categories)
  const listPath = [...path, 'categories']
  return (
    <div className="flex flex-col gap-2">
      <h4 className="font-exo text-[10px] tracking-[0.2em] uppercase text-txt-muted">Categorías de acciones</h4>
      {categories.map((category, i) => (
        <Panel key={i} name={`Categoría de acciones ${text(category.label)}`} path={[...listPath, i]}>
          <NameAndKey path={[...listPath, i]} nameLabel="Nombre de la categoría de acciones" keyLabel="Clave de la categoría de acciones" scope="siblings" />
          <ReorderButtons noun="categoría de acciones" index={i} count={categories.length} onMove={(delta) => edit((d) => moveIn(d, listPath, i, delta))} onRemove={() => requestRemoval(listPath, i)} />
        </Panel>
      ))}
      <div>
        <button type="button" className={smallBtn} disabled={categories.length >= 30} onClick={() => edit((d) => appendAt(d, listPath, newActionCategory(categories)))}>
          Agregar categoría de acciones
        </button>
      </div>
    </div>
  )
}
