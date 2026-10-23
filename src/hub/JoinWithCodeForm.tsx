import { useId, useState, type FormEvent } from 'react'
import { btnSecondary, inputCls, labelCls } from '../constants'
import { normalizeInviteCode } from './campaignSlug'

/** Collects an invite code and hands the normalised code to the caller (which navigates). */
export function JoinWithCodeForm({ onJoin }: { onJoin: (code: string) => void }) {
  const id = useId()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    const normalized = normalizeInviteCode(code)
    if (!normalized) {
      setError('Ingresá un código de invitación válido.')
      return
    }
    setError(null)
    onJoin(normalized)
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Unirme a campaña">
      <label htmlFor={id} className={labelCls}>
        Código de invitación
      </label>
      <input
        id={id}
        className={inputCls}
        value={code}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => setCode(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
      />
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-accent-bright">
          {error}
        </p>
      )}
      <button type="submit" className={`${btnSecondary} mt-4`}>
        Ver invitación
      </button>
    </form>
  )
}
