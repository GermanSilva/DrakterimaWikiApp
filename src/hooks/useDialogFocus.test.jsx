import { render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it } from 'vitest'
import useDialogFocus from './useDialogFocus'

function Dialog({ withInput = true }) {
  const ref = useRef(null)
  useDialogFocus(ref)
  return (
    <div ref={ref} role="dialog" tabIndex={-1} data-testid="dlg">
      {withInput && <input aria-label="first" />}
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
})
