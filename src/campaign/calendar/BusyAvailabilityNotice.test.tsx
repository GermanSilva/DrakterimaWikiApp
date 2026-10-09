import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BusyAvailabilityNotice } from './BusyAvailabilityNotice'

describe('BusyAvailabilityNotice', () => {
  it('renders nothing once the busy slots are known', () => {
    const { container } = render(<BusyAvailabilityNotice status="ready" onRetry={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a loading status while they load, without a retry', () => {
    render(<BusyAvailabilityNotice status="loading" onRetry={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('Cargando disponibilidad de otras campañas…')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it.each(['error', 'idle'] as const)('%s: explains why saving is blocked and offers a retry', (status) => {
    const onRetry = vi.fn()
    render(<BusyAvailabilityNotice status={status} onRetry={onRetry} />)
    expect(screen.queryByText(/Cargando/)).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent('no se puede guardar')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
