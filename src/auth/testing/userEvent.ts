import { act, fireEvent } from '@testing-library/react'

/**
 * Tiny stand-in for @testing-library/user-event (not a dependency of this project), used by the
 * auth component tests. It only dispatches synthetic click/change events inside act(): it does NOT
 * simulate focus, key-by-key typing, pointer events, disabled-element semantics beyond what React
 * does, or input sanitization (e.g. jsdom strips whitespace from type=email on change).
 */
export const userEvent = {
  async click(el: Element) {
    await act(async () => {
      fireEvent.click(el)
    })
  },
  async clear(el: Element) {
    await act(async () => {
      fireEvent.change(el, { target: { value: '' } })
    })
  },
  async type(el: Element, text: string) {
    await act(async () => {
      fireEvent.change(el, { target: { value: (el as HTMLInputElement).value + text } })
    })
  },
}
