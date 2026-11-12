import { useId, useMemo, useState, type ReactNode } from 'react'
import { btnSecondary, inputCls } from '../../../constants'
import { staleLoteriaKeys } from '../../games/coins'
import type { Node, Path } from '../../system/builder/draft'
import { describeRemoval, removalConflict, removalMessage, removeNode, type RemovalRequest } from '../../system/builder/removal'
import { economyItems, rewardKey } from '../../system/builder/economy'
import {
  addDenomination,
  addInstance,
  coinSummary,
  coinTable,
  defaultSection,
  DENOMINATION_LIMIT,
  denominations,
  equivalence,
  moveDenomination,
  renameDenomination,
  renameInstance,
  sectionChoices,
  setDenominationKey,
  setDenominationValue,
  setInstanceKey,
} from './economyForm'
import { ConfirmDialog } from './ConfirmDialog'
import { useTabSaving } from './tabSave/tabSaveContext'

const smallBtn = `${btnSecondary} !px-2 !py-1 disabled:opacity-40 disabled:cursor-not-allowed`
const labelCls = 'block font-exo text-[10px] font-medium tracking-[0.2em] uppercase text-txt-muted mb-1.5'

export const DESTINATION_BLOCKED = 'Es el destino de recompensa: elegí otro en Juegos antes de eliminarla'
const COIN_BLOCKED = 'Eliminá primero las demás instancias: guardan montos en las monedas de esta tabla'
export const DISCARD_WARNING = 'Eliminar una instancia con montos guardados la pasa a campos descartados por 60 días.'

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

interface Pending {
  list: Path
  index: number
  request: RemovalRequest
  /** Extra consequences to tell (the lottery prizes that name the denomination). */
  extra: string[]
  instance: boolean
}

interface Props {
  /** The economy draft: the whole sheet being edited, or null when the campaign has no template yet. */
  sheet: Node | null
  /** The freshest stored sheet: where the instances sit and which one is the reward destination. */
  stored: Node | null
  onChange: (next: Node) => void
  /** The validation errors of the economy parts, in Spanish, as the save refuses them. */
  errors: readonly string[]
  /** Reads `campaign_config.loteria` (only when a saved denomination is about to be removed), to warn when the prizes name it. */
  readLottery: () => Promise<unknown>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <span className={labelCls}>{label}</span>
      {children}
    </div>
  )
}

/**
 * Sistema › Economía (S8): the denominations of the coin table and the economy instances (create, edit, delete). Controlled: the
 * draft lives in the Sistema block, so one save writes it together with the rest of the system document.
 */
