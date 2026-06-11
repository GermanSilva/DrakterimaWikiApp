import { useApp } from '../AppContext'
import { btnPrimary, btnSecondary } from '../constants'

const COLLECTION_PAGE = {
  lugar: 'lugares', pnj: 'pnjs', faccion: 'facciones',
  lore: 'lore', item: 'items', sesion: 'sesiones',
}

const TYPE_ICON = {
  lugar: '🏰', pnj: '👤', faccion: '⚔️',
  lore: '📜', item: '💎', sesion: '📖', mapa: '🗺',
}

export default function MapPopup({ point, db, isDM, onNavigateToMap, onEditPoint, onClose }) {
  const { goToDetail } = useApp()

  const linkedEntity = point.link_type && point.link_id
    ? (db[COLLECTION_PAGE[point.link_type] ?? 'mapas'] ?? []).find(e => e.id === point.link_id)
    : null

  const isMapa = point.link_type === 'mapa'
  const icon = TYPE_ICON[point.link_type] ?? '📍'

  function handlePrimary() {
    if (isMapa) {
      const mapa = db.mapas.find(m => m.id === point.link_id)
      if (mapa) onNavigateToMap(mapa.id, mapa.nombre)
    } else if (point.link_type && COLLECTION_PAGE[point.link_type] && point.link_id) {
      goToDetail(COLLECTION_PAGE[point.link_type], point.link_id)
    }
    onClose()
  }

  const hasPrimaryAction = (isMapa || (point.link_type && point.link_id))

  return (
    <div
      className="bg-[#1a1a1a] border border-[#333] rounded-md shadow-xl overflow-hidden"
      style={{ width: 200, pointerEvents: 'auto' }}
    >
      {/* Arrow pointing down to pin */}
      <div style={{
        position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)',
        width: 0, height: 0,
        borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
        borderTop: '6px solid #333',
      }} />
      <div style={{
        position: 'absolute', bottom: -5, left: '50%', transform: 'translateX(-50%)',
        width: 0, height: 0,
        borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
        borderTop: '5px solid #1a1a1a', zIndex: 1,
      }} />

      {/* Close button */}
      <button
        className="absolute top-1.5 right-2 text-[#555] hover:text-[#aaa] text-xs"
        onClick={onClose}
        style={{ zIndex: 2 }}
      >✕</button>

      {/* Image / icon header */}
      {linkedEntity?.imagen_url && (
        <div className="h-12 flex items-center justify-center text-2xl"
          style={{ background: linkedEntity?.imagen_url ? undefined : 'linear-gradient(135deg, #1f2f18, #0f1c0a)' }}
        >
          {linkedEntity?.imagen_url
            ? <img src={linkedEntity.imagen_url} alt="" className="w-full h-full object-cover" onError={e => e.target.style.display = 'none'} />
            : icon}
        </div>
      )}

      {/* Content */}
      <div className="px-3 pt-2 pb-3">
        {linkedEntity && (
          <div className="text-[10px] text-txt-muted uppercase tracking-wider mb-0.5 font-mono">
            {point.link_type}
            {linkedEntity.region ? ` · ${linkedEntity.region}` : ''}
            {linkedEntity.categoria ? ` · ${linkedEntity.categoria}` : ''}
          </div>
        )}
        <div className="text-[13px] font-bold text-txt-primary mb-1 leading-tight">
          {point.nombre}
        </div>
        {point.descripcion && (
          <div className="text-[11px] text-txt-muted leading-snug mb-2 line-clamp-2">
            {point.descripcion}
          </div>
        )}
        <div className="flex gap-1.5">
          {hasPrimaryAction && (
            <button className={btnPrimary} style={{ fontSize: 11, padding: '4px 8px', flex: 1 }} onClick={handlePrimary}>
              {isMapa ? 'Abrir mapa' : 'Ver artículo'}
            </button>
          )}
          {isDM && (
            <button className={btnSecondary} style={{ fontSize: 11, padding: '4px 8px' }} onClick={onEditPoint}>
              ✏️
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
