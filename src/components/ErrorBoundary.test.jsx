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
