import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { btnSecondary, inputCls, labelCls } from '../../../constants'
import { EFFECT_OPS, type EffectOp } from '../../system/actions/function/model'
import { isStoredNumber } from '../../system/actions/function/lookup'
import type { HabilidadTable } from '../../system/actions/tables'
import { roleWriteKey } from '../../system/sheet/roles'
import { ROLE_NAMES, type Column, type Sheet, type Table } from '../../system/sheet/sheetModel'
import { draftErrors, newEffect, newParam, type Draft, type DraftStep } from './functionDraft'

const OP_LABEL: Record<EffectOp, string> = { set: 'Fijar', add: 'Sumar', subtract: 'Restar' }
const MAX_STEPS = 20

const sheetItems = (sheet: Sheet) => sheet.categories.flatMap((c) => c.sections.flatMap((s) => s.items))
const swap = <T,>(list: T[], a: number, b: number): T[] => {
  const next = [...list]
  ;[next[a], next[b]] = [next[b], next[a]]
  return next
}

/** What the target selects offer: the stored number fields and bound roles, the Libre tables and the state columns of the action. */
function choices(sheet: Sheet, table: HabilidadTable | undefined) {
  const items = sheetItems(sheet)
  const fields = items.flatMap((i) => (i.kind === 'field' && isStoredNumber(i) ? [i.key] : []))
  const roles = ROLE_NAMES.filter((role) => roleWriteKey(sheet, role) !== undefined)
  const libre = items.filter((i): i is Extract<Table, { type: 'libre' }> => i.kind === 'table' && i.type === 'libre')
  const state: Column[] = (table?.columns ?? []).filter((c) => c.scope === 'character' && isStoredNumber(c))
  return { names: [...new Set([...roles, ...fields])], libre, state }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  )
}

