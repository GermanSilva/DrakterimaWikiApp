import { useEffect, useRef, useState } from 'react'
import { MapContainer, ImageOverlay, Marker, Tooltip, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { useApp } from '../AppContext'
import MapPopup from './MapPopup'
import { btnPrimary, btnSecondary } from '../constants'

const PIN_COLORS = {
  lugar: '#dc2626', pnj: '#22c55e', faccion: '#f59e0b',
  lore: '#3b82f6', item: '#06b6d4', sesion: '#6b7280', mapa: '#eab308',
}
const PIN_DEFAULT = '#e5e7eb'

function pinIcon(color, ghost = false) {
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:22px;height:34px">
      <div style="width:22px;height:26px;background:${color};
        border-radius:50% 50% 50% 50%/60% 60% 40% 40%;
        border:2.5px ${ghost ? 'dashed' : 'solid'} rgba(255,255,255,${ghost ? '0.5' : '0.9'});
        opacity:${ghost ? 0.6 : 1};box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>
      <div style="position:absolute;bottom:0;left:5px;width:0;height:0;
        border-left:6px solid transparent;border-right:6px solid transparent;
        border-top:9px solid ${color};opacity:${ghost ? 0.6 : 1}"></div>
    </div>`,
    iconSize: [22, 34],
    iconAnchor: [11, 34],
  })
}

function MapClickHandler({ addMode, hasGhost, onMapClick, onClose }) {
  useMapEvents({
    click(e) {
      onClose()
      if (addMode && !hasGhost) onMapClick(e.latlng)
    },
  })
  return null
}

export default function MapViewer({
  mapa, points, isDM, db, currentPlayer,
  onNavigateToMap, onEditMap, onAddPoint,
  breadcrumb, onBreadcrumbClick,
}) {
  const { openForm } = useApp()
  const [popup, setPopup] = useState(null)
  const [addMode, setAddMode] = useState(false)
  const [ghostPos, setGhostPos] = useState(null)
  const ghostRef = useRef(null)
  const [imgSize, setImgSize] = useState({ w: 1000, h: 1000 })
  const [boundsReady, setBoundsReady] = useState(false)
  const mapKey = useRef(0)

  useEffect(() => {
    setBoundsReady(false)
    if (!mapa.imagen_url) {
      setImgSize({ w: 1000, h: 1000 })
      setBoundsReady(true)
      return
    }
    const img = new window.Image()
    img.onload = () => {
      const { naturalWidth: nw, naturalHeight: nh } = img
      const w = nw >= nh ? 1000 : Math.round(nw / nh * 1000)
      const h = nh >= nw ? 1000 : Math.round(nh / nw * 1000)
      setImgSize({ w, h })
      mapKey.current += 1
      setBoundsReady(true)
    }
    img.onerror = () => { setImgSize({ w: 1000, h: 1000 }); setBoundsReady(true) }
    img.src = mapa.imagen_url
  }, [mapa.imagen_url])

  const mapBounds = [[0, 0], [imgSize.h, imgSize.w]]
  const toLeaflet = (x, y) => [(1 - y) * imgSize.h, x * imgSize.w]
  const fromLeaflet = (latlng) => ({ x: latlng.lng / imgSize.w, y: 1 - latlng.lat / imgSize.h })

  function handleMapClick(latlng) {
    setGhostPos(latlng)
  }

  function handleGhostDragEnd() {
    if (ghostRef.current) setGhostPos(ghostRef.current.getLatLng())
  }

  function handleConfirmGhost() {
    const finalLatlng = ghostRef.current ? ghostRef.current.getLatLng() : ghostPos
    const { x, y } = fromLeaflet(finalLatlng)
    openForm('map_points', null, { map_id: mapa.id, x, y })
    setGhostPos(null)
    setAddMode(false)
  }

  function handleCancelGhost() {
    setGhostPos(null)
  }

  function toggleAddMode() {
    setAddMode(m => !m)
    setGhostPos(null)
    setPopup(null)
  }

  function pinOpacity(pt) {
    if (pt.estado === 'borrador') return isDM ? 0.4 : null
    if (pt.estado === 'secreto') {
      if (isDM) return 0.4
      if (currentPlayer && pt.visibilidad?.includes(currentPlayer.id)) return 1
      return null
    }
    return 1
  }

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      {boundsReady && <MapContainer
        key={mapKey.current}
        crs={L.CRS.Simple}
        bounds={mapBounds}
        style={{ height: '100%', width: '100%', background: '#0a0a0a', cursor: addMode && !ghostPos ? 'crosshair' : 'grab' }}
        zoomSnap={0.25}
        minZoom={-3}
        maxZoom={4}
        attributionControl={false}
        className='z-[100]'
      >
        <ImageOverlay url={mapa.imagen_url} bounds={mapBounds} />
        <MapClickHandler addMode={addMode} hasGhost={!!ghostPos} onMapClick={handleMapClick} onClose={() => setPopup(null)} />

        {points.map(pt => {
          const opacity = pinOpacity(pt)
          if (opacity === null) return null

          const color = PIN_COLORS[pt.link_type] ?? PIN_DEFAULT
          return (
            <Marker
              key={pt.id}
              position={toLeaflet(pt.x, pt.y)}
              icon={pinIcon(color)}
              opacity={opacity}
              eventHandlers={{
                click: (e) => {
                  e.originalEvent?.stopPropagation()
                  setPopup({ x: e.containerPoint.x, y: e.containerPoint.y, point: pt })
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -34]} opacity={0.9}>{pt.nombre}</Tooltip>
            </Marker>
          )
        })}

        {ghostPos && (
          <Marker
            position={ghostPos}
            icon={pinIcon(PIN_DEFAULT, true)}
            draggable={true}
            ref={ghostRef}
            eventHandlers={{ dragend: handleGhostDragEnd }}
          />
        )}
      </MapContainer>}

      {popup && (
        <div
          style={{
            position: 'absolute',
            left: popup.x,
            top: popup.y,
            transform: 'translate(-50%, calc(-100% - 36px))',
            zIndex: 1000,
            pointerEvents: 'none',
          }}
        >
          <MapPopup
            point={popup.point}
            db={db}
            isDM={isDM}
            onNavigateToMap={onNavigateToMap}
            onEditPoint={() => { openForm('map_points', popup.point.id); setPopup(null) }}
            onClose={() => setPopup(null)}
          />
        </div>
      )}

      {breadcrumb.length > 0 && (
        <div style={{
          position: 'absolute', top: 10, left: 50, zIndex: 900,
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'rgba(0,0,0,0.75)', border: '1px solid #333',
          borderRadius: 4, padding: '3px 8px', backdropFilter: 'blur(4px)',
        }}>
          {breadcrumb.map((entry, i) => (
            <span key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {i > 0 && <span style={{ color: '#555', fontSize: 11 }}>›</span>}
              <button
                style={{
                  fontSize: 11, color: i === breadcrumb.length - 1 ? '#fff' : '#888',
                  background: 'none', border: 'none', cursor: i < breadcrumb.length - 1 ? 'pointer' : 'default',
                  fontFamily: 'monospace',
                }}
                onClick={() => i < breadcrumb.length - 1 && onBreadcrumbClick(i)}
              >
                {i === 0 ? '🗺 ' : ''}{entry.nombre}
              </button>
            </span>
          ))}
        </div>
      )}

      {ghostPos && (
        <div style={{
          position: 'absolute', bottom: 64, left: '50%', transform: 'translateX(-50%)',
          zIndex: 1000, background: 'rgba(0,0,0,0.85)', border: '1px solid #444',
          borderRadius: 6, padding: '6px 12px', display: 'flex', gap: 8, alignItems: 'center',
        }}>
          <span style={{ fontSize: 11, color: '#aaa', fontFamily: 'monospace' }}>
            Arrastrar para mover
          </span>
          <button className={btnPrimary} style={{ fontSize: 11, padding: '4px 10px' }} onClick={handleConfirmGhost}>
            Confirmar posición
          </button>
          <button className={btnSecondary} style={{ fontSize: 11, padding: '4px 8px' }} onClick={handleCancelGhost}>
            Cancelar
          </button>
        </div>
      )}

      {isDM && (
        <div style={{
          position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
          zIndex: 900, background: 'rgba(0,0,0,0.82)', border: '1px solid #333',
          borderRadius: 6, padding: '5px 10px', display: 'flex', gap: 8, alignItems: 'center',
          backdropFilter: 'blur(4px)',
        }}>
          <span style={{ fontSize: 10, color: '#555', fontFamily: 'monospace', marginRight: 2 }}>DM</span>
          <div style={{ width: 1, height: 14, background: '#333' }} />
          <button
            className={addMode ? btnPrimary : btnSecondary}
            style={{ fontSize: 11, padding: '3px 9px' }}
            onClick={toggleAddMode}
          >
            {addMode ? '× Cancelar' : '+ Agregar punto'}
          </button>
          <button className={btnSecondary} style={{ fontSize: 11, padding: '3px 9px' }} onClick={onEditMap}>
            ⚙ Editar mapa
          </button>
        </div>
      )}
    </div>
  )
}
