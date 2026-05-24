import { useEffect } from 'react'

/**
 * Modal de imagen a pantalla completa.
 * Props:
 *   src     — URL de la imagen
 *   alt     — texto alternativo
 *   onClose — callback para cerrar
 */
export default function ImageLightbox({ src, alt, onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-black/[.88] z-[400] flex items-center justify-center backdrop-blur-sm"
      onClick={onClose}
    >
      <img
        src={src}
        alt={alt}
        className="max-w-[92vw] max-h-[88vh] object-contain"
        onClick={e => e.stopPropagation()}
      />
    </div>
  )
}
