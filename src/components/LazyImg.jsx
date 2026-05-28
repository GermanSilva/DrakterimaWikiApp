import { useState, useEffect } from 'react'

// containerCls must include a height class (e.g. h-[280px]) for skeleton/error overlays to be visible
export default function LazyImg({ src, alt, className, containerCls, onClick }) {
  const [status, setStatus] = useState('loading')

  useEffect(() => { setStatus('loading') }, [src])

  if (!src) return null

  return (
    <div className={`relative overflow-hidden ${containerCls ?? ''}`}>
      {status === 'loading' && (
        <div className="absolute inset-0 skeleton-shimmer" />
      )}
      <img
        src={src}
        alt={alt ?? ''}
        className={`transition-opacity duration-200 ${status === 'loaded' ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${className ?? ''}`}
        loading="lazy"
        decoding="async"
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
        onClick={onClick}
      />
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-txt-muted italic">
          Imagen no disponible
        </div>
      )}
    </div>
  )
}
