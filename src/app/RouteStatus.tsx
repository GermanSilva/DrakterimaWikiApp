import { useEffect, useState } from 'react'
import { Link, isRouteErrorResponse, useRouteError } from 'react-router'
import { btnSecondary } from '../constants'
import { isChunkLoadError, reloadGuardTripped, reloadOnceForChunkError } from './chunkError'

export function LoadingScreen({ label = 'Cargando…' }: { label?: string }) {
  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-bg-deep">
      <h1 className="sr-only" data-loading>
        {label}
      </h1>
      <p role="status" className="text-center text-sm text-txt-muted pt-24">
        {label}
      </p>
    </main>
  )
}

/**
 * Route-level failure. A failed dynamic import (typically a stale chunk after a deploy) reloads the
 * page once; anything else, or a repeated chunk failure, shows a way out without error details.
 */
export function RouteErrorScreen() {
  const error = useRouteError()
  // Decided once from pure inputs; the effect only performs the side effect (storage guard + reload).
  const [reloading] = useState(() => isChunkLoadError(error) && !reloadGuardTripped())
  useEffect(() => {
    if (reloading) reloadOnceForChunkError(error)
  }, [reloading, error])

  if (!isRouteErrorResponse(error)) console.error('route error', error instanceof Error ? error.name : 'unknown')
  if (reloading) return <LoadingScreen label="Actualizando…" />
  return (
    <main id="main-content" tabIndex={-1} className="max-w-sm mx-auto pt-24 px-4 text-center">
      <h1 className="font-exo text-lg font-semibold tracking-[0.15em] uppercase text-txt-primary mb-3">Algo salió mal</h1>
      <p className="text-sm text-txt-secondary mb-5">No pudimos cargar esta pantalla. Volvé a intentar o regresá al inicio.</p>
      <div className="flex gap-3 justify-center">
        <button type="button" className={btnSecondary} onClick={() => window.location.reload()}>
          Recargar
        </button>
        <Link to="/" className={btnSecondary}>
          Ir al inicio
        </Link>
      </div>
    </main>
  )
}
