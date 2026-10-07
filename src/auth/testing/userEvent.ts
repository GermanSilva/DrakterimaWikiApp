import { act, fireEvent } from '@testing-library/react'

/** Tiny stand-in for @testing-library/user-event (not a dependency of this project). */
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
