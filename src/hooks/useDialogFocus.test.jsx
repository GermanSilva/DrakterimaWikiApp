import { render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it } from 'vitest'
import useDialogFocus from './useDialogFocus'

function Dialog({ withInput = true, preferred, withPreferred = false }) {
  const ref = useRef(null)
  useDialogFocus(ref, preferred)
  return (
    <div ref={ref} role="dialog" tabIndex={-1} data-testid="dlg">
      {withInput && <input aria-label="first" />}
      {withPreferred && <button type="button" data-autofocus>preferred</button>}
    </div>
  )
}

describe('useDialogFocus', () => {
  it('focuses the first focusable element and restores focus on unmount', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const { unmount } = render(<Dialog />)
    expect(screen.getByLabelText('first')).toHaveFocus()
    unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })

  it('falls back to the dialog container when nothing inside is focusable', () => {
    render(<Dialog withInput={false} />)
    expect(screen.getByTestId('dlg')).toHaveFocus()
  })

  it('focuses the element matching the preferred selector before the first focusable one', () => {
    render(<Dialog preferred="[data-autofocus]" withPreferred />)
    expect(screen.getByRole('button', { name: 'preferred' })).toHaveFocus()
  })

  it('falls back to the first focusable element when the preferred selector matches nothing', () => {
    render(<Dialog preferred="[data-autofocus]" />)
    expect(screen.getByLabelText('first')).toHaveFocus()
  })

  it('keeps focus where it already is inside the dialog', () => {
    function Prefocused() {
      const ref = useRef(null)
      useDialogFocus(ref, '[data-autofocus]')
      return (
        <div ref={ref} tabIndex={-1}>
          <input aria-label="typing" autoFocus />
          <button type="button" data-autofocus>preferred</button>
        </div>
      )
    }
    render(<Prefocused />)
    expect(screen.getByLabelText('typing')).toHaveFocus()
  })
})
