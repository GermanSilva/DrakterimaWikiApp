import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { btnSecondary, inputCls } from '../../../constants'
import { parseSystemProfile, SECTION_KEYS, type SectionKey } from '../../system/systemProfile'
import { UNIT_MAX } from '../../system/distance/distance'
import { newUnit, systemDraft, validateSystem, type BuiltinDraft, type SystemDraft, type SystemErrors, type UnitDraft, type UnitErrors } from './systemForm'
import { useCampaignSave } from './useCampaignSave'

const labelCls = 'block font-exo text-[10px] font-medium tracking-[0.2em] uppercase text-txt-muted mb-1.5'

const SECTION_LABEL: Record<SectionKey, string> = {
  stats: 'Estadísticas',
  habilidades: 'Habilidades',
  ataques: 'Ataques',
  hechizos: 'Hechizos',
  recursos: 'Recursos',
  equipo: 'Equipo',
  rasgos: 'Rasgos',
  narrativa: 'Narrativa',
  apariencia: 'Apariencia',
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-[13px] text-red-400 mt-1">
          {error}
        </p>
      )}
    </div>
  )
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-[13px] text-txt-secondary cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-accent" />
      {label}
    </label>
  )
}

interface BuiltinProps {
  legend: string
  draft: BuiltinDraft
  error?: string
  onChange: (draft: BuiltinDraft) => void
  children?: ReactNode
}

