import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import useDialogFocus from '../hooks/useDialogFocus'
import useBackdropClose from '../hooks/useBackdropClose'

/**
 * Modal de imagen a pantalla completa.
 * Props:
 *   src     — URL de la imagen
 *   alt     — texto alternativo
 *   onClose — callback para cerrar
 */
export default function ImageLightbox({ src, alt, onClose }) {
  const dialogRef = useRef(null)
  useDialogFocus(dialogRef)
  const backdropProps = useBackdropClose(onClose)
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={alt || 'Imagen ampliada'}
      tabIndex={-1}
      className="fixed inset-0 bg-black/[.88] z-[400] flex items-center justify-center backdrop-blur-sm outline-none"
      {...backdropProps}
    >
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute top-4 right-4 p-2 text-txt-muted hover:text-txt-primary transition-colors cursor-pointer bg-black/40 border-none"
        onClick={onClose}
      >
        <X size={22} />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-w-[92vw] max-h-[88vh] object-contain"
        onClick={e => e.stopPropagation()}
      />
    </div>
  )
}
