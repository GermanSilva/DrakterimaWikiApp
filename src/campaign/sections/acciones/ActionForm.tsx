import { useState, type FormEvent } from 'react'
import { btnPrimary, btnSecondary, inputCls, labelCls } from '../../../constants'
import type { ActionInput, CampaignAction } from '../../../data'
import { useCampaignServices } from '../../entities/campaignServicesContext'
import { describeDataError } from '../../entities/errorMessages'
import { entryColumns, type HabilidadTable } from '../../system/actions/tables'
import { Control } from '../../system/sheet/Control'

export interface PjOption {
  id: number
  nombre: string
}

interface Props {
  tables: HabilidadTable[]
  characters: PjOption[]
  /** The entry being edited; null creates one. */
  initial: CampaignAction | null
  onSaved: () => void
  onCancel: () => void
}

/** The category a table starts with: the first declared one (a declared table always gets one), the typed text for free text. */
const startCategory = (table: HabilidadTable | undefined, current = ''): string => {
  if (!table?.categories) return current
  return table.categories.some((c) => c.key === current) ? current : (table.categories[0]?.key ?? '')
}

const isEmpty = (value: unknown) => value === undefined || value === null || value === ''

/** Entry form of the DM catalogue: table, category, name, description, the entry-scope columns, and the character it is private to. */
export function ActionForm({ tables, characters, initial, onSaved, onCancel }: Props) {
  const { layer, campaignId } = useCampaignServices()
  const [tableKey, setTableKey] = useState(initial?.table_key ?? tables[0]?.key ?? '')
  const table = tables.find((t) => t.key === tableKey)
  const [category, setCategory] = useState(() => startCategory(table, initial?.category ?? ''))
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [extras, setExtras] = useState<Record<string, unknown>>(initial?.extras ?? {})
  const [privateTo, setPrivateTo] = useState<number | null>(initial?.private_to_pj ?? null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const columns = table ? entryColumns(table) : []

  function changeTable(key: string) {
    setTableKey(key)
    setCategory(startCategory(tables.find((t) => t.key === key)))
    setExtras({})
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (saving || !table) return
    if (name.trim() === '') {
      setError('El nombre es obligatorio.')
      return
    }
    // only the entry-scope columns travel, and only the ones with a value (an empty control is no value)
    const sent = Object.fromEntries(columns.filter((c) => !isEmpty(extras[c.key])).map((c) => [c.key, extras[c.key]]))
    const input: ActionInput = { table_key: table.key, category: startCategory(table, category), name: name.trim(), description, extras: sent, private_to_pj: privateTo }
    setSaving(true)
    setError(null)
    try {
      if (initial) {
        // the table of an existing entry is not changed here
        await layer.actions.updateAction(initial.id, { category: input.category, name: input.name, description, extras: sent, private_to_pj: privateTo })
      } else {
        await layer.actions.createAction(campaignId, input)
      }
      onSaved()
    } catch (err) {
      console.error('No se pudo guardar la acción', err)
      setError(describeDataError(err, 'No se pudo guardar la acción. Intentá de nuevo.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form aria-label="Acción" onSubmit={(e) => void submit(e)} className="bg-bg-card border border-border-base p-5 mb-6 space-y-4">
      <div className="grid grid-cols-2 max-md:grid-cols-1 gap-4">
        <div>
          <label className={labelCls} htmlFor="accion-tabla">Tabla</label>
          <select id="accion-tabla" className={inputCls} value={tableKey} disabled={initial !== null} onChange={(e) => changeTable(e.target.value)}>
            {tables.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="accion-categoria">Categoría</label>
          {table?.categories ? (
            <select id="accion-categoria" className={inputCls} value={startCategory(table, category)} onChange={(e) => setCategory(e.target.value)}>
              {table.categories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          ) : (
            <input id="accion-categoria" className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)} />
          )}
        </div>
      </div>
      <div>
        <label className={labelCls} htmlFor="accion-nombre">Nombre</label>
        <input id="accion-nombre" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className={labelCls} htmlFor="accion-descripcion">Descripción</label>
        <textarea id="accion-descripcion" className={`${inputCls} resize-y min-h-[70px]`} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      {columns.length > 0 && (
        <div className="grid grid-cols-2 max-md:grid-cols-1 gap-4">
          {columns.map((c) => (
            <div key={c.key}>
              <div className={labelCls}>{c.label}</div>
              <Control
                label={c.label}
                type={c.type}
                editable
                value={extras[c.key]}
                options={c.options?.map((o) => ({ key: o.key, label: o.label }))}
                display={c.display}
                default={c.default}
                onChange={(value) => setExtras((prev) => ({ ...prev, [c.key]: value }))}
              />
            </div>
          ))}
        </div>
      )}
      <div>
        <label className={labelCls} htmlFor="accion-privada">Privada de un personaje</label>
        <select id="accion-privada" className={inputCls} value={privateTo === null ? '' : String(privateTo)} onChange={(e) => setPrivateTo(e.target.value === '' ? null : Number(e.target.value))}>
          <option value="">Compartida con todos</option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-accent-bright">
          {error}
        </p>
      )}
      <div className="flex gap-2.5 justify-end">
        <button type="button" className={btnSecondary} onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className={btnPrimary} disabled={saving}>
          Guardar
        </button>
      </div>
    </form>
  )
}
