/**
 * The character editor drawn from the sheet (odd/design/sheet-builder.md, F5/G4b): one tab per category (after the
 * fixed Identity tab), one group per section, one widget per item. Who may type where comes from `writeRules()` (the DM
 * writes every non-computed place; a player only what the database guard lets them write, S11/S22): anything else is shown
 * read-only. Formulas, calculations and option results are shown, never typed; hidden fields are not drawn.
 *
 * It is a form component of the hub host (FormShell): it keeps a draft of the character, validates it with the same
 * rules the save uses, and hands the whole draft to `save`; the host turns it into the payload (sheetPatch) so there is
 * one place that decides what is sent.
 */
import { Fragment, useId, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { EstadoField, FormGroup, FormRow } from '../../../components/forms/formFields'
import ScrollStrip from '../../../components/ScrollStrip'
import { btnDanger, btnPrimary, btnSecondary, inputCls, labelCls } from '../../../constants'
import type { FlatEntity } from '../../../data'
import { useFormActions, useFormPort, useFormSystem } from '../../../ports'
import { ActionLinksPanel } from '../actions/ActionLinksPanel'
import { Computed, Control, type ControlSpec } from './Control'
import { LOCKED, textOf } from './controlValues'
import { TableRowsModal } from './TableRowsModal'
import { resolveSheetItems, type ResolvedItem } from './resolveSheet'
import { setAmount, setKey, sheetPatch, writeRules } from './sheetEditorModel'
import type { Column, Field, Sheet, Table } from './sheetModel'

type Draft = Record<string, unknown>
type Resolved<K extends ResolvedItem['kind']> = Extract<ResolvedItem, { kind: K }>
type RowTable = Extract<Table, { type: 'libre' | 'habilidad' }>

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const optionsOf = (source: Field | Column) => source.options?.map((o) => ({ key: o.key, label: o.label }))

function FieldWidget({ field, resolved, editable, draft, setDraft, onFocus }: { field: Field; resolved: ResolvedItem | undefined; editable: boolean; draft: Draft; setDraft: Dispatch<SetStateAction<Draft>>; onFocus: ControlSpec['onFocus'] }) {
  const id = useId()
  if (field.hidden) return null
  const computed = field.formula !== undefined || field.calc !== undefined
  const item = resolved?.kind === 'field' ? resolved : null
  return (
    <FormGroup>
      <label className={labelCls} htmlFor={id}>
        {field.label}
      </label>
      {computed ? (
        <Computed id={id} label={field.label} text={field.type === 'boolean' ? (item?.value ? 'Sí' : 'No') : (item?.text ?? '')} error={item?.error ?? false} />
      ) : (
        <Control
          id={id}
          label={field.label}
          type={field.type}
          editable={editable}
          value={draft[field.key]}
          min={field.min}
          max={field.max}
          options={optionsOf(field)}
          display={field.display}
          default={field.default}
          onFocus={onFocus}
          onChange={(value) => setDraft((prev) => setKey(prev, field.key, value))}
        />
      )}
    </FormGroup>
  )
}

function StatWidget({ resolved, editable, draft, setDraft }: { resolved: Resolved<'stat'>; editable: (key: string) => boolean; draft: Draft; setDraft: Dispatch<SetStateAction<Draft>> }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3 px-8 mb-[18px]">
      {resolved.rows.map((row) => (
        <div key={row.key}>
          <div className={labelCls}>
            {row.label} <span className="text-txt-secondary normal-case tracking-normal">{row.modifierText}</span>
          </div>
          <Control label={row.label} type="number" editable={editable(row.key)} value={draft[row.key]} onChange={(value) => setDraft((prev) => setKey(prev, row.key, value))} />
        </div>
      ))}
    </div>
  )
}

