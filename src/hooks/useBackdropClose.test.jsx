import { render, screen, fireEvent, createEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import useBackdropClose from './useBackdropClose'
import SpellDetailModal from '../pages/pj/detail/SpellDetailModal'
import AccessModal from '../components/AccessModal'
import ImageLightbox from '../components/ImageLightbox'

function Harness({ onClose, enabled }) {
  const props = useBackdropClose(onClose, enabled)
  return (
    <div data-testid="backdrop" {...props}>
      <div data-testid="content">content</div>
    </div>
  )
}

// jsdom may lack PointerEvent, so set `button` explicitly on the event.
function pointerDown(el, button = 0) {
  const ev = createEvent.pointerDown(el)
  Object.defineProperty(ev, 'button', { value: button })
  fireEvent(el, ev)
}

describe('useBackdropClose', () => {
  it('closes when press and click both happen on the backdrop', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    const backdrop = screen.getByTestId('backdrop')
    pointerDown(backdrop)
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close when the press starts inside the content and the click lands on the backdrop', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    pointerDown(screen.getByTestId('content'))
    fireEvent.click(screen.getByTestId('backdrop'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not close when the press starts on the backdrop and the click lands on the content', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    pointerDown(screen.getByTestId('backdrop'))
    fireEvent.click(screen.getByTestId('content'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('ignores non-primary buttons', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    const backdrop = screen.getByTestId('backdrop')
    pointerDown(backdrop, 2)
    fireEvent.click(backdrop)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('resets after a click so a stale press cannot close later', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    const backdrop = screen.getByTestId('backdrop')
    pointerDown(backdrop)
    fireEvent.click(backdrop)
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does nothing when disabled', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} enabled={false} />)
    const backdrop = screen.getByTestId('backdrop')
    pointerDown(backdrop)
    fireEvent.click(backdrop)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not close when the press starts on the backdrop and is released inside the content', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    const backdrop = screen.getByTestId('backdrop')
    pointerDown(backdrop)
    // pointerup bubbles from the content; the browser then fires click on the common ancestor
    fireEvent.pointerUp(screen.getByTestId('content'))
    fireEvent.click(backdrop)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not close after a cancelled gesture', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    const backdrop = screen.getByTestId('backdrop')
    pointerDown(backdrop)
    fireEvent.pointerCancel(backdrop)
    fireEvent.click(backdrop)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('still closes when press and release both happen on the backdrop', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    const backdrop = screen.getByTestId('backdrop')
    pointerDown(backdrop)
    fireEvent.pointerUp(backdrop)
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('modals using useBackdropClose', () => {
  const spell = { nombre: 'Bola de fuego', nivel: 3 }

  it('SpellDetailModal survives a drag from inside out to the backdrop, and closes with the button', () => {
    const onClose = vi.fn()
    render(<SpellDetailModal spell={spell} onClose={onClose} />)
    const dialog = screen.getByRole('dialog')
    const backdrop = dialog.parentElement
    pointerDown(dialog)
    fireEvent.click(backdrop)
    expect(onClose).not.toHaveBeenCalled()

    pointerDown(backdrop)
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('AccessModal ignores a drag-out and closes on a real backdrop click', () => {
    const onClose = vi.fn()
    render(<AccessModal onClose={onClose} onAccess={() => ({ success: false })} />)
    const dialog = screen.getByRole('dialog')
    const backdrop = dialog.parentElement
    pointerDown(screen.getByLabelText('Contraseña'))
    fireEvent.click(backdrop)
    expect(onClose).not.toHaveBeenCalled()

    pointerDown(backdrop)
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ImageLightbox has a visible close button', () => {
    const onClose = vi.fn()
    render(<ImageLightbox src="x.png" alt="mapa" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
