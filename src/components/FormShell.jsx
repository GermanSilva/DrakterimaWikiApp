import { useMemo, useRef, useState } from 'react'
import { Link, X } from 'lucide-react'
import WikiLinkPicker from './WikiLinkPicker'
import useDialogFocus from '../hooks/useDialogFocus'
import useBackdropClose from '../hooks/useBackdropClose'
import { FormActionsContext } from '../ports'
import { btnSecondary } from '../constants'

const FIRST_FIELD = 'input:not([type=hidden]), textarea, select'

/**
 * Modal frame shared by the legacy app and the hub: title bar, "Insertar enlace" picker,
 * discard-confirm on close, backdrop-safe close. It knows nothing about where data lives: the host
 * passes the form component, the item and the three callbacks, and the form reads them through
 * `useFormActions()`.
 *
 * `activeFieldRef` is optional: the legacy host passes the App-level ref because the forms that
 * still use `useApp()` (PJ, mapa, ...) write their focused field there.
 */
export default function FormShell({
  type,
  title,
  FormComponent,
  item,
  prefill = /** @type {Record<string, unknown> | null} */ (null),
  isPJForm = false,
  showWikiLinks = true,
  saving = false,
  onSave,
  onRemove,
  onClose,
  activeFieldRef: externalFieldRef = undefined,
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const dialogRef = useRef(null)
  const ownFieldRef = useRef(null)
  const activeFieldRef = externalFieldRef ?? ownFieldRef
  useDialogFocus(dialogRef, FIRST_FIELD)

  const actions = useMemo(
    () => ({ save: onSave, remove: onRemove, closeForm: onClose, activeFieldRef, saving }),
    [onSave, onRemove, onClose, activeFieldRef, saving],
  )

  // Close request from the backdrop or the X button: confirm before discarding typed data.
  function requestClose() {
    const inputs = dialogRef.current?.querySelectorAll('input, textarea, select') ?? []
    const hasData = [...inputs].some(el => el.value.trim())
    if (!hasData || confirm('¿Descartar cambios?')) onClose()
  }
  const backdropProps = useBackdropClose(requestClose)

  function handleInsert(wikiLink) {
    const field = activeFieldRef.current
    if (!field) return
    const { el, setter, key } = field
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? el.value.length
    const newValue = el.value.slice(0, start) + wikiLink + el.value.slice(end)
    setter(prev => ({ ...prev, [key]: newValue }))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + wikiLink.length, start + wikiLink.length)
    })
  }

  return (
    <FormActionsContext.Provider value={actions}>
      <div
        className="fixed inset-0 bg-black/[.82] z-[1000] backdrop-blur-[4px] flex items-center justify-center"
        id="form-overlay"
        {...backdropProps}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={isPJForm ? undefined : 'form-modal-title'}
          aria-label={isPJForm ? 'Ficha de personaje' : undefined}
          tabIndex={-1}
          data-form-type={type}
          className="w-[min(640px,92vw)] max-h-[88vh] bg-bg-card border border-border-light overflow-y-auto animate-fade-in outline-none"
        >
          {isPJForm && (
            <div className="sticky top-0 z-[2] h-0 flex justify-end">
              <button
                type="button"
                aria-label="Cerrar"
                className="m-3 cursor-pointer text-txt-muted hover:text-accent-bright transition-colors bg-transparent border-none p-0"
                onClick={requestClose}
              >
                <X size={20} />
              </button>
            </div>
          )}
          {/* Extracted header for all non-PJForm types */}
          {!isPJForm && (
            <div className="font-exo text-[17px] font-bold text-txt-primary uppercase tracking-[0.06em] sticky top-0 z-[1] bg-bg-card px-8 pt-7 pb-5 border-b border-border-base flex items-center justify-between">
              <span id="form-modal-title">{title}</span>
              <div className="flex items-center gap-3">
                {showWikiLinks && (
                  <button
                    type="button"
                    className={`${btnSecondary} flex items-center gap-1.5`}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => setPickerOpen(true)}
                  >
                    <Link size={13} />
                    Insertar enlace
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Cerrar"
                  className="cursor-pointer text-txt-muted hover:text-accent-bright transition-colors bg-transparent border-none p-0"
                  onClick={requestClose}
                >
                  <X size={20} />
                </button>
              </div>
            </div>
          )}
          {FormComponent
            ? <FormComponent item={item} prefill={prefill} openPicker={isPJForm ? () => setPickerOpen(true) : undefined} />
            : null}
        </div>
      </div>
      {pickerOpen && (
        <WikiLinkPicker
          onInsert={handleInsert}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </FormActionsContext.Provider>
  )
}
