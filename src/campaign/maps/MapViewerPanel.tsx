import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { btnPrimary, btnSecondary } from '../../constants'
import type { FlatEntity } from '../../data'
import { useWikiPort } from '../../ports'
import { parseHttpsUrl } from '../branding'
import { useCampaign } from '../CampaignContext'
import { useDmNotes } from '../entities/useDmNotes'
import { useEntityForm } from '../entityFormContext'
import { DmBlock } from '../sections/EntityUi'
import { DmNotice } from '../sections/DmNotice'
import { str } from '../sections/format'
import { clamp01, hasValidCoords, LINK_LETTER, pinColor, pinOpacity, type MapCoords } from './mapGeometry'
import { MapPopup, type PopupLink } from './MapPopup'
import { useImageSize } from './useImageSize'

// Leaflet (and its CSS) live ONLY behind this import: the entry chunk and the rest of the hub never load it.
const LeafletCanvas = lazy(() => import('./LeafletCanvas'))

export interface Crumb {
  id: number
  nombre: string
  to: string
}

export interface MapViewerPanelProps {
  map: FlatEntity
  points: FlatEntity[]
  /** The points list failed to load (the map itself is shown without pins). */
  pointsError: boolean
  onRetryPoints: () => void
  /** Maps the viewer can see (targets of `mapa` links). */
  maps: FlatEntity[]
  /** Ancestors the viewer came through, oldest first (current map not included). */
  crumbs: Crumb[]
  allMapsTo: string
  onOpenMap: (mapId: number) => void
  onMapRemoved: () => void
}

const overlayBtn = { fontSize: 11, padding: '3px 9px' } as const

function DmMapNotes({ mapId, version }: { mapId: number; version: string | undefined }) {
  const notes = useDmNotes('mapas', mapId, version)
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 bottom-16 z-[900] w-[min(360px,90%)] max-h-48 overflow-y-auto bg-black/85 border border-[#333] rounded-md p-3"
      data-testid="map-dm-notes"
    >
      {notes.status === 'error' ? (
        <DmNotice onRetry={notes.refresh}>No pudimos cargar las notas del mapa.</DmNotice>
      ) : notes.status === 'loading' ? (
        <p role="status" className="text-xs text-txt-muted">
          Cargando…
        </p>
      ) : notes.fields.notas ? (
        <DmBlock title="Notas internas" text={notes.fields.notas} />
      ) : (
        <p className="text-xs text-txt-muted">Este mapa no tiene notas internas.</p>
      )}
    </div>
  )
}

/**
 * The map viewer of the hub: image-size detection, breadcrumb, pins, popup and the DM toolbar around the lazy
 * Leaflet canvas. Pins come from the (RLS-filtered) points list of THIS map; the only state kept here is
 * transient UI (popup, add mode, ghost pin). Navigation lives in the URL (the page owns it).
 */
