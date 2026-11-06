/**
 * The link panel of one Habilidad table inside the character editor (S36, S37): the entries the character links with the
 * state columns of each link, and, for the DM, the picker that links or unlinks entries. Every change is written at once
 * (a link is its own row, not part of the character draft) and announced with notifyLinksChanged so the detail refetches.
 */
import { useEffect, useMemo, useState } from 'react'
import { inputCls, labelCls } from '../../../constants'
import type { CampaignAction, LinkedAction } from '../../../data'
import { describeDataError } from '../../entities/errorMessages'
import { Control } from '../sheet/Control'
import { notifyLinksChanged } from './linkEvents'
import { useActionLinks } from './linksContext'
import { allowedStatePatch, categoryLabel, groupByCategory, stateColumns, stateRules, type HabilidadTable } from './tables'
import { useLinkedActions } from './useLinkedActions'
import type { Column } from '../sheet/sheetModel'

const PICKER_LIMIT = 50
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

interface StateFieldProps {
  label: string
  column: Column
  stored: unknown
  editable: boolean
  onCommit: (value: unknown) => void
}

/** One state control: a checkbox or a select writes when it changes; text and numbers when the field loses focus. */
function StateField({ label, column, stored, editable, onCommit }: StateFieldProps) {
  const [value, setValue] = useState(stored)
  const immediate = column.type === 'boolean' || column.type === 'options'
  return (
    <div className="min-w-[120px]">
      <div className={labelCls}>{column.label}</div>
      <Control
        label={label}
        type={column.type}
        editable={editable}
        value={value}
        options={column.options?.map((o) => ({ key: o.key, label: o.label }))}
        display={column.display}
        default={column.default}
        onChange={(next) => {
          setValue(next)
          if (immediate) onCommit(next)
        }}
        onBlur={() => {
          if (!immediate && !same(value, stored)) onCommit(value)
        }}
      />
    </div>
  )
}

export function ActionLinksPanel({ table, pjId, isDM }: { table: HabilidadTable; pjId: number; isDM: boolean }) {
  const port = useActionLinks()
  const { linked, reload } = useLinkedActions(port?.actions ?? null, pjId, true)
  const [catalogue, setCatalogue] = useState<CampaignAction[]>([])
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')

  useEffect(() => {
    if (!port || !isDM) return
    let live = true
    port.actions.listActions(port.campaignId).then(
      (items) => live && setCatalogue(items),
      (err) => {
        console.error('No se pudo leer la colección de acciones', err)
        if (live) setError(describeDataError(err, 'No pudimos cargar el catálogo de acciones.'))
      },
    )
    return () => {
      live = false
    }
  }, [port, isDM])

  const mine = useMemo(() => linked.filter((entry) => entry.action.table_key === table.key), [linked, table.key])
  const rules = useMemo(() => stateRules(table, isDM), [table, isDM])
  const columns = stateColumns(table)
  const linkedIds = useMemo(() => new Set(linked.map((entry) => entry.action.id)), [linked])
  const candidates = useMemo(
    () =>
      catalogue.filter(
        (a) =>
          a.table_key === table.key &&
          (a.private_to_pj === null || a.private_to_pj === pjId) &&
          !linkedIds.has(a.id) &&
          (category === '' || a.category === category) &&
          a.name.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [catalogue, table.key, pjId, linkedIds, category, query],
  )
  const categories = table.categories ?? [...new Set(catalogue.filter((a) => a.table_key === table.key).map((a) => a.category))].filter((c) => c !== '').map((c) => ({ key: c, label: c }))

  if (!port || (!isDM && mine.length === 0)) return null
  const { actions, campaignId } = port

  async function run(write: () => Promise<unknown>, failure: string) {
    setError(null)
    try {
      await write()
      notifyLinksChanged(pjId)
    } catch (err) {
      console.error(failure, err)
      setError(describeDataError(err, failure))
      void reload() // the server state wins: show what is really stored
    }
  }

  const link = (entry: CampaignAction) => run(() => actions.link(campaignId, pjId, entry.id), 'No se pudo vincular la acción.')
  const unlink = (entry: LinkedAction) => run(() => actions.unlink(pjId, entry.action.id), 'No se pudo desvincular la acción.')

  function writeState(entry: LinkedAction, column: Column, value: unknown) {
    const { allowed, invalid } = allowedStatePatch(table, isDM, { [column.key]: value })
    if (invalid.length > 0) {
      setError(`El valor de ${column.label} (${entry.action.name}) no es válido.`)
      return
    }
    void run(() => actions.updateLinkState(pjId, entry.action.id, allowed), 'No se pudo guardar el estado de la acción.')
  }

  return (
    <section aria-label={`Acciones de ${table.label}`} className="px-8 mb-[18px]">
      <div className={labelCls}>Acciones vinculadas · {table.label}</div>
      {mine.length === 0 && <p className="text-[12px] text-txt-muted mb-2">Este personaje no tiene acciones vinculadas en esta tabla.</p>}
      {groupByCategory(table, mine, (entry) => entry.action.category).map((group) => (
        <div key={group.key ?? group.label} className="mb-3">
          <h4 className="font-exo text-[10px] tracking-[0.2em] uppercase text-txt-muted mb-1">{group.label}</h4>
          <ul className="divide-y divide-border-base border border-border-base">
            {group.items.map((entry) => (
              <li key={entry.action.id} data-name={entry.action.name} className="px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] text-txt-primary">{entry.action.name}</span>
                  {isDM && (
                    <button type="button" className="cursor-pointer bg-transparent border border-border-light text-txt-secondary text-[11px] px-2 py-1 hover:text-txt-primary" aria-label={`Desvincular ${entry.action.name}`} onClick={() => void unlink(entry)}>
                      Desvincular
                    </button>
                  )}
                </div>
                {columns.length > 0 && (
                  <div className="flex flex-wrap gap-3 mt-2">
                    {columns.map((column) => (
                      <StateField
                        key={`${column.key}:${JSON.stringify(entry.link.state[column.key] ?? null)}`}
                        label={`${column.label} (${entry.action.name})`}
                        column={column}
                        stored={entry.link.state[column.key]}
                        editable={Object.hasOwn(rules, column.key)}
                        onCommit={(value) => writeState(entry, column, value)}
                      />
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {isDM && (
        <div role="group" aria-label={`Vincular a ${table.label}`} className="mt-3 border border-border-base p-3">
          <div className="flex flex-wrap gap-3 mb-2">
            <select aria-label={`Categoría (${table.label})`} className={`${inputCls} max-w-[200px]`} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Todas las categorías</option>
              {categories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
            <input type="search" aria-label={`Buscar acción (${table.label})`} placeholder="Buscar acción…" className={`${inputCls} max-w-[240px]`} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {candidates.length === 0 ? (
            <p className="text-[12px] text-txt-muted">No hay acciones para vincular con ese filtro.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {candidates.slice(0, PICKER_LIMIT).map((a) => (
                <li key={a.id}>
                  <button type="button" className="cursor-pointer bg-bg-mid border border-border-base text-txt-secondary text-[12px] px-2.5 py-1 hover:text-txt-primary" aria-label={`Vincular ${a.name}`} title={categoryLabel(table, a.category)} onClick={() => void link(a)}>
                    + {a.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {candidates.length > PICKER_LIMIT && <p className="text-[11px] text-txt-muted mt-1">Se muestran {PICKER_LIMIT} de {candidates.length}: afiná la búsqueda.</p>}
        </div>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-accent-bright mt-2">
          {error}
        </p>
      )}
    </section>
  )
}
