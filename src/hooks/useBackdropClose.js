import { useRef } from 'react'

/**
 * Props for a modal backdrop that closes only when the pointer press STARTS
 * and ENDS on the backdrop itself. Dragging from inside the dialog and
 * releasing over the backdrop (a text selection, for instance) won't close it.
 *
 * Usage: <div {...useBackdropClose(onClose)}> ...dialog... </div>
 */
export default function useBackdropClose(onClose, enabled = true) {
  const downOnBackdrop = useRef(false)

  function onPointerDown(e) {
    // Only the primary button (mouse) / touch / pen contact counts.
    if (e.button !== undefined && e.button !== 0) {
      downOnBackdrop.current = false
      return
    }
    downOnBackdrop.current = e.target === e.currentTarget
  }

  // A press that started on the backdrop but was released inside the dialog
  // still produces a click on the backdrop (the common ancestor), so the
  // release target must be the backdrop too.
  function onPointerUp(e) {
    if (e.target !== e.currentTarget) downOnBackdrop.current = false
  }

  // A cancelled gesture (e.g. a touch scroll) is never followed by a click.
  function onPointerCancel() {
    downOnBackdrop.current = false
  }

  function onClick(e) {
    const startedOnBackdrop = downOnBackdrop.current
    downOnBackdrop.current = false
    if (!enabled) return
    if (startedOnBackdrop && e.target === e.currentTarget) onClose()
  }

  return { onPointerDown, onPointerUp, onPointerCancel, onClick }
}
