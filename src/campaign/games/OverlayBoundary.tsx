import { Component, type ReactNode } from 'react'

interface Props {
  /** Called once when the wrapped overlay throws (no WebGL, invalid roll, render failure). */
  onError: (error: unknown) => void
  children: ReactNode
}

/**
 * Keeps a failing decorative overlay from taking the page down: the error never reaches the app-level
 * boundary, the overlay renders nothing and the caller decides how to carry on (reveal the result).
 */
export class OverlayBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    this.props.onError(error)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
