import { Component } from 'react'
import { btnPrimary } from '../constants'

/**
 * Catches render errors in its subtree, logs them and shows a Spanish fallback
 * with a "Reintentar" button that clears the error and re-renders the children.
 */
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught an error', error, info?.componentStack)
  }

  handleRetry = () => {
    // React caches a rejected lazy() import, so re-rendering cannot recover from a
    // failed chunk load (e.g. after a deploy); a full reload fetches the new chunks.
    const { error } = this.state
    if (error?.name === 'ChunkLoadError' || /dynamically imported module|Importing a module script failed/i.test(error?.message ?? '')) {
      window.location.reload()
      return
    }
    this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="p-10 max-w-[560px] mx-auto text-center">
        <div className="font-exo text-[17px] font-bold text-txt-primary uppercase tracking-[0.06em] mb-3">
          Algo salió mal
        </div>
        <p className="text-txt-secondary text-[14px] mb-6">
          Ocurrió un error inesperado al mostrar esta sección.
        </p>
        <button type="button" className={btnPrimary} onClick={this.handleRetry}>Reintentar</button>
      </div>
    )
  }
}
