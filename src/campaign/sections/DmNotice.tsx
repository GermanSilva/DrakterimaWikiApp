import { btnSecondary } from '../../constants'

/** Small inline notice for a failed DM-only read (never silent: the blocks it would fill are simply absent). */
export function DmNotice({ children, onRetry }: { children: string; onRetry: () => void }) {
  return (
    <p role="alert" className="text-xs text-txt-muted my-3">
      {children}{' '}
      <button type="button" className={btnSecondary} onClick={onRetry}>
        Reintentar
      </button>
    </p>
  )
}
