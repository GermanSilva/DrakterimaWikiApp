import { useId, useState, type FormEvent } from 'react'
import { btnPrimary, inputCls, labelCls } from '../constants'
import type { Profile, ProfileRepository } from '../data'
import { sanitizeForLog } from './authErrors'
import { AVATAR_URL_MAX, DISPLAY_NAME_MAX, validateProfile, type ProfileErrors } from './profileValidation'

export interface ProfileFormProps {
  profile: Profile
  repository: Pick<ProfileRepository, 'update'>
  /** Called with the saved profile (e.g. to refreshProfile()). */
  onSaved?: (profile: Profile) => void
}

export function ProfileForm({ profile, repository, onSaved }: ProfileFormProps) {
  const nameId = useId()
  const avatarId = useId()
  const [displayName, setDisplayName] = useState(profile.display_name)
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? '')
  const [errors, setErrors] = useState<ProfileErrors>({})
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ kind: 'saved' } | { kind: 'error'; message: string } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    const result = validateProfile({ display_name: displayName, avatar_url: avatarUrl })
    setStatus(null)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    setSaving(true)
    let saved: Profile
    try {
      saved = await repository.update(profile.id, result.value)
    } catch {
      setStatus({ kind: 'error', message: 'No pudimos guardar tu perfil. Volvé a intentar.' })
      setSaving(false)
      return
    }
    setSaving(false)
    setStatus({ kind: 'saved' })
    // Outside the try: a failing callback must not be reported as "could not save" (it was saved).
    try {
      onSaved?.(saved)
    } catch (e) {
      console.warn('profile form: onSaved callback failed', sanitizeForLog(e))
    }
  }

  return (
    <form onSubmit={submit} noValidate className="max-w-sm">
      <label htmlFor={nameId} className={labelCls}>
        Nombre para mostrar
      </label>
      <input
        id={nameId}
        className={inputCls}
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        aria-invalid={!!errors.display_name}
        aria-describedby={errors.display_name ? `${nameId}-err` : undefined}
        autoComplete="nickname"
      />
      {errors.display_name && (
        <p id={`${nameId}-err`} role="alert" className="mt-1 text-xs text-accent-bright">
          {errors.display_name}
        </p>
      )}

      <label htmlFor={avatarId} className={`${labelCls} mt-4`}>
        URL del avatar
      </label>
      <input
        id={avatarId}
        type="url"
        className={inputCls}
        value={avatarUrl}
        placeholder="https://"
        onChange={(e) => setAvatarUrl(e.target.value)}
        aria-invalid={!!errors.avatar_url}
        aria-describedby={errors.avatar_url ? `${avatarId}-err` : undefined}
      />
      {errors.avatar_url && (
        <p id={`${avatarId}-err`} role="alert" className="mt-1 text-xs text-accent-bright">
          {errors.avatar_url}
        </p>
      )}
      <p className="mt-1 text-xs text-txt-muted">
        Máximo {DISPLAY_NAME_MAX} caracteres para el nombre y {AVATAR_URL_MAX} para la URL.
      </p>

      <button type="submit" className={`${btnPrimary} mt-4`} disabled={saving}>
        {saving ? 'Guardando…' : 'Guardar'}
      </button>
      {status?.kind === 'saved' && (
        <p role="status" className="mt-3 text-sm text-txt-secondary">
          Perfil guardado.
        </p>
      )}
      {status?.kind === 'error' && (
        <p role="alert" className="mt-3 text-sm text-accent-bright">
          {status.message}
        </p>
      )}
    </form>
  )
}
