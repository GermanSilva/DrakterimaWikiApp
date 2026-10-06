import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Toast from './Toast'

describe('Toast', () => {
  it('renders the success variant as a polite status by default', () => {
    render(<Toast message="Guardado" />)
    const el = screen.getByRole('status')
    expect(el).toHaveTextContent('Guardado')
    expect(el).toHaveAttribute('aria-live', 'polite')
    expect(el.className).toContain('text-accent-bright')
  })

  it('renders the error variant as an assertive alert', () => {
    render(<Toast message="No se pudo guardar" variant="error" />)
    const el = screen.getByRole('alert')
    expect(el).toHaveTextContent('No se pudo guardar')
    expect(el).toHaveAttribute('aria-live', 'assertive')
    expect(el.className).not.toContain('text-accent-bright')
  })
})
