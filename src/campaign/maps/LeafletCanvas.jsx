import 'leaflet/dist/leaflet.css'
import './LeafletCanvas.css'
import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import { ImageOverlay, MapContainer, Marker, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { fromLeaflet, PIN_DEFAULT_COLOR, toLeaflet } from './mapGeometry'

/**
 * The only module that imports Leaflet / react-leaflet (and its stylesheet): the maps page loads it with
 * `lazy()`, so neither ends up in the entry chunk. Presentational: it draws what it is given and reports
 * clicks in NORMALISED image coordinates; the page owns every decision.
 *
 * Pin colours come from a fixed palette (`pinColor`, never from stored text), so the icon markup below
 * cannot carry user input. Names are rendered by React (escaped) in the Tooltip.
 */
function buildPinIcon(color, ghost) {
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

// One icon per colour for the whole session (the palette is fixed and tiny): a stable icon identity means
// react-leaflet never calls setIcon on a re-render, which would replace the marker element and lose its aria-label.
const iconCache = new Map()
function pinIcon(color, ghost = false) {
  const key = `${color}|${ghost}`
  if (!iconCache.has(key)) iconCache.set(key, buildPinIcon(color, ghost))
  return iconCache.get(key)
}

function MapEvents({ size, addMode, hasGhost, onBackgroundClick, onPlace }) {
  useMapEvents({
    click(e) {
      onBackgroundClick()
      if (!addMode || hasGhost) return
      const coords = fromLeaflet(size, e.latlng)
      if (coords) onPlace(coords)
    },
    // the popup is anchored to a screen position: any pan or zoom would leave it floating over nothing
    dragstart: onBackgroundClick,
    zoomstart: onBackgroundClick,
  })
  return null
}

function Pin({ pt, size, onPointClick }) {
  const map = useMap()
  const position = toLeaflet(size, pt.x, pt.y)
  // The keydown listener is attached once, when the marker element is added: it reads the CURRENT point through a
  // ref instead of closing over the first render's position.
  const latest = useRef({ id: pt.id, position, onPointClick })
  useEffect(() => {
    latest.current = { id: pt.id, position, onPointClick }
  })
  const handlers = useMemo(() => {
    // A keyboard activation carries no containerPoint: derive it from the pin's own position.
    const open = (e) => {
      const { id, position: current, onPointClick: report } = latest.current
      const at = e?.containerPoint ?? map.latLngToContainerPoint(current)
      report(id, { x: at.x, y: at.y })
    }
    return {
      add: (e) => {
        const el = e.target.getElement?.()
        if (!el) return
        // keyboard / screen-reader name of the pin (a divIcon has none)
        el.setAttribute('aria-label', pt.nombre)
        // Enter is turned into a click by Leaflet; Space is not
        el.addEventListener('keydown', (ev) => {
          if (ev.key !== ' ' && ev.key !== 'Enter') return
          ev.preventDefault()
          open()
        })
      },
      click: (e) => {
        e.originalEvent?.stopPropagation?.()
        open(e)
      },
    }
  }, [map, pt.nombre])
  return (
    <Marker position={position} icon={pinIcon(pt.color)} opacity={pt.opacity} eventHandlers={handlers}>
      <Tooltip direction="top" offset={[0, -34]} opacity={0.9}>
        {pt.nombre}
      </Tooltip>
    </Marker>
  )
}

export default function LeafletCanvas({ imageUrl, size, points, addMode, ghost, onBackgroundClick, onPlace, onGhostMove, onPointClick }) {
  const bounds = useMemo(() => [[0, 0], [size.h, size.w]], [size.h, size.w])
  return (
    <div className={addMode && !ghost ? 'map-add-mode' : undefined} style={{ height: '100%', width: '100%' }} data-testid="map-canvas-wrapper">
      <MapContainer
        crs={L.CRS.Simple}
        bounds={bounds}
        style={{ height: '100%', width: '100%', background: '#0a0a0a' }}
        zoomSnap={0.25}
        minZoom={-3}
        maxZoom={4}
        attributionControl={false}
        className="z-[100]"
      >
        {imageUrl && <ImageOverlay url={imageUrl} bounds={bounds} />}
        <MapEvents size={size} addMode={addMode} hasGhost={!!ghost} onBackgroundClick={onBackgroundClick} onPlace={onPlace} />
        {points.map((pt) => (
          // name and colour are part of the key: a renamed or re-linked pin is a new marker, because a changed icon
          // makes Leaflet replace the marker element, which would drop the aria-label set on "add"
          <Pin key={`${pt.id}:${pt.nombre}:${pt.color}`} pt={pt} size={size} onPointClick={onPointClick} />
        ))}
        {ghost && (
          <Marker
            position={toLeaflet(size, ghost.x, ghost.y)}
            icon={pinIcon(PIN_DEFAULT_COLOR, true)}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const coords = fromLeaflet(size, e.target.getLatLng())
                if (coords) onGhostMove(coords)
              },
            }}
          />
        )}
      </MapContainer>
    </div>
  )
}