interface PickProps {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  blank?: boolean
}
function Pick({ label, value, options, onChange, blank = true }: PickProps) {
  const known = options.some((o) => o.value === value)
  return (
    <Field label={label}>
      <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
        {blank && <option value="">—</option>}
        {!known && value !== '' && <option value={value}>{value}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  )
}

function Text({ label, value, onChange, list, placeholder }: { label: string; value: string; onChange: (v: string) => void; list?: string; placeholder?: string }) {
  return (
    <Field label={label}>
      <input className={inputCls} value={value} list={list} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
}

interface StepProps {
  step: DraftStep
  index: number
  count: number
  sheet: Sheet
  choice: ReturnType<typeof choices>
  onChange: (step: DraftStep) => void
  onMove: (to: number) => void
  onRemove: () => void
}

function StepEditor({ step, index, count, choice, onChange, onMove, onRemove }: StepProps) {
  const iconBtn = `${btnSecondary} !px-2 !py-1.5`
  const grid = 'grid grid-cols-2 max-md:grid-cols-1 gap-3'
  return (
    <fieldset aria-label={`Paso ${index + 1}`} className="border border-border-base bg-bg-mid p-3 space-y-3 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-exo text-[11px] tracking-[0.15em] uppercase text-txt-muted">
          Paso {index + 1} · {step.kind === 'param' ? 'Parámetro' : 'Efecto'}
        </span>
        <div className="flex gap-1.5">
          <button type="button" className={iconBtn} aria-label="Subir" disabled={index === 0} onClick={() => onMove(index - 1)}>
            <ArrowUp size={13} aria-hidden="true" />
          </button>
          <button type="button" className={iconBtn} aria-label="Bajar" disabled={index === count - 1} onClick={() => onMove(index + 1)}>
            <ArrowDown size={13} aria-hidden="true" />
          </button>
          <button type="button" className={iconBtn} aria-label="Quitar paso" onClick={onRemove}>
            <Trash2 size={13} aria-hidden="true" />
          </button>
        </div>
      </div>

      {step.kind === 'param' ? (
        <>
          <div className={grid}>
            <Text label="Clave" value={step.key} onChange={(key) => onChange({ ...step, key })} placeholder="nivel" />
            <Text label="Etiqueta" value={step.label} onChange={(label) => onChange({ ...step, label })} />
          </div>
          <Pick
            label="Tipo de entrada"
            blank={false}
            value={step.input}
            options={[{ value: 'number', label: 'Número' }, { value: 'checkbox', label: 'Casilla' }, { value: 'options', label: 'Opciones' }]}
            onChange={(input) => onChange({ ...step, input: input as typeof step.input })}
          />
          {step.input === 'number' && (
            <div className={grid}>
              <Text label="Mínimo" value={step.min} onChange={(min) => onChange({ ...step, min })} placeholder="número o fórmula" />
              <Text label="Máximo" value={step.max} onChange={(max) => onChange({ ...step, max })} placeholder="número o fórmula" />
            </div>
          )}
          {step.input === 'options' && (
            <div className="space-y-2">
              {step.options.map((option, at) => (
                <div key={at} className="grid grid-cols-[1fr_1fr_auto] max-md:grid-cols-1 gap-2 items-end">
                  <Text label={`Etiqueta de la opción ${at + 1}`} value={option.label} onChange={(label) => onChange({ ...step, options: step.options.map((o, i) => (i === at ? { ...o, label } : o)) })} />
                  <Text label={`Valor de la opción ${at + 1}`} value={option.value} onChange={(value) => onChange({ ...step, options: step.options.map((o, i) => (i === at ? { ...o, value } : o)) })} />
                  <button type="button" className={iconBtn} aria-label={`Quitar la opción ${at + 1}`} onClick={() => onChange({ ...step, options: step.options.filter((_, i) => i !== at) })}>
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </div>
              ))}
              <button type="button" className={btnSecondary} onClick={() => onChange({ ...step, options: [...step.options, { label: '', value: '' }] })}>
                <Plus size={12} aria-hidden="true" /> Agregar opción
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <Text label="Etiqueta" value={step.label} onChange={(label) => onChange({ ...step, label })} />
          <div className={grid}>
            <Pick
              label="Destino"
              blank={false}
              value={step.target}
              options={[{ value: 'field', label: 'Campo o rol' }, { value: 'row', label: 'Fila de una tabla Libre' }, { value: 'state', label: 'Estado de la acción' }]}
              onChange={(target) => onChange({ ...step, target: target as typeof step.target, column: '' })}
            />
            {step.target === 'field' && (
              <>
                <Text label="Campo o rol" value={step.field} list={`campos-${index}`} onChange={(field) => onChange({ ...step, field })} />
                <datalist id={`campos-${index}`}>
                  {choice.names.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </>
            )}
            {step.target === 'state' && (
              <Pick label="Columna" value={step.column} options={choice.state.map((c) => ({ value: c.key, label: c.label }))} onChange={(column) => onChange({ ...step, column })} />
            )}
          </div>
          {step.target === 'row' && (
            <RowTarget step={step} choice={choice} onChange={onChange} grid={grid} />
          )}
          <div className={grid}>
            <Pick label="Operación" blank={false} value={step.op} options={EFFECT_OPS.map((op) => ({ value: op, label: OP_LABEL[op] }))} onChange={(op) => onChange({ ...step, op: op as EffectOp })} />
            <Text label="Valor" value={step.value} onChange={(value) => onChange({ ...step, value })} placeholder="fórmula, por ejemplo {nivel} * 2" />
          </div>
          <Text label="Máximo" value={step.max} onChange={(max) => onChange({ ...step, max })} placeholder="opcional: fórmula" />
        </>
      )}
    </fieldset>
  )
}

function RowTarget({ step, choice, onChange, grid }: { step: Extract<DraftStep, { kind: 'effect' }>; choice: ReturnType<typeof choices>; onChange: (s: DraftStep) => void; grid: string }) {
  const table = choice.libre.find((t) => t.key === step.table)
  const numeric = (table?.columns ?? []).filter((c) => c.type === 'number')
  const stored = numeric.filter((c) => isStoredNumber(c))
  return (
    <>
      <div className={grid}>
        <Pick label="Tabla" value={step.table} options={choice.libre.map((t) => ({ value: t.key, label: t.label }))} onChange={(next) => onChange({ ...step, table: next, matchColumn: '', column: '' })} />
        <Pick label="Columna de coincidencia" value={step.matchColumn} options={numeric.map((c) => ({ value: c.key, label: c.label }))} onChange={(matchColumn) => onChange({ ...step, matchColumn })} />
      </div>
      <div className={grid}>
        <Text label="Valor de coincidencia" value={step.matchValue} onChange={(matchValue) => onChange({ ...step, matchValue })} placeholder="fórmula, por ejemplo {nivel}" />
        <Pick label="Columna" value={step.column} options={stored.map((c) => ({ value: c.key, label: c.label }))} onChange={(column) => onChange({ ...step, column })} />
      </div>
    </>
  )
}

interface Props {
  sheet: Sheet
  /** The Habilidad table of the action: `state` targets and state references need it. */
  table: HabilidadTable | undefined
  /** null = the entry has no function. */
  draft: Draft | null
  onChange: (draft: Draft | null) => void
}

/** Function section of the entry form (S22): the ordered steps, validated on every change against the sheet. */
export function FunctionEditor({ sheet, table, draft, onChange }: Props) {
  const choice = useMemo(() => choices(sheet, table), [sheet, table])
  const errors = useMemo(() => (draft === null ? [] : draftErrors(draft, sheet, table?.key)), [draft, sheet, table])
  const steps = draft ?? []

  return (
    <fieldset aria-label="Función" className="space-y-3 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={labelCls}>Función</span>
        {draft !== null && (
          <button type="button" className={btnSecondary} onClick={() => onChange(null)}>
            Quitar función
          </button>
        )}
      </div>
      {draft === null ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[13px] text-txt-muted">Sin función.</span>
          <button type="button" className={btnSecondary} onClick={() => onChange([])}>
            Agregar función
          </button>
        </div>
      ) : (
        <>
          {steps.map((step, index) => (
            <StepEditor
              key={index}
              step={step}
              index={index}
              count={steps.length}
              sheet={sheet}
              choice={choice}
              onChange={(next) => onChange(steps.map((s, i) => (i === index ? next : s)))}
              onMove={(to) => onChange(swap(steps, index, to))}
              onRemove={() => onChange(steps.filter((_, i) => i !== index))}
            />
          ))}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnSecondary} disabled={steps.length >= MAX_STEPS} onClick={() => onChange([...steps, newParam()])}>
              <Plus size={12} aria-hidden="true" /> Agregar parámetro
            </button>
            <button type="button" className={btnSecondary} disabled={steps.length >= MAX_STEPS} onClick={() => onChange([...steps, newEffect()])}>
              <Plus size={12} aria-hidden="true" /> Agregar efecto
            </button>
          </div>
          {errors.length > 0 && (
            <ul aria-label="Errores de la función" className="text-[12px] text-accent-bright space-y-1 list-disc pl-5">
              {errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </fieldset>
  )
}
