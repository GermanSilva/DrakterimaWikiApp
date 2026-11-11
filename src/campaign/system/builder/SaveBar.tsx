import { useId } from 'react'
import { btnPrimary } from '../../../constants'

interface Props {
  changes: number
  errors: number
  saving: boolean
  /** Without it the builder has no Save button (the state line still shows). */
  onSave?: () => void
}

const changesText = (n: number) => (n === 0 ? 'Sin cambios' : n === 1 ? '1 cambio sin guardar' : `${n} cambios sin guardar`)
const errorsText = (n: number) => (n === 1 ? '1 error impide guardar' : `${n} errores impiden guardar`)

/** The top bar of the builder: what is unsaved, what blocks saving, and the Save button (its reason is read with it while it is disabled). */
export function SaveBar({ changes, errors, saving, onSave }: Props) {
  const reasonId = useId()
  const blocked = errors > 0
  const reason = errors === 1 ? 'Corregí el error de la plantilla para poder guardar.' : `Corregí los ${errors} errores de la plantilla para poder guardar.`
  return (
    <div role="group" aria-label="Estado de la plantilla" className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border border-border-base bg-bg-card px-3.5 py-2.5">
      <p className="min-w-0 flex-1 text-[13px] text-txt-secondary">
        {changesText(changes)}
        {blocked && <span className="text-red-400"> · {errorsText(errors)}</span>}
      </p>
      {onSave && (
        <>
          {blocked && (
            <span id={reasonId} className="sr-only">
              {reason}
            </span>
          )}
          <button
            type="button"
            className={`${btnPrimary} disabled:opacity-40 disabled:cursor-not-allowed`}
            disabled={blocked || saving}
            aria-describedby={blocked ? reasonId : undefined}
            title={blocked ? reason : undefined}
            onClick={onSave}
          >
            {saving ? 'Guardando…' : 'Guardar plantilla'}
          </button>
        </>
      )}
    </div>
  )
}
