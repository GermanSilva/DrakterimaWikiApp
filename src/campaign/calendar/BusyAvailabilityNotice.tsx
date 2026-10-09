import { btnSecondary } from '../../constants'

/** State of the other-campaign busy slots as the forms see it: only `ready` means "known". */
export type BusyStatus = 'idle' | 'loading' | 'ready' | 'error'

/** Why Save is held back while the busy slots are not loaded; renders nothing once they are. */
export function BusyAvailabilityNotice({ status, onRetry }: { status: BusyStatus; onRetry: () => void }) {
  if (status === 'ready') return null
  if (status === 'error') {
    return (
      <p role="alert" className="text-sm text-red-400 m-0">
        No pudimos cargar la disponibilidad de otras campañas, así que no se puede guardar.{' '}
        <button type="button" className={btnSecondary} onClick={onRetry}>
          Reintentar
        </button>
      </p>
    )
  }
  return (
    <p role="status" className="text-sm text-txt-muted m-0">
      Cargando disponibilidad de otras campañas…
    </p>
  )
}
