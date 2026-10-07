import { Link } from 'react-router'
import { btnSecondary } from '../constants'

export function NotFoundPage() {
  return (
    <main id="main-content" tabIndex={-1} className="max-w-sm mx-auto pt-24 px-4 text-center outline-none">
      <h1 className="font-exo text-lg font-semibold tracking-[0.15em] uppercase text-txt-primary mb-3">Página no encontrada</h1>
      <p className="text-sm text-txt-secondary mb-5">La dirección que abriste no existe.</p>
      <Link to="/" className={btnSecondary}>
        Ir al inicio
      </Link>
    </main>
  )
}
