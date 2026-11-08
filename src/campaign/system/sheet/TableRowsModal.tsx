/**
 * The rows of one Libre / Habilidad table as a form in a modal (S40): a vertical list of row blocks, each column with its
 * label above its control. It edits a COPY of the character draft and hands the edited rows back only on "Listo"; Cancelar,
 * Escape, the backdrop and the close button discard them. Every edit addresses the STORED row (`storedIndex`), whatever order
 * the table is shown in, through the same model functions the main form always used.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Plus, RotateCcw, X } from 'lucide-react'
import { btnPrimary, btnSecondary, labelCls } from '../../../constants'
import useBackdropClose from '../../../hooks/useBackdropClose'
import useDialogFocus from '../../../hooks/useDialogFocus'
import { Computed, Control } from './Control'
import { textOf } from './controlValues'
import { resolveSheetItems } from './resolveSheet'
import { addRow, removeRow, resetCell, setCell } from './sheetEditorModel'
import type { Column, Sheet, Table } from './sheetModel'

type Draft = Record<string, unknown>
type RowTable = Extract<Table, { type: 'libre' | 'habilidad' }>

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const optionsOf = (column: Column) => column.options?.map((o) => ({ key: o.key, label: o.label }))
const computedText = (value: unknown) => (typeof value === 'number' ? String(Math.round(value * 100) / 100) : value === true ? 'Sí' : value === false ? 'No' : textOf(value))

interface Props {
  sheet: Sheet
  table: RowTable
  draft: Draft
  /** false: a viewer who cannot write the table sees the same form, locked. */
  editable: boolean
  onApply: (rows: unknown) => void
  onClose: () => void
}

export function TableRowsModal({ sheet, table, draft, editable, onApply, onClose }: Props) {
  const [local, setLocal] = useState<Draft>(() => ({ ...draft }))
  const dialogRef = useRef<HTMLDivElement>(null)
  const pendingFocus = useRef<string | null>(null)
  const titleId = useId()
  const baseId = useId()
  useDialogFocus(dialogRef)
  const backdropProps = useBackdropClose(onClose)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const stored = Array.isArray(local[table.key]) ? (local[table.key] as unknown[]) : []
  const resolved = useMemo(() => resolveSheetItems(sheet, local)[table.key], [sheet, local, table.key])
  const shown = resolved?.kind === 'rows' ? resolved : null

  // a row just added takes the focus on its first editable control
  useEffect(() => {
    const id = pendingFocus.current
    if (id === null) return
    pendingFocus.current = null
    const block = [...(dialogRef.current?.querySelectorAll<HTMLElement>('[data-row-id]') ?? [])].find((el) => el.dataset.rowId === id)
    block?.querySelector<HTMLElement>('input:not([readonly]):not([disabled]), textarea:not([readonly]), select:not([disabled])')?.focus()
  }, [local])

  function add() {
    const next = addRow(local, table.key)
    const rows = next[table.key] as unknown[]
    const last = rows[rows.length - 1]
    pendingFocus.current = isRecord(last) ? String(last.id) : null
    setLocal(next)
  }

  const textColumn = table.columns.find((column) => column.type === 'short' || column.type === 'paragraph')

  return (
    <div className="fixed inset-0 bg-black/[.82] z-[1100] backdrop-blur-[4px] flex items-center justify-center" {...backdropProps}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="w-[min(760px,94vw)] max-h-[88vh] flex flex-col bg-bg-card border border-border-light outline-none">
        <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3 border-b border-border-base">
          <h2 id={titleId} className="font-exo text-[16px] font-bold text-txt-primary uppercase tracking-[0.05em]">
            {table.label}
          </h2>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="cursor-pointer bg-transparent border-none text-txt-muted hover:text-txt-primary transition-colors">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-4 flex flex-col gap-4">
          {shown?.rows.length === 0 && <p className="text-[13px] text-txt-muted">Sin filas.</p>}
          {shown?.rows.map((display, position) => {
            const index = shown.storedIndex[position]
            const row = isRecord(stored[index]) ? (stored[index] as Draft) : {}
            const rowLabel = `fila ${position + 1}`
            const heading = textColumn ? textOf(row[textColumn.key]).trim() : ''
            return (
              <div key={String(row.id ?? `i${index}`)} role="group" aria-label={`Fila ${position + 1} de ${table.label}`} data-row-id={String(row.id)} className="border border-border-base p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="font-exo text-[12px] font-semibold tracking-[0.1em] uppercase text-txt-primary truncate">{heading || `Fila ${position + 1}`}</h3>
                  {editable && (
                    <button type="button" className="cursor-pointer bg-transparent border-none text-txt-muted hover:text-accent-bright p-1" aria-label={`Quitar ${rowLabel} de ${table.label}`} title="Quitar fila" onClick={() => setLocal((prev) => removeRow(prev, table.key, index))}>
                      <X size={14} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                  {table.columns.map((column) => {
                    const id = `${baseId}-${index}-${column.key}`
                    const name = `${column.label} (${rowLabel} de ${table.label})`
                    const computed = column.formula !== undefined
                    const checkbox = column.type === 'boolean' || (column.type === 'options' && column.display === 'checkbox' && column.options?.length === 2)
                    const label = (
                      <label className={checkbox ? 'text-[13px] text-txt-primary' : labelCls} htmlFor={id}>
                        {column.label}
                      </label>
                    )
                    return (
                      <div key={column.key} className={column.type === 'paragraph' ? 'sm:col-span-2' : ''}>
                        {!checkbox && label}
                        <div className="flex items-center gap-2">
                          {computed ? (
                            <Computed id={id} name={name} label={name} text={computedText(display[column.key])} />
                          ) : (
                            <Control id={id} name={name} label={name} type={column.type} editable={editable} value={row[column.key]} options={optionsOf(column)} display={column.display} default={column.default} onChange={(next) => setLocal((prev) => setCell(prev, table.key, index, column.key, next))} />
                          )}
                          {checkbox && label}
                          {editable && column.reset && column.type === 'number' && (
                            <button type="button" className="cursor-pointer bg-transparent border-none text-txt-muted hover:text-accent-bright p-1" aria-label={`Restablecer ${column.label} (${rowLabel} de ${table.label})`} title="Restablecer" onClick={() => setLocal((prev) => resetCell(sheet, prev, table.key, index, column.key))}>
                              <RotateCcw size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {editable && (
            <div>
              <button type="button" className={`${btnSecondary} flex items-center gap-1.5`} onClick={add}>
                <Plus size={13} /> Agregar fila
              </button>
            </div>
          )}
        </div>

        {editable && (
          <div className="flex gap-2.5 justify-end px-6 py-4 border-t border-border-base">
            <button type="button" className={btnSecondary} onClick={onClose}>
              Cancelar
            </button>
            <button type="button" className={btnPrimary} onClick={() => onApply(local[table.key])}>
              Listo
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
