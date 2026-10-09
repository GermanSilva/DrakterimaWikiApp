import { useState, type FormEvent, type ReactNode } from 'react'
import { btnSecondary, inputCls } from '../../../constants'
import { parseCharacterFields } from '../../adapters/hubFormPort'
import { FIELD_LABEL_MAX, fieldDrafts, MAX_CUSTOM_FIELDS, newFieldDraft, validateCustomFields, type FieldDraft, type FieldRowErrors } from './customFieldsForm'
import { KEY_MAX } from './fieldKey'
import { ListEditor } from './ListEditor'
import { useCampaignSave } from './useCampaignSave'

const labelCls = 'block font-exo text-[10px] font-medium tracking-[0.2em] uppercase text-txt-muted mb-1.5'

function Labelled({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-[12px] text-txt-muted mt-1">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-[13px] text-red-400 mt-1">
          {error}
        </p>
      )}
    </div>
  )
}

const describedBy = (id: string, hint: boolean, error?: string) => [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined

function FieldRow({ row, errors, update }: { row: FieldDraft; errors: FieldRowErrors; update: (patch: Partial<FieldDraft>) => void }) {
  const id = `field-${row.uid}`
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Labelled id={`${id}-label`} label="Nombre del campo" error={errors.label}>
        <input
          id={`${id}-label`}
          type="text"
          value={row.label}
          maxLength={FIELD_LABEL_MAX + 20}
          onChange={(e) => update({ label: e.target.value })}
          aria-invalid={errors.label ? true : undefined}
          aria-describedby={describedBy(`${id}-label`, false, errors.label)}
          className={inputCls}
        />
      </Labelled>
      <Labelled
        id={`${id}-key`}
        label="Clave"
        error={errors.key}
        hint={row.persisted ? 'La clave no se puede cambiar.' : `Identificador interno, hasta ${KEY_MAX} caracteres. No se puede cambiar después.`}
      >
        <input
          id={`${id}-key`}
          type="text"
          value={row.key}
          readOnly={row.persisted}
          aria-readonly={row.persisted ? true : undefined}
          onChange={(e) => update({ key: e.target.value })}
          aria-invalid={errors.key ? true : undefined}
          aria-describedby={describedBy(`${id}-key`, true, errors.key)}
          className={inputCls + (row.persisted ? ' opacity-70 cursor-not-allowed' : '')}
        />
      </Labelled>
    </div>
  )
}

const rowName = (r: FieldDraft) => r.label.trim() || r.key.trim() || 'campo nuevo'

function CustomFieldsForm({ initial, onSave }: { initial: FieldDraft[]; onSave: (rows: FieldDraft[]) => Promise<{ errors: Record<number, FieldRowErrors>; list?: string } | null> }) {
  const [rows, setRows] = useState(initial)
  const [errors, setErrors] = useState<Record<number, FieldRowErrors>>({})
  const [listError, setListError] = useState<string | undefined>()
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const result = await onSave(rows)
      setErrors(result?.errors ?? {})
      setListError(result?.list)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form noValidate onSubmit={submit} aria-label="Campos de personaje de la campaña" className="flex flex-col gap-4">
      <ListEditor
        label="Lista de campos"
        items={rows}
        onChange={setRows}
        onAdd={() => setRows((r) => [...r, newFieldDraft(r)])}
        addLabel="Agregar campo"
        addDisabled={rows.length >= MAX_CUSTOM_FIELDS ? `Máximo ${MAX_CUSTOM_FIELDS} campos.` : undefined}
        itemName={rowName}
        renderFields={(row, update) => <FieldRow row={row} errors={errors[row.uid] ?? {}} update={update} />}
        removal={(row) => (row.persisted ? { warning: 'Los valores ya cargados en los personajes no se borran: quedan guardados pero ocultos.' } : {})}
        confirmText={(row) => `¿Quitar el campo "${rowName(row)}"?`}
        listError={listError}
        disabled={saving}
      />
      <div>
        <button type="submit" className={btnSecondary} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar campos'}
        </button>
      </div>
    </form>
  )
}

/**
 * Extra text fields of the character sheet (DM only), shown in the character form and detail of this campaign.
 * Only text fields, at most 10; a key never changes once saved. Removing a field only hides it: the values stay
 * stored in each character and come back if a field with the same key is added again.
 */
export function CustomFieldsSettings() {
  const { campaign, notice, setNotice, saves, save } = useCampaignSave()
  const stored = parseCharacterFields(campaign.character_custom_fields)

  async function onSave(rows: FieldDraft[]) {
    setNotice(null)
    const result = validateCustomFields(rows)
    if (!result.ok) {
      setNotice({ kind: 'error', text: 'Revisá los campos marcados.' })
      return { errors: result.errors, list: result.list }
    }
    await save({ character_custom_fields: result.fields }, 'Campos guardados.', 'No se pudieron guardar los campos. Intentá de nuevo.')
    return null
  }

  // Remount the drafts when a save succeeded or the stored fields changed (another DM, conflict re-read).
  const formKey = `${saves}:${JSON.stringify(campaign.character_custom_fields)}`
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-txt-secondary">
        Campos de texto extra para la ficha de los personajes (por ejemplo "Relación con la Magralita"). Se muestran en el formulario y en el detalle del personaje.
      </p>
      <CustomFieldsForm key={formKey} initial={fieldDrafts(stored)} onSave={onSave} />
      {notice && (
        <p role={notice.kind === 'error' ? 'alert' : 'status'} className={notice.kind === 'error' ? 'text-[13px] text-red-400' : 'text-[13px] text-accent-bright'}>
          {notice.text}
        </p>
      )}
    </div>
  )
}