function Builtin({ legend, draft, error, onChange, children }: BuiltinProps) {
  const id = useId()
  return (
    <fieldset className="border border-border-base px-4 py-3 flex flex-col gap-3">
      <legend className="px-1 font-exo text-[11px] font-semibold tracking-[0.15em] uppercase text-txt-primary">{legend}</legend>
      <Check label="Usar este campo" checked={draft.enabled} onChange={(enabled) => onChange({ ...draft, enabled })} />
      <Field id={`${id}-label`} label="Nombre en la ficha" error={error}>
        <input
          id={`${id}-label`}
          type="text"
          value={draft.label}
          onChange={(e) => onChange({ ...draft, label: e.target.value })}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-label-error` : undefined}
          className={inputCls}
        />
      </Field>
      {children}
    </fieldset>
  )
}

const smallBtn = `${btnSecondary} !px-2 !py-1 disabled:opacity-40 disabled:cursor-not-allowed`

interface UnitRowProps {
  position: number
  count: number
  unit: UnitDraft
  errors: UnitErrors
  onChange: (unit: UnitDraft) => void
  onMove: (delta: -1 | 1) => void
  onRemove: () => void
  radioName: string
}

function UnitRow({ position, count, unit, errors, onChange, onMove, onRemove, radioName }: UnitRowProps) {
  const id = useId()
  const invalid = (error?: string) => (error ? true : undefined)
  const describedBy = (field: string, error?: string) => (error ? `${id}-${field}-error` : undefined)
  return (
    <div role="group" aria-label={`Unidad ${position}`} className="border border-border-base px-3 py-3 flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field id={`${id}-key`} label="Clave" error={errors.key}>
          <input
            id={`${id}-key`}
            type="text"
            value={unit.key}
            readOnly={unit.saved}
            onChange={(e) => onChange({ ...unit, key: e.target.value })}
            aria-invalid={invalid(errors.key)}
            aria-describedby={describedBy('key', errors.key)}
            className={`${inputCls}${unit.saved ? ' opacity-70' : ''}`}
          />
        </Field>
        <Field id={`${id}-label`} label="Nombre" error={errors.label}>
          <input
            id={`${id}-label`}
            type="text"
            value={unit.label}
            onChange={(e) => onChange({ ...unit, label: e.target.value })}
            aria-invalid={invalid(errors.label)}
            aria-describedby={describedBy('label', errors.label)}
            className={inputCls}
          />
        </Field>
        <Field id={`${id}-value`} label="Valor" error={errors.value}>
          <input
            id={`${id}-value`}
            type="text"
            inputMode="decimal"
            value={unit.value}
            onChange={(e) => onChange({ ...unit, value: e.target.value })}
            aria-invalid={invalid(errors.value)}
            aria-describedby={describedBy('value', errors.value)}
            className={inputCls}
          />
        </Field>
        <Field id={`${id}-decimals`} label="Decimales">
          <select
            id={`${id}-decimals`}
            value={unit.decimals}
            onChange={(e) => onChange({ ...unit, decimals: e.target.value as UnitDraft['decimals'] })}
            className={inputCls}
          >
            <option value="0">0 (enteros)</option>
            <option value="1">1</option>
            <option value="2">2</option>
          </select>
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[13px] text-txt-secondary cursor-pointer">
          <input type="radio" name={radioName} checked={unit.main} onChange={() => onChange({ ...unit, main: true })} className="accent-accent" />
          Principal
        </label>
        <button type="button" className={smallBtn} disabled={position === 1} onClick={() => onMove(-1)}>
          Subir
        </button>
        <button type="button" className={smallBtn} disabled={position === count} onClick={() => onMove(1)}>
          Bajar
        </button>
        <button type="button" className={smallBtn} onClick={onRemove}>
          Quitar
        </button>
      </div>
    </div>
  )
}

function DistanceFieldset({ units, errors, onChange }: { units: UnitDraft[] | null; errors: SystemErrors['distance']; onChange: (units: UnitDraft[]) => void }) {
  const radioName = useId()
  return (
    <fieldset className="border border-border-base px-4 py-3 flex flex-col gap-3">
      <legend className="px-1 font-exo text-[11px] font-semibold tracking-[0.15em] uppercase text-txt-primary">Distancias</legend>
      <p className="text-[12px] text-txt-muted">
        Las unidades se escriben en los textos como [[{'{'}D:clave{'}'}15]] y se muestran con todas sus equivalencias, por ejemplo [15ft|4,5m|3c]. El valor es el tamaño de
        la unidad en una medida común (pie = 1, metro = 3,28084, casillero = 5). Cada unidad redondea hacia abajo con sus decimales. La clave no se puede cambiar una vez
        guardada.
      </p>
      {units === null ? (
        <p className="text-[13px] text-txt-secondary">Las unidades guardadas no se pueden editar desde aquí; se conservan tal como están.</p>
      ) : (
        <>
          {units.map((unit, i) => (
            <UnitRow
              // rows have no stable id until saved: the position is their identity
              key={i}
              position={i + 1}
              count={units.length}
              unit={unit}
              errors={errors?.units[i] ?? {}}
              radioName={radioName}
              onChange={(next) => onChange(units.map((u, j) => (j === i ? next : next.main ? { ...u, main: false } : u)))}
              onMove={(delta) => {
                const next = [...units]
                const [moved] = next.splice(i, 1)
                next.splice(i + delta, 0, moved)
                onChange(next)
              }}
              onRemove={() => {
                const next = units.filter((_, j) => j !== i)
                onChange(next.length > 0 && !next.some((u) => u.main) ? next.map((u, j) => ({ ...u, main: j === 0 })) : next)
              }}
            />
          ))}
          {errors?.main && (
            <p role="alert" className="text-[13px] text-red-400">
              {errors.main}
            </p>
          )}
          {errors?.list && (
            <p role="alert" className="text-[13px] text-red-400">
              {errors.list}
            </p>
          )}
          <div>
            <button
              type="button"
              className={`${btnSecondary} disabled:opacity-40 disabled:cursor-not-allowed`}
              disabled={units.length >= UNIT_MAX}
              onClick={() => onChange([...units, { ...newUnit(), main: units.length === 0 }])}
            >
              Agregar unidad
            </button>
          </div>
        </>
      )}
    </fieldset>
  )
}

function SystemForm({ initial, onSave }: { initial: SystemDraft; onSave: (draft: SystemDraft) => Promise<SystemErrors | null> }) {
  const [draft, setDraft] = useState(initial)
  const [errors, setErrors] = useState<SystemErrors>({})
  const [saving, setSaving] = useState(false)
  const rangeId = useId()

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      setErrors((await onSave(draft)) ?? {})
    } finally {
      setSaving(false)
    }
  }

  const level = (key: 'min' | 'max', label: string) => (
    <Field id={`${rangeId}-${key}`} label={label}>
      <input
        id={`${rangeId}-${key}`}
        type="number"
        inputMode="numeric"
        value={draft.nivel[key]}
        onChange={(e) => setDraft((d) => ({ ...d, nivel: { ...d.nivel, [key]: e.target.value } }))}
        aria-invalid={errors.range ? true : undefined}
        aria-describedby={errors.range ? `${rangeId}-error` : undefined}
        className={inputCls}
      />
    </Field>
  )

  return (
    <form noValidate onSubmit={submit} aria-label="Sistema de la campaña" className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Builtin legend="Clase" draft={draft.clase} error={errors.clase} onChange={(clase) => setDraft((d) => ({ ...d, clase }))} />
        <Builtin legend="Raza" draft={draft.raza} error={errors.raza} onChange={(raza) => setDraft((d) => ({ ...d, raza }))} />
        <Builtin legend="Nivel" draft={draft.nivel} error={errors.nivel} onChange={(nivel) => setDraft((d) => ({ ...d, nivel: { ...d.nivel, ...nivel } }))}>
          <div className="grid grid-cols-2 gap-3">
            {level('min', 'Mínimo')}
            {level('max', 'Máximo')}
          </div>
          {errors.range && (
            <p id={`${rangeId}-error`} role="alert" className="text-[13px] text-red-400">
              {errors.range}
            </p>
          )}
        </Builtin>
      </div>

      <fieldset className="border border-border-base px-4 py-3">
        <legend className="px-1 font-exo text-[11px] font-semibold tracking-[0.15em] uppercase text-txt-primary">Bloques de la ficha</legend>
        <p className="text-[12px] text-txt-muted mb-3">Los bloques desmarcados no aparecen en el formulario ni en el detalle del personaje. Los datos ya cargados no se borran.</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {SECTION_KEYS.map((key) => (
            <Check
              key={key}
              label={SECTION_LABEL[key]}
              checked={draft.sections[key]}
              onChange={(checked) => setDraft((d) => ({ ...d, sections: { ...d.sections, [key]: checked } }))}
            />
          ))}
        </div>
      </fieldset>

      <DistanceFieldset units={draft.distance} errors={errors.distance} onChange={(distance) => setDraft((d) => ({ ...d, distance }))} />

      <div>
        <button type="submit" className={btnSecondary} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar sistema'}
        </button>
      </div>
    </form>
  )
}

/**
 * The system of the campaign (DM only): which built-in character fields exist and what they are called, the level range
 * and which blocks the character sheet shows. The whole document is written through the validated RPC; the parts edited
 * elsewhere (currency, modules) travel unchanged.
 */
export function SystemSettings() {
  const { campaign, notice, setNotice, saves, saveSystem } = useCampaignSave()
  const stored = parseSystemProfile(campaign.system_profile)

  async function onSave(draft: SystemDraft): Promise<SystemErrors | null> {
    setNotice(null)
    const result = validateSystem(draft, stored)
    if (!result.ok) {
      setNotice({ kind: 'error', text: 'Revisá los campos marcados.' })
      return result.errors
    }
    await saveSystem(result.profile, 'Sistema guardado.', 'No se pudo guardar el sistema. Intentá de nuevo.')
    return null
  }

  // Remount the draft when a save succeeded or the stored document changed (another DM, conflict re-read).
  const formKey = `${saves}:${JSON.stringify(campaign.system_profile)}`
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-txt-secondary">
        Definí cómo es la ficha de los personajes en esta campaña: nombres de los campos integrados, rango de nivel, bloques que se usan y unidades de distancia.
      </p>
      <SystemForm key={formKey} initial={systemDraft(stored)} onSave={onSave} />
      {notice && (
        <p role={notice.kind === 'error' ? 'alert' : 'status'} className={notice.kind === 'error' ? 'text-[13px] text-red-400' : 'text-[13px] text-accent-bright'}>
          {notice.text}
        </p>
      )}
    </div>
  )
}
