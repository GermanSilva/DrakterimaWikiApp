import type { DiscardedItem } from '../sheet/sheetModel'
import type { DiscardedNode } from './discard'
import { formatDeletionDate, isNearDeletion } from './discardedLifecycle'
import { describeHeld, heldKeys } from './discardedValues'
import { itemKindLabel } from './itemLabels'
import { smallBtn } from './ui'

/** A character as the review reads it: the values stored for it, by data key. */
export interface ReviewCharacter {
  id: number
  nombre: string
  values: Record<string, unknown>
}

interface Props {
  entries: DiscardedNode[]
  /** Labels of the sections of the draft, by key (the section an entry came from). */
  sectionLabels: ReadonlyMap<string, string>
  /** Absent when the characters cannot be read: the definitions are listed, nothing can be deleted. */
  characters: ReviewCharacter[] | null
  canDelete: boolean
  /** Keys of the entries the database already has (the others were discarded in this session and are not saved yet). */
  savedKeys: ReadonlySet<string>
  dirty: boolean
  error: string | null
  /** The clock of the deletion warnings (tests fix it). */
  now?: Date
  onRestore: (key: string) => void
  onDelete: (key: string) => void
}

/** 2026-11-06T10:00:00.000Z -> 06/11/2026 */
export const formatDiscardDate = (at: string): string => `${at.slice(8, 10)}/${at.slice(5, 7)}/${at.slice(0, 4)}`

const KIND_LABEL = (item: DiscardedItem & Record<string, unknown>): string =>
  item.kind === 'row' ? (item.type === 'capacidades' ? 'Fila de capacidades' : 'Fila de stats') : itemKindLabel(item)

/** "Campos descartados": what the DM removed from the template while characters hold data for it. Review, restore or delete. */
export function DiscardedPanel({ entries, sectionLabels, characters, canDelete, savedKeys, dirty, error, now, onRestore, onDelete }: Props) {
  const today = now ?? new Date()
  return (
    <section aria-label="Campos descartados" className="border border-border-base px-4 py-3 flex flex-col gap-3">
      <h3 className="font-exo text-[11px] font-semibold tracking-[0.15em] uppercase text-txt-primary">Campos descartados</h3>
      <p className="text-[12px] text-txt-muted">
        Lo que quitaste de la plantilla sigue guardado en los personajes, oculto. Revisá los datos de cada personaje y restauralo al final de su sección o eliminalo para siempre.
      </p>
      {error && (
        <p role="alert" aria-label="No se pudo restaurar" className="text-[13px] text-red-400">
          {error}
        </p>
      )}
      {entries.map((entry) => {
        const item = entry.item as unknown as DiscardedItem & Record<string, unknown>
        const key = String(item.key)
        const label = typeof item.label === 'string' ? item.label : key
        const held = (characters ?? []).flatMap((c) => {
          const line = describeHeld(item, c.values)
          return line === null ? [] : [{ id: c.id, nombre: c.nombre, line, keys: heldKeys(item, c.values) }]
        })
        const section = sectionLabels.get(entry.section)
        const deletable = canDelete && savedKeys.has(key) && !dirty
        const deletesOn = formatDeletionDate(entry.at)
        const near = deletesOn !== null && isNearDeletion(entry.at, today)
        return (
          <div key={key} role="group" aria-label={`Descartado ${label}`} className="border border-border-base px-3 py-3 flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="font-exo text-[12px] font-semibold text-txt-primary">{label}</span>
              <span className="text-[12px] text-txt-muted">{KIND_LABEL(item)}</span>
              <span className="text-[12px] text-txt-muted">{key}</span>
              <span className="text-[12px] text-txt-muted">{`Descartado el ${formatDiscardDate(entry.at)}`}</span>
              <span className="text-[12px] text-txt-muted">{section !== undefined ? `Sección «${section}»` : 'Su sección ya no existe: vuelve a la última'}</span>
            </div>
            {deletesOn !== null &&
              (near ? (
                <p className="text-[12px] text-amber-400">{`Se eliminará automáticamente el ${deletesOn}`}</p>
              ) : (
                <p className="text-[12px] text-txt-muted">{`Se elimina el ${deletesOn}`}</p>
              ))}
            {characters !== null &&
              (held.length === 0 ? (
                <p className="text-[13px] text-txt-secondary">Ningún personaje tiene datos guardados.</p>
              ) : (
                <ul aria-label="Datos de los personajes" className="text-[13px] text-txt-secondary list-disc pl-5">
                  {held.map((h) => (
                    <li key={h.id}>{`${h.nombre}: ${h.line}`}</li>
                  ))}
                </ul>
              ))}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={smallBtn} onClick={() => onRestore(key)}>
                Restaurar
              </button>
              {canDelete && (
                <button type="button" className={smallBtn} disabled={!deletable} onClick={() => onDelete(key)}>
                  Eliminar definitivamente
                </button>
              )}
              {canDelete && !deletable && <span className="text-[12px] text-txt-muted">Guardá la plantilla antes de eliminar.</span>}
            </div>
          </div>
        )
      })}
    </section>
  )
}
