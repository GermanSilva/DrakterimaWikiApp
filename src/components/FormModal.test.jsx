import { createEvent, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FormModal from './FormModal'

const closeForm = vi.fn()

vi.mock('../AppContext', () => ({
  useApp: () => ({ db: { pnjs: [] }, closeForm, activeFieldRef: { current: null } }),
}))

// The real forms pull in most of the app; a plain input is enough to exercise requestClose.
vi.mock('./forms/PNJForm', () => ({
  default: () => <input aria-label="nombre" />,
}))
vi.mock('../pages/pj/PJForm', () => ({ default: () => null }))
vi.mock('../pages/MapaForm', () => ({ default: () => null }))
vi.mock('../pages/MapPointForm', () => ({ default: () => null }))
vi.mock('../pages/DisponibilidadForm', () => ({ default: () => null }))
vi.mock('./forms/SesionForm', () => ({ default: () => null }))
vi.mock('./forms/AvanceForm', () => ({ default: () => null }))
vi.mock('./forms/LugarForm', () => ({ default: () => null }))
vi.mock('./forms/FaccionForm', () => ({ default: () => null }))
vi.mock('./forms/LoreForm', () => ({ default: () => null }))
vi.mock('./forms/ItemForm', () => ({ default: () => null }))
vi.mock('./forms/HomeruleForm', () => ({ default: () => null }))
vi.mock('./WikiLinkPicker', () => ({ default: () => null }))

// jsdom may lack PointerEvent, so set `button` explicitly on the event.
function pointerDown(el) {
  const ev = createEvent.pointerDown(el)
  Object.defineProperty(ev, 'button', { value: 0 })
  fireEvent(el, ev)
}

function clickBackdrop() {
  const backdrop = document.getElementById('form-overlay')
  pointerDown(backdrop)
  fireEvent.click(backdrop)
}

describe('FormModal requestClose', () => {
  let confirmSpy

  beforeEach(() => {
    closeForm.mockClear()
    confirmSpy = vi.spyOn(window, 'confirm')
  })
  afterEach(() => {
    confirmSpy.mockRestore()
  })

  const renderModal = () => render(<FormModal form={{ type: 'pnjs', id: null }} />)

  it('closes without asking when the form is empty', () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(closeForm).toHaveBeenCalledTimes(1)
  })

  it('treats whitespace-only fields as empty', () => {
    renderModal()
    fireEvent.change(screen.getByLabelText('nombre'), { target: { value: '   ' } })
    clickBackdrop()
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(closeForm).toHaveBeenCalledTimes(1)
  })

  it('asks for confirmation when data was typed and stays open if the user cancels', () => {
    confirmSpy.mockReturnValue(false)
    renderModal()
    fireEvent.change(screen.getByLabelText('nombre'), { target: { value: 'Aldric' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(closeForm).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closes when the user confirms discarding typed data', () => {
    confirmSpy.mockReturnValue(true)
    renderModal()
    fireEvent.change(screen.getByLabelText('nombre'), { target: { value: 'Aldric' } })
    clickBackdrop()
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(closeForm).toHaveBeenCalledTimes(1)
  })

  it('does not close when a press starts in an input and is released on the backdrop (drag-out)', () => {
    renderModal()
    const input = screen.getByLabelText('nombre')
    fireEvent.change(input, { target: { value: 'Aldric' } })
    pointerDown(input)
    fireEvent.click(document.getElementById('form-overlay'))
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(closeForm).not.toHaveBeenCalled()
  })
})