export function MapViewerPanel({ map, points, pointsError, onRetryPoints, maps, crumbs, allMapsTo, onOpenMap, onMapRemoved }: MapViewerPanelProps) {
  const wiki = useWikiPort()
  const { openForm } = useEntityForm()
  const { isDM } = useCampaign()
  const [popup, setPopup] = useState<{ x: number; y: number; pointId: number } | null>(null)
  const [addMode, setAddMode] = useState(false)
  const [ghost, setGhost] = useState<MapCoords | null>(null)
  const [notesOpen, setNotesOpen] = useState(false)

  const imageUrl = parseHttpsUrl(map.imagen_url)
  const hasImageText = str(map.imagen_url) !== ''
  const imageSize = useImageSize(imageUrl)

  const drawn = useMemo(
    () =>
      points.flatMap((pt) => {
        const opacity = pinOpacity(pt.estado, isDM)
        if (opacity === null || !hasValidCoords(pt)) return []
        return [{ id: pt.id, x: pt.x, y: pt.y, nombre: str(pt.nombre), color: pinColor(pt.link_type), opacity }]
      }),
    [points, isDM],
  )

  const popupPoint = popup ? (points.find((p) => p.id === popup.pointId) ?? null) : null
  const closePopup = useCallback(() => setPopup(null), [])
  const openPopup = useCallback((pointId: number, at: { x: number; y: number }) => setPopup({ pointId, ...at }), [])

  // Escape: popup first, then the ghost pin, then add mode. While a modal (the point form) is open, Escape belongs
  // to it: cancelling the form must return to the confirm step with the ghost pin still in place.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (document.querySelector('[aria-modal="true"]')) return
      if (popup) setPopup(null)
      else if (ghost) setGhost(null)
      else if (addMode) setAddMode(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [popup, ghost, addMode])

  const link = useMemo<PopupLink | null>(() => {
    if (!popupPoint) return null
    const type = str(popupPoint.link_type)
    const id = popupPoint.link_id
    if (!type || typeof id !== 'number' || !Number.isInteger(id)) return null
    if (type === 'mapa') {
      const target = maps.find((m) => m.id === id)
      if (!target) return { kind: 'missing' }
      if (target.id === map.id) return null // a pin that points at its own map has nowhere to go
      return {
        kind: 'map',
        title: str(target.nombre),
        onOpen: () => {
          setPopup(null)
          onOpenMap(target.id)
        },
      }
    }
    const letter = Object.prototype.hasOwnProperty.call(LINK_LETTER, type) ? LINK_LETTER[type] : undefined
    if (!letter) return null
    const target = wiki.resolve(letter, id)
    if (!target) return wiki.pending(letter) ? { kind: 'pending' } : { kind: 'missing' }
    return {
      kind: 'article',
      section: target.section,
      title: target.title,
      imageUrl: target.imagenUrl ?? null,
      onOpen: () => {
        setPopup(null)
        wiki.navigate(target.table, id)
      },
    }
  }, [popupPoint, maps, map.id, wiki, onOpenMap])

  /** The ghost pin only ever holds finite coordinates inside the image (the database rejects anything else). */
  function placeGhost(coords: MapCoords) {
    setGhost(Number.isFinite(coords.x) && Number.isFinite(coords.y) ? { x: clamp01(coords.x), y: clamp01(coords.y) } : null)
  }

  function toggleAddMode() {
    setAddMode((m) => !m)
    setGhost(null)
    setPopup(null)
  }

  // The ghost pin stays while the point form is open: cancelling the form returns to the confirm step at the same
  // position; only a successful save ends the placement.
  function confirmGhost() {
    if (!ghost) return
    openForm({
      type: 'map_points',
      prefill: { map_id: map.id, x: ghost.x, y: ghost.y },
      onSaved: () => {
        setGhost(null)
        setAddMode(false)
      },
    })
  }

  const imageNote =
    imageSize.ready && imageSize.failed && imageUrl
      ? 'No se pudo cargar la imagen del mapa.'
      : hasImageText && !imageUrl
        ? 'La imagen del mapa debe ser una URL https. Se muestra sin fondo.'
        : null

  return (
    <div className="relative w-full overflow-hidden -my-8" style={{ height: 'calc(100vh - 60px)' }} data-testid="map-viewer">
      {imageSize.ready ? (
        <Suspense
          fallback={
            <p role="status" className="p-5 text-sm text-txt-muted">
              Cargando mapa…
            </p>
          }
        >
          <LeafletCanvas
            key={`${map.id}:${imageUrl ?? ''}:${imageSize.size.w}x${imageSize.size.h}`}
            imageUrl={imageUrl}
            size={imageSize.size}
            points={drawn}
            addMode={addMode}
            ghost={ghost}
            onBackgroundClick={closePopup}
            onPlace={placeGhost}
            onGhostMove={placeGhost}
            onPointClick={openPopup}
          />
        </Suspense>
      ) : (
        <p role="status" className="p-5 text-sm text-txt-muted">
          Cargando mapa…
        </p>
      )}

      {popup && popupPoint && (
        <div
          style={{ position: 'absolute', left: popup.x, top: popup.y, transform: 'translate(-50%, calc(-100% - 36px))', zIndex: 1000, pointerEvents: 'none' }}
        >
          <MapPopup
            point={popupPoint}
            link={link}
            isDM={isDM}
            onEdit={() => {
              setPopup(null)
              openForm({ type: 'map_points', id: popupPoint.id })
            }}
            onClose={closePopup}
          />
        </div>
      )}

      <nav
        aria-label="Ruta de mapas"
        className="absolute top-2.5 left-12 z-[900] flex flex-wrap items-center gap-1 bg-black/75 border border-[#333] rounded px-2 py-[3px] backdrop-blur-sm max-w-[calc(100%-200px)]"
      >
        {crumbs.map((c) => (
          <span key={c.id} className="flex items-center gap-1">
            <Link to={c.to} className="text-[11px] font-mono text-[#aaa] hover:text-white">
              {c.nombre || `Mapa #${c.id}`}
            </Link>
            <span aria-hidden="true" className="text-[11px] text-[#555]">
              ›
            </span>
          </span>
        ))}
        <span aria-current="page" className="text-[11px] font-mono text-white">
          {crumbs.length === 0 && <span aria-hidden="true">🗺 </span>}
          {str(map.nombre) || `Mapa #${map.id}`}
        </span>
      </nav>

      <Link to={allMapsTo} className={`${btnSecondary} absolute top-2.5 right-2.5 z-[900]`} style={{ fontSize: 11 }}>
        ← Todos los mapas
      </Link>

      {imageNote && (
        <p role="status" className="absolute top-12 left-12 z-[900] bg-black/80 border border-[#333] rounded px-3 py-1.5 text-xs text-txt-secondary">
          {imageNote}
        </p>
      )}

      {pointsError && (
        <p role="alert" className="absolute top-24 left-12 z-[900] bg-black/80 border border-[#333] rounded px-3 py-1.5 text-xs text-txt-secondary">
          No pudimos cargar los puntos del mapa.{' '}
          <button type="button" className={btnSecondary} style={{ fontSize: 11, padding: '2px 8px' }} onClick={onRetryPoints}>
            Reintentar
          </button>
        </p>
      )}

      {ghost && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-[1000] bg-black/85 border border-[#444] rounded-md px-3 py-1.5 flex gap-2 items-center">
          <span className="text-[11px] text-[#aaa] font-mono">Arrastrar para mover</span>
          <button type="button" className={btnPrimary} style={{ fontSize: 11, padding: '4px 10px' }} onClick={confirmGhost}>
            Confirmar posición
          </button>
          <button type="button" className={btnSecondary} style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setGhost(null)}>
            Cancelar
          </button>
        </div>
      )}

      {isDM && (
        <>
          {notesOpen && <DmMapNotes mapId={map.id} version={map.updated_at} />}
          <div
            role="toolbar"
            aria-label="Herramientas del DM"
            className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[900] bg-black/80 border border-[#333] rounded-md px-2.5 py-[5px] flex gap-2 items-center backdrop-blur-sm"
          >
            <span className="text-[10px] text-[#777] font-mono mr-0.5">DM</span>
            <div aria-hidden="true" className="w-px h-3.5 bg-[#333]" />
            <button type="button" aria-pressed={addMode} className={addMode ? btnPrimary : btnSecondary} style={overlayBtn} onClick={toggleAddMode}>
              {addMode ? '× Cancelar' : '+ Agregar punto'}
            </button>
            <button type="button" className={btnSecondary} style={overlayBtn} onClick={() => openForm({ type: 'mapas', id: map.id, onRemoved: onMapRemoved })}>
              ⚙ Editar mapa
            </button>
            <button type="button" aria-pressed={notesOpen} className={btnSecondary} style={overlayBtn} onClick={() => setNotesOpen((o) => !o)}>
              Notas
            </button>
          </div>
        </>
      )}
    </div>
  )
}
