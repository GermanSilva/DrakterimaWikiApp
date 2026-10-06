import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { clickable } from './a11y'

describe('clickable', () => {
  it('exposes a focusable button role and activates on click, Enter and Space', () => {
    const fn = vi.fn()
    render(<div {...clickable(fn)}>card</div>)
    const el = screen.getByRole('button', { name: 'card' })
    expect(el).toHaveAttribute('tabindex', '0')
    fireEvent.click(el)
    fireEvent.keyDown(el, { key: 'Enter' })
    fireEvent.keyDown(el, { key: ' ' })
    fireEvent.keyDown(el, { key: 'a' })
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('ignores key events bubbling from nested controls', () => {
    const fn = vi.fn()
    render(<div {...clickable(fn)}><button type="button">inner</button></div>)
    fireEvent.keyDown(screen.getByText('inner'), { key: 'Enter' })
    expect(fn).not.toHaveBeenCalled()
  })
})
