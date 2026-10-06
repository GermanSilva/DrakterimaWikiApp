import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ErrorBoundary from './ErrorBoundary'

let shouldThrow

function Bomb() {
  if (shouldThrow) throw new Error('boom')
  return <div>contenido ok</div>
}

describe('ErrorBoundary', () => {
  let errorSpy
  beforeEach(() => {
    shouldThrow = false
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('renders children when nothing throws', () => {
    render(<ErrorBoundary><Bomb /></ErrorBoundary>)
    expect(screen.getByText('contenido ok')).toBeInTheDocument()
  })

  it('shows the Spanish fallback and logs the error when a child throws', () => {
    shouldThrow = true
    render(<ErrorBoundary><Bomb /></ErrorBoundary>)
    expect(screen.getByRole('alert')).toHaveTextContent('Algo salió mal')
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    expect(errorSpy.mock.calls.some(call => call[0] === 'ErrorBoundary caught an error')).toBe(true)
  })

  it('re-renders the children after Reintentar once the cause is gone', () => {
    shouldThrow = true
    render(<ErrorBoundary><Bomb /></ErrorBoundary>)
    shouldThrow = false
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(screen.getByText('contenido ok')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('ErrorBoundary chunk-load recovery', () => {
  let errorSpy
  let reloadSpy
  let originalLocation

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    reloadSpy = vi.fn()
    originalLocation = window.location
    // jsdom's location.reload is not configurable: replace the whole object for the test.
    Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, reload: reloadSpy } })
  })
  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
    errorSpy.mockRestore()
  })

  function Failing({ error }) {
    throw error
  }

  it.each([
    ['ChunkLoadError name', Object.assign(new Error('Loading chunk 3 failed'), { name: 'ChunkLoadError' })],
    ['dynamic import message', new Error('Failed to fetch dynamically imported module: /assets/x.js')],
    ['module script message', new Error('Importing a module script failed.')],
  ])('reloads the page on Reintentar for a failed chunk (%s)', (_label, error) => {
    render(<ErrorBoundary><Failing error={error} /></ErrorBoundary>)
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(reloadSpy).toHaveBeenCalledTimes(1)
    // the boundary keeps its fallback: a reload is pending instead of a re-render
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('does not reload for an ordinary render error', () => {
    render(<ErrorBoundary><Failing error={new Error('boom')} /></ErrorBoundary>)
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(reloadSpy).not.toHaveBeenCalled()
  })
})
