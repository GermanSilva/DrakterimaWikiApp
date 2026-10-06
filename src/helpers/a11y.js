/**
 * Props that make a non-button element (div, span, img...) behave like a
 * button for keyboard and assistive tech users: focusable, announced as a
 * button, and activated with Enter or Space. Prefer a real <button> when the
 * styling allows it; use this for card-like containers.
 *
 * Key events that bubble up from nested interactive children are ignored so
 * e.g. a delete button inside a card does not also trigger the card action.
 */
export function clickable(onActivate) {
  return {
    role: 'button',
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: e => {
      if (e.target !== e.currentTarget) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onActivate(e)
      }
    },
  }
}
