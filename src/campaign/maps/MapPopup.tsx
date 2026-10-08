import { btnPrimary, btnSecondary } from '../../constants'
import { parseHttpsUrl } from '../branding'
import { str } from '../sections/format'
import type { FlatEntity } from '../../data'

/** What the point links to, as the panel resolved it for THIS viewer. */
export type PopupLink =
  | { kind: 'article'; section: string; title: string; imageUrl: string | null; onOpen: () => void }
  | { kind: 'map'; title: string; onOpen: () => void }
  /** The target does not exist or this viewer cannot see it: nothing about it is shown. */
  | { kind: 'missing' }
  /** The index that resolves it is still loading. */
  | { kind: 'pending' }

const TYPE_ICON: Record<string, string> = { lugar: '🏰', pnj: '👤', faccion: '⚔️', lore: '📜', item: '💎', sesion: '📖', mapa: '🗺' }

/**
 * Popup of a pin, positioned by the panel over the map (not a Leaflet popup). Every string is rendered as
 * text by React; images only when their URL is https.
 */
export function MapPopup({
  point,
  link,
  isDM,
  onEdit,
  onClose,
}: {
  point: FlatEntity
  link: PopupLink | null
  isDM: boolean
  onEdit: () => void
  onClose: () => void
}) {
  const linkType = str(point.link_type)
  // own keys only: a stored "constructor" must not resolve to Object.prototype.constructor
  const icon = (Object.prototype.hasOwnProperty.call(TYPE_ICON, linkType) ? TYPE_ICON[linkType] : undefined) ?? '📍'
  const nombre = str(point.nombre)
  const descripcion = str(point.descripcion)
  const image = link?.kind === 'article' ? parseHttpsUrl(link.imageUrl) : null
  return (
    <div
      role="dialog"
      aria-label={nombre || 'Punto del mapa'}
      className="relative bg-[#1a1a1a] border border-[#333] rounded-md shadow-xl"
      style={{ width: 200, pointerEvents: 'auto' }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)', width: 0, height: 0,
          borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '6px solid #333',
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', bottom: -5, left: '50%', transform: 'translateX(-50%)', width: 0, height: 0,
          borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid #1a1a1a', zIndex: 1,
        }}
      />
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute top-1.5 right-2 text-[#777] hover:text-[#aaa] text-xs"
        onClick={onClose}
        style={{ zIndex: 2 }}
      >
        ✕
      </button>
      {image && (
        <div className="h-12 overflow-hidden rounded-t-md">
          <img src={image} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
        </div>
      )}
      <div className="px-3 pt-2 pb-3">
        {link?.kind === 'article' && (
          <div className="text-[10px] text-txt-muted uppercase tracking-wider mb-0.5 font-mono">{link.section}</div>
        )}
        <div className="text-[13px] font-bold text-txt-primary mb-1 leading-tight">
          <span aria-hidden="true">{icon} </span>
          {nombre}
        </div>
        {descripcion && <div className="text-[11px] text-txt-muted leading-snug mb-2 line-clamp-2">{descripcion}</div>}
        {link?.kind === 'article' && link.title && link.title !== nombre && (
          <div className="text-[11px] text-txt-secondary mb-2">{link.title}</div>
        )}
        {link?.kind === 'missing' && <div className="text-[11px] text-txt-muted italic mb-2">El artículo vinculado no está disponible.</div>}
        <div className="flex gap-1.5">
          {(link?.kind === 'article' || link?.kind === 'map') && (
            <button type="button" className={btnPrimary} style={{ fontSize: 11, padding: '4px 8px', flex: 1 }} onClick={link.onOpen}>
              {link.kind === 'map' ? 'Abrir mapa' : 'Ver artículo'}
            </button>
          )}
          {isDM && (
            <button type="button" aria-label="Editar punto" className={btnSecondary} style={{ fontSize: 11, padding: '4px 8px' }} onClick={onEdit}>
              ✏️
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
