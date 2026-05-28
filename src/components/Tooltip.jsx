import { useState } from 'react'
import { Tag } from './Shared'

function TooltipThumb({ src }) {
  const [status, setStatus] = useState('loading')
  if (status === 'error') return null
  return (
    <span
      className="flex-shrink-0 relative rounded-sm overflow-hidden"
      style={status === 'loading' ? { minWidth: 60, minHeight: 60 } : {}}
    >
      {status === 'loading' && <span className="absolute inset-0 skeleton-shimmer" />}
      <img
        src={src}
        alt=""
        fetchPriority="low"
        style={{ display: 'block', maxWidth: 100, maxHeight: 100 }}
        className={`transition-opacity duration-200 ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
      />
    </span>
  )
}

export default function Tooltip({ title, section, imagenUrl }) {
  return (
    <span
      className={[
        'absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-[1000]',
        'pointer-events-none select-none',
        'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
        'bg-bg-card border border-border-light',
        'p-2 shadow-[0_4px_16px_rgba(0,0,0,0.5)]',
        'flex flex-row items-start gap-2 max-w-[400px]',
      ].join(' ')}
    >
      {imagenUrl && <TooltipThumb src={imagenUrl} />}
      <span className="flex flex-col gap-1.5 items-start">
        <span className="font-exo text-[16px] font-semibold text-txt-primary whitespace-nowrap leading-tight">
          {title}
        </span>
        <span className="font-exo text-[9px] font-semibold tracking-[0.1em] uppercase inline-block whitespace-nowrap -mt-2">{section}</span>
      </span>
    </span>
  )
}