export function EconomySettings({ sheet, stored, onChange, errors, readLottery }: Props) {
  const id = useId()
  const locked = useTabSaving()
  const [editingRow, setEditingRow] = useState<number | null>(null)
  const [editingInstance, setEditingInstance] = useState<string | null>(null)
  const [creating, setCreating] = useState<{ name: string; section: string } | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [refused, setRefused] = useState<string | null>(null)

  const rows = denominations(sheet)
  const coin = coinTable(sheet)
  const instances = useMemo(() => economyItems(sheet), [sheet])
  const sections = sectionChoices(sheet)
  const destination = rewardKey(stored)
  const summary = coinSummary(rows)

  if (!sheet) {
    return (
      <p className="text-[13px] text-txt-secondary">
        Esta campaña todavía usa la ficha clásica. Guardá una plantilla en la pestaña Ficha para poder definir monedas e instancias de economía.
      </p>
    )
  }

  /** Where an instance sits: from the stored sheet when it is saved, from the draft while it is new. */
  const placement = (key: string, own: { category: Node; section: Node }) => {
    const saved = economyItems(stored).find((e) => e.item.key === key) ?? own
    return `en ${text(saved.category.label)} › ${text(saved.section.label)}`
  }

  async function request(list: Path, index: number, instance: boolean) {
    setRefused(null)
    const found = describeRemoval(sheet as Node, list, index)
    if (!found) return
    const conflict = removalConflict(sheet as Node, list, index)
    if (conflict) return setRefused(conflict)
    if (!found.holdsData) {
      setEditingRow(null)
      return onChange(removeNode(sheet as Node, list, index))
    }
    const extra: string[] = []
    if (!instance) {
      const gone = text(found.name)
      const key = text(rows[index]?.key)
      const left = rows.filter((_, i) => i !== index).map((r) => ({ key: text(r.key), label: text(r.label), value: Number(r.value) }))
      let value: unknown
      try {
        value = await readLottery()
      } catch {
        extra.push('No pudimos leer los premios de la lotería: si nombran esta moneda, quedarán desactualizados. Revisalos en Juegos después de guardar.')
      }
      if (key && staleLoteriaKeys(value, left).includes(key)) {
        extra.push(`Los premios de la lotería nombran «${gone}»: quedan desactualizados y la lotería deja de estar disponible para los jugadores hasta que los guardes de nuevo en Juegos.`)
      }
    }
    setPending({ list, index, request: found, extra, instance })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12px] text-txt-secondary">
        Las monedas del sistema y cuánto vale cada una. Se usan en las tablas de economía de la ficha, en los premios de la lotería y en el pozo.
      </p>

      <div className="flex flex-col gap-2">
        <table className="w-full text-[13px] text-left">
          <thead>
            <tr className="text-txt-muted">
              <th className={`${labelCls} font-normal`}>Clave</th>
              <th className={`${labelCls} font-normal`}>Moneda</th>
              <th className={`${labelCls} font-normal`}>Equivale a</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const editing = editingRow === i
              const isNew = row._new === true
              return (
                <tr key={i} aria-label={`Moneda ${text(row.label)}`} className="border-t border-border-base align-top">
                  <td className="py-2 pr-2">
                    {editing ? (
                      <input
                        aria-label="Clave de la moneda"
                        className={`${inputCls}${isNew ? '' : ' opacity-70'}`}
                        value={text(row.key)}
                        readOnly={!isNew}
                        onChange={(e) => onChange(setDenominationKey(sheet, i, e.target.value))}
                      />
                    ) : (
                      text(row.key)
                    )}
                  </td>
                  <td className="py-2 pr-2">
                    {editing ? <input aria-label="Nombre de la moneda" className={inputCls} value={text(row.label)} onChange={(e) => onChange(renameDenomination(sheet, i, e.target.value))} /> : text(row.label)}
                  </td>
                  <td className="py-2 pr-2">
                    {editing ? (
                      <input
                        aria-label="Equivale a (en la unidad base)"
                        inputMode="numeric"
                        className={`${inputCls} !w-[110px]`}
                        value={String(row.value ?? '')}
                        onChange={(e) => onChange(setDenominationValue(sheet, i, e.target.value))}
                      />
                    ) : (
                      equivalence(rows, row)
                    )}
                  </td>
                  <td className="py-2">
                    <span className="flex flex-wrap justify-end gap-2">
                      <button type="button" className={smallBtn} disabled={locked} aria-expanded={editing} onClick={() => setEditingRow(editing ? null : i)}>
                        {editing ? 'Listo' : 'Editar'}
                      </button>
                      {editing && (
                        <>
                          <button type="button" className={smallBtn} disabled={i === 0 || locked} onClick={() => (onChange(moveDenomination(sheet, i, -1)), setEditingRow(i - 1))}>
                            Subir moneda
                          </button>
                          <button type="button" className={smallBtn} disabled={i === rows.length - 1 || locked} onClick={() => (onChange(moveDenomination(sheet, i, 1)), setEditingRow(i + 1))}>
                            Bajar moneda
                          </button>
                          <button
                            type="button"
                            className={smallBtn}
                            disabled={locked}
                            onClick={() => request([...(coin?.path ?? []), 'rows'], i, false)}
                          >
                            Quitar moneda
                          </button>
                        </>
                      )}
                    </span>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr className="border-t border-border-base">
                <td colSpan={4} className="py-2 text-txt-muted">
                  {coin ? 'Todavía no hay monedas.' : 'Todavía no hay monedas: creá la primera instancia de economía para definirlas.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {summary && <p className="text-[12px] text-txt-muted">{summary}</p>}
        <div>
          <button
            type="button"
            className={`${btnSecondary} disabled:opacity-40 disabled:cursor-not-allowed`}
            disabled={!coin || rows.length >= DENOMINATION_LIMIT || locked}
            title={!coin ? 'Creá primero la primera instancia de economía' : rows.length >= DENOMINATION_LIMIT ? `Hasta ${DENOMINATION_LIMIT} monedas` : undefined}
            onClick={() => {
              onChange(addDenomination(sheet))
              setEditingRow(rows.length)
            }}
          >
            + Agregar moneda
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className={labelCls}>Instancias de economía</h3>
        <p className="text-[12px] text-txt-secondary">
          Cada instancia guarda montos en esas monedas para cada personaje (por ejemplo, lo que lleva encima y lo que tiene en el banco). Se muestran en la ficha donde ubiques su tabla
          desde la pestaña Ficha.
        </p>
        {instances.map(({ item, path, category, section }) => {
          const key = text(item.key)
          const isNew = item._new === true
          const isDestination = destination === key
          const holdsCoins = item.type === 'monedas' && instances.length > 1
          const blocked = isDestination ? DESTINATION_BLOCKED : holdsCoins ? COIN_BLOCKED : undefined
          const where = path.join('.')
          const editing = editingInstance === where
          const listPath = path.slice(0, -1)
          return (
            <div key={path.join('.')} role="group" aria-label={`Instancia ${text(item.label)}`} className="border border-border-base px-3 py-3 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-exo text-[12px] font-semibold text-txt-primary">{text(item.label)}</p>
                  <p className="text-[12px] text-txt-muted">
                    {[key, placement(key, { category, section }), item.type === 'monedas' ? 'define las monedas' : null, isDestination ? 'destino de recompensa' : null].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span className="flex gap-2">
                  <button type="button" className={smallBtn} disabled={locked} aria-expanded={editing} onClick={() => setEditingInstance(editing ? null : where)}>
                    {editing ? 'Listo' : 'Editar'}
                  </button>
                  <button
                    type="button"
                    className={smallBtn}
                    disabled={blocked !== undefined || locked}
                    title={blocked}
                    onClick={() => request(listPath, Number(path[path.length - 1]), true)}
                  >
                    Eliminar
                  </button>
                </span>
              </div>
              {editing && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nombre">
                    <input aria-label="Nombre de la instancia" className={inputCls} value={text(item.label)} onChange={(e) => onChange(renameInstance(sheet, path, e.target.value))} />
                  </Field>
                  <Field label="Clave">
                    <input
                      aria-label="Clave de la instancia"
                      className={`${inputCls}${isNew ? '' : ' opacity-70'}`}
                      value={key}
                      readOnly={!isNew}
                      onChange={(e) => onChange(setInstanceKey(sheet, path, e.target.value))}
                    />
                  </Field>
                </div>
              )}
            </div>
          )
        })}
        {instances.length === 0 && <p className="text-[13px] text-txt-muted">Todavía no hay instancias de economía.</p>}

        {creating ? (
          <div role="group" aria-label="Nueva instancia" className="border border-border-base px-3 py-3 flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre">
                <input aria-label="Nombre de la nueva instancia" className={inputCls} value={creating.name} onChange={(e) => setCreating({ ...creating, name: e.target.value })} />
              </Field>
              <Field label="Sección de la ficha">
                <select aria-label="Sección de la nueva instancia" className={inputCls} value={creating.section} onChange={(e) => setCreating({ ...creating, section: e.target.value })}>
                  {sections.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.where}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className={`${btnSecondary} disabled:opacity-40 disabled:cursor-not-allowed`}
                disabled={creating.name.trim() === ''}
                onClick={() => {
                  onChange(addInstance(sheet, creating.name.trim(), creating.section))
                  setCreating(null)
                }}
              >
                Crear instancia
              </button>
              <button type="button" className={btnSecondary} onClick={() => setCreating(null)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div>
            <button
              type="button"
              className={`${btnSecondary} disabled:opacity-40 disabled:cursor-not-allowed`}
              disabled={sections.length === 0 || locked}
              onClick={() => setCreating({ name: '', section: defaultSection(sheet) })}
            >
              + Nueva instancia
            </button>
          </div>
        )}
        <p className="text-[12px] text-txt-muted">{DISCARD_WARNING}</p>
      </div>

      {refused && (
        <p role="alert" aria-label="No se pudo quitar" className="text-[13px] text-red-400">
          {refused}
        </p>
      )}
      {errors.length > 0 && (
        <div role="alert" aria-label="Errores de economía" className="text-[13px] text-red-400 flex flex-col gap-1" id={`${id}-errors`}>
          <p>{errors.length === 1 ? 'La economía tiene 1 error. Corregilo para poder guardar.' : `La economía tiene ${errors.length} errores. Corregilos para poder guardar.`}</p>
          <ul className="list-disc pl-5">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {pending && (
        <ConfirmDialog
          title={pending.instance ? 'Eliminar instancia de economía' : 'Quitar moneda'}
          confirmLabel={pending.instance ? 'Eliminar' : 'Quitar'}
          busyLabel="Quitando…"
          busy={false}
          error={null}
          onClose={() => setPending(null)}
          onConfirm={() => {
            onChange(removeNode(sheet, pending.list, pending.index))
            setEditingRow(null)
            setPending(null)
          }}
        >
          {pending.instance && <p>{DISCARD_WARNING}</p>}
          <p>{removalMessage(pending.request)}</p>
          {pending.extra.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </ConfirmDialog>
      )}
    </div>
  )
}
