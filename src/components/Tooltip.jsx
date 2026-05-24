import { Tag } from './Shared'

/**
 * Tooltip estilizado para wiki-links.
 * Requiere que el elemento padre tenga las clases `group` y `relative`.
 * Props:
 *   title   — nombre del artículo
 *   section — etiqueta de sección (ej. "Lugar", "PNJ")
 */
export default function Tooltip({ title, section, imagenUrl }) {
  return (
    <span
      className={[
        'absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50',
        'pointer-events-none select-none',
        'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
        'bg-bg-card border border-border-light',
        'px-3 py-2 shadow-[0_4px_16px_rgba(0,0,0,0.5)]',
        imagenUrl ? 'flex flex-row items-start gap-2.5 max-w-[240px]' : 'flex flex-col items-start gap-1.5 min-w-max max-w-[200px]',
      ].join(' ')}
    >
      {imagenUrl && (
        <img
          src={imagenUrl}
          alt=""
          className="object-cover rounded-sm flex-shrink-0"
          style={{ maxHeight: 72, maxWidth: 72 }}
          onError={e => { e.currentTarget.style.display = 'none' }}
        />
      )}
      <span className="flex flex-col gap-1.5 items-start">
        <span className="font-exo text-[16px] font-semibold text-txt-primary whitespace-nowrap leading-tight">
          {title}
        </span>
        <Tag cls="neutral" text={section} />
      </span>
    </span>
  )
}
