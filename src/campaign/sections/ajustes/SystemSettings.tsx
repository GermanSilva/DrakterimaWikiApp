import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { btnSecondary, inputCls } from '../../../constants'
import { parseSystemProfile, SECTION_KEYS, type SectionKey } from '../../system/systemProfile'
import { systemDraft, validateSystem, type BuiltinDraft, type SystemDraft, type SystemErrors } from './systemForm'
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
        Definí cómo es la ficha de los personajes en esta campaña: nombres de los campos integrados, rango de nivel y bloques que se usan.
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