function CapacidadesWidget({ table, resolved, editable, draft, setDraft }: { table: Extract<Table, { type: 'capacidades' }>; resolved: Resolved<'capacidades'>; editable: (key: string) => boolean; draft: Draft; setDraft: Dispatch<SetStateAction<Draft>> }) {
  return (
    <div className="px-8 mb-[18px] overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr>
            <th className={`${labelCls} text-left`}>{table.label}</th>
            {table.columns.map((column) => (
              <th key={column.key} className={`${labelCls} text-left`}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {resolved.rows.map((row) => (
            <tr key={row.key}>
              <td className="pr-3 text-txt-primary">
                {row.label} <span className="text-txt-muted">{row.statModifierText}</span>
              </td>
              {table.columns.map((column, at) => {
                const key = at === 0 ? row.key : `${row.key}__${column.key}`
                const label = `${row.label} ${column.label}`
                const cell = row.cells[at]
                return (
                  <td key={column.key} className="pr-2 py-1">
                    {column.formula !== undefined ? (
                      <Computed label={label} text={cell.text} error={cell.error} />
                    ) : (
                      <Control label={label} type={column.type} editable={editable(key)} value={draft[key]} options={optionsOf(column)} display={column.display} default={column.default} onChange={(value) => setDraft((prev) => setKey(prev, key, value))} />
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Libre / Habilidad: only the title, the row count and a button in the main form; the rows are edited in a modal (S40). */
function RowsWidget({ sheet, table, resolved, editable, draft, setDraft, hideTitle = false }: { sheet: Sheet; table: RowTable; resolved: Resolved<'rows'>; editable: boolean; draft: Draft; setDraft: Dispatch<SetStateAction<Draft>>; hideTitle?: boolean }) {
  const [open, setOpen] = useState(false)
  const count = resolved.rows.length
  return (
    <div className="px-8 mb-[18px] flex items-center justify-between gap-3">
      <div>
        {/* the section heading already names a table with the same title */}
        {!hideTitle && <div className={labelCls}>{table.label}</div>}
        <div className="text-[12px] text-txt-muted">{count === 0 ? 'Sin filas' : count === 1 ? '1 fila' : `${count} filas`}</div>
      </div>
      <button type="button" className={btnSecondary} aria-label={`${editable ? 'Editar' : 'Ver'} ${table.label}`} onClick={() => setOpen(true)}>
        {editable ? 'Editar' : 'Ver'}
      </button>
      {open && (
        <TableRowsModal
          sheet={sheet}
          table={table}
          draft={draft}
          editable={editable}
          onClose={() => setOpen(false)}
          onApply={(rows) => {
            if (rows !== undefined) setDraft((prev) => setKey(prev, table.key, rows))
            setOpen(false)
          }}
        />
      )}
    </div>
  )
}

const sameTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** Amounts per denomination: the coin table (carried and stored) and the economy tables. DM only. */
function AmountsWidget({ title, denominations, keys, editable, draft, setDraft }: { title: string; denominations: { key: string; label: string }[]; keys: { key: string; suffix: string }[]; editable: boolean; draft: Draft; setDraft: Dispatch<SetStateAction<Draft>> }) {
  return (
    <div className="px-8 mb-[18px]">
      <div className={labelCls}>{title}</div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-3">
        {keys.flatMap(({ key, suffix }) =>
          denominations.map((denomination) => {
            const held = isRecord(draft[key]) ? draft[key] : {}
            return (
              <div key={`${key}:${denomination.key}`}>
                <div className={labelCls}>
                  {denomination.label}
                  {suffix}
                </div>
                <Control label={`${denomination.label}${suffix} (${title})`} type="number" min={0} editable={editable} value={held[denomination.key]} onChange={(value) => setDraft((prev) => setAmount(prev, key, denomination.key, value === null ? 0 : (value as number)))} />
              </div>
            )
          }),
        )}
      </div>
    </div>
  )
}

/** The label a save error names: the field, the table, or the row and column of a Capacidades cell. */
function labelsOf(sheet: Sheet): Map<string, string> {
  const labels = new Map<string, string>()
  for (const category of sheet.categories) {
    for (const section of category.sections) {
      for (const item of section.items) {
        if (item.kind === 'field') labels.set(item.key, item.label)
        else if (item.type === 'stat') for (const row of item.rows) labels.set(row.key, row.label)
        else if (item.type === 'capacidades') for (const row of item.rows) item.columns.forEach((column, at) => labels.set(at === 0 ? row.key : `${row.key}__${column.key}`, `${row.label} ${column.label}`))
        else if (item.type === 'monedas') {
          labels.set('monedas', item.label)
          labels.set('monedas_guardado', `${item.label} (guardado)`)
        } else labels.set(item.key, item.label)
      }
    }
  }
  return labels
}

interface Props {
  item: FlatEntity | null
  openPicker?: () => void
}

export default function SheetEditor({ item, openPicker }: Props) {
  const { save, remove, closeForm, saving, activeFieldRef } = useFormActions()
  const port = useFormPort()
  const { isDM, regions } = port
  const sheet = port.sheet as Sheet
  const { clase, raza, nivel } = useFormSystem().character.builtins
  // the stock D&D names keep the wording of today's form; a renamed field shows exactly what the DM typed
  const razaLabel = raza.label === 'Raza' ? 'Raza / Especie' : raza.label
  const [draft, setDraft] = useState<Draft>(() => ({
    ...(item ?? {}),
    nombre: item?.nombre ?? '',
    jugador: item?.jugador ?? '',
    imagen_url: item?.imagen_url ?? '',
    nivel: item?.nivel ?? 1,
    region: item?.region ?? regions[0]?.key ?? 'magral',
    estado: item?.estado ?? 'publicado',
    visibilidad: item?.visibilidad ?? [],
    notas: item?.notas ?? '',
  }))
  const [tab, setTab] = useState('identidad')
  const [problems, setProblems] = useState<string[]>([])
  const rules = useMemo(() => writeRules(sheet, isDM), [sheet, isDM])
  const editable = (key: string) => key in rules
  const resolved = useMemo(() => resolveSheetItems(sheet, draft), [sheet, draft])
  const labels = useMemo(() => labelsOf(sheet), [sheet])
  const set = (key: string) => (e: { target: { value: string } }) => setDraft((prev) => setKey(prev, key, e.target.value))

  function handleSave() {
    const { errors } = sheetPatch(sheet, item ?? {}, draft, isDM)
    if (errors.length > 0) {
      setProblems(errors.map((e) => labels.get(e.key) ?? e.key))
      return
    }
    setProblems([])
    void save('pjs', { ...draft, id: item?.id })
  }

  const tabs = [{ key: 'identidad', label: 'Identidad' }, ...sheet.categories.filter((c) => c.sections.length > 0).map((c) => ({ key: `c:${c.key}`, label: c.label }))]
  const category = sheet.categories.find((c) => `c:${c.key}` === tab)
  const imagen = textOf(draft.imagen_url)

  return (
    <div data-sheet-editor>
      <div className="font-exo text-[17px] font-bold text-txt-primary uppercase tracking-[0.06em] sticky top-0 z-[1] bg-bg-card px-8 pt-7 pb-0 border-b border-border-base">
        <div className="mb-0 pb-4 flex items-center justify-between">
          <span>{item ? `Editar PJ — ${item.nombre}` : 'Nuevo Personaje Jugador'}</span>
          {openPicker && (
            <button type="button" className={`${btnSecondary} flex items-center gap-1.5`} onMouseDown={(e) => e.preventDefault()} onClick={openPicker}>
              Insertar enlace
            </button>
          )}
        </div>
        <ScrollStrip activeKey={tab} className="-mb-px" stripClassName="flex gap-0">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`font-exo text-[11px] font-semibold tracking-[0.1em] uppercase px-5 py-2.5 border-none cursor-pointer transition-colors whitespace-nowrap ${tab === t.key ? 'text-txt-primary border-b-2 border-b-accent bg-transparent' : 'text-txt-muted bg-transparent hover:text-txt-secondary border-b-2 border-b-transparent'}`}
              data-active={tab === t.key ? 'true' : undefined}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </ScrollStrip>
      </div>

      <div className="pt-5">
        {tab === 'identidad' && (
          <div>
            <FormRow>
              <div>
                <label className={labelCls} htmlFor="sheet-nombre">Nombre</label>
                <input id="sheet-nombre" className={inputCls} value={textOf(draft.nombre)} onChange={set('nombre')} />
              </div>
              <div>
                <label className={labelCls} htmlFor="sheet-jugador">Jugador</label>
                <input id="sheet-jugador" className={`${inputCls} ${LOCKED}`} value={textOf(draft.jugador)} readOnly title="Se completa al asignar el personaje a un jugador" />
              </div>
            </FormRow>
            {(clase.enabled || raza.enabled) && (
              <FormRow>
                {clase.enabled && (
                  <div>
                    <label className={labelCls} htmlFor="sheet-clase">{clase.label}</label>
                    <input id="sheet-clase" className={inputCls} value={textOf(draft.clase)} onChange={set('clase')} placeholder={clase.label === 'Clase' ? 'Ej: Paladín, Pícaro...' : undefined} />
                  </div>
                )}
                {raza.enabled && (
                  <div>
                    <label className={labelCls} htmlFor="sheet-raza">{razaLabel}</label>
                    <input id="sheet-raza" className={inputCls} value={textOf(draft.raza)} onChange={set('raza')} placeholder={raza.label === 'Raza' ? 'Ej: Humano, Dracónido...' : undefined} />
                  </div>
                )}
              </FormRow>
            )}
            <FormRow>
              {nivel.enabled && (
                <div>
                  <label className={labelCls} htmlFor="sheet-nivel">{nivel.label}</label>
                  <input id="sheet-nivel" className={`${inputCls} ${isDM ? '' : LOCKED}`} type="number" value={String(draft.nivel ?? '')} readOnly={!isDM} onChange={set('nivel')} min={nivel.min} max={nivel.max} />
                </div>
              )}
              <div>
                <label className={labelCls} htmlFor="sheet-region">Región de Origen</label>
                <select id="sheet-region" className={inputCls} value={textOf(draft.region)} onChange={set('region')}>
                  {textOf(draft.region) !== '' && !regions.some((r) => r.key === draft.region) && <option value={textOf(draft.region)}>{textOf(draft.region)}</option>}
                  {regions.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            </FormRow>
            <FormRow>
              <div>
                <label className={labelCls} htmlFor="sheet-imagen">Imagen (URL externa)</label>
                <input id="sheet-imagen" className={inputCls} type="url" placeholder="https://i.imgur.com/..." value={imagen} onChange={set('imagen_url')} />
              </div>
            </FormRow>
            {imagen && (
              <FormGroup>
                <img src={imagen} alt="preview" className="max-w-full max-h-[140px] rounded-md object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
              </FormGroup>
            )}
            {isDM && (
              <FormGroup>
                <label className={labelCls} htmlFor="sheet-notas">Notas del DM (privadas 🔒)</label>
                <textarea id="sheet-notas" className={`${inputCls} resize-y min-h-[70px]`} rows={3} value={textOf(draft.notas)} onChange={set('notas')} onFocus={(e) => { activeFieldRef.current = { el: e.target, setter: setDraft as never, key: 'notas' } }} />
              </FormGroup>
            )}
            {isDM && <EstadoField estado={draft.estado} visibilidad={draft.visibilidad} setF={setDraft} />}
          </div>
        )}

        {category?.sections.map((section) => (
          <section key={section.key} aria-label={section.label}>
            <div className="px-8 mt-5 mb-3">
              <h3 className="font-exo text-[9px] font-semibold tracking-[0.25em] uppercase text-txt-muted border-t border-border-base pt-3">{section.label}</h3>
            </div>
            {section.items.map((entry) => {
              const done = resolved[entry.key]
              if (entry.kind === 'field') {
                return <FieldWidget key={entry.key} field={entry} resolved={done} editable={editable(entry.key)} draft={draft} setDraft={setDraft} onFocus={(e) => { activeFieldRef.current = { el: e.target, setter: setDraft as never, key: entry.key } }} />
              }
              if (entry.type === 'stat' && done?.kind === 'stat') return <StatWidget key={entry.key} resolved={done} editable={editable} draft={draft} setDraft={setDraft} />
              if (entry.type === 'capacidades' && done?.kind === 'capacidades') return <CapacidadesWidget key={entry.key} table={entry} resolved={done} editable={editable} draft={draft} setDraft={setDraft} />
              if ((entry.type === 'libre' || entry.type === 'habilidad') && done?.kind === 'rows') {
                return (
                  <Fragment key={entry.key}>
                    <RowsWidget sheet={sheet} table={entry} resolved={done} editable={editable(entry.key)} draft={draft} setDraft={setDraft} hideTitle={sameTitle(entry.label, section.label)} />
                    {entry.type === 'habilidad' && item?.id !== undefined && <ActionLinksPanel table={entry} pjId={item.id} isDM={isDM} />}
                  </Fragment>
                )
              }
              if (entry.type === 'monedas' && done?.kind === 'coins') {
                return <AmountsWidget key={entry.key} title={entry.label} denominations={done.denominations} keys={[{ key: 'monedas', suffix: ' (en mano)' }, { key: 'monedas_guardado', suffix: ' (guardado)' }]} editable={isDM} draft={draft} setDraft={setDraft} />
              }
              if (entry.type === 'economia' && done?.kind === 'economy') {
                return <AmountsWidget key={entry.key} title={entry.label} denominations={done.denominations} keys={[{ key: entry.key, suffix: '' }]} editable={isDM} draft={draft} setDraft={setDraft} />
              }
              return null
            })}
          </section>
        ))}

        {problems.length > 0 && (
          <p role="alert" className="px-8 text-[13px] text-accent-bright">
            Revisá estos campos antes de guardar: {problems.join(', ')}.
          </p>
        )}
      </div>

      <div className="flex gap-2.5 justify-end sticky bottom-0 z-[1] bg-bg-card px-8 py-4 pb-6 border-t border-border-base mt-3">
        {item && isDM && (
          <button className={btnDanger} onClick={() => remove('pjs', item.id)}>
            Eliminar
          </button>
        )}
        <button className={btnSecondary} onClick={closeForm}>
          Cancelar
        </button>
        <button className={btnPrimary} disabled={saving} onClick={handleSave}>
          Guardar
        </button>
      </div>
    </div>
  )
}
