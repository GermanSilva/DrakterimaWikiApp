/**
 * Pure helpers of the maps section: image-space geometry, pin styling and the URL breadcrumb trail.
 * No React, no Leaflet: everything here is unit tested without a DOM.
 */

/** Size of the Leaflet CRS.Simple plane (the longer side is always 1000 units). */
export interface MapSize {
  w: number
  h: number
}

export const DEFAULT_MAP_SIZE: MapSize = { w: 1000, h: 1000 }

/** Normalised position on the image: 0..1 from the left (x) and from the top (y). */
export interface MapCoords {
  x: number
  y: number
}

/** The latitude / longitude pair Leaflet hands to event handlers (CRS.Simple: lat grows upwards). */
export interface LatLngLike {
  lat: number
  lng: number
}

/**
 * Plane size for an image of `naturalWidth` x `naturalHeight` pixels: the aspect ratio is preserved and
 * the longer side is 1000 units. A degenerate size (0, NaN, Infinity, negative) falls back to a square.
 */
export function fitImageSize(naturalWidth: number, naturalHeight: number): MapSize {
  if (!Number.isFinite(naturalWidth) || !Number.isFinite(naturalHeight) || naturalWidth <= 0 || naturalHeight <= 0) return DEFAULT_MAP_SIZE
  const w = naturalWidth >= naturalHeight ? 1000 : Math.max(1, Math.round((naturalWidth / naturalHeight) * 1000))
  const h = naturalHeight >= naturalWidth ? 1000 : Math.max(1, Math.round((naturalHeight / naturalWidth) * 1000))
  return { w, h }
}

export const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))

/** `[lat, lng]` of a normalised position. The y axis is flipped (Leaflet's origin is the bottom-left corner). */
export function toLeaflet(size: MapSize, x: number, y: number): [number, number] {
  return [(1 - y) * size.h, x * size.w]
}

/**
 * Normalised position of a Leaflet point, clamped to the image (a click on the dark margin around the image
 * lands on its edge: the database rejects coordinates outside 0..1). `null` when the point is not finite.
 */
export function fromLeaflet(size: MapSize, latlng: LatLngLike): MapCoords | null {
  const x = latlng.lng / size.w
  const y = 1 - latlng.lat / size.h
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x: clamp01(x), y: clamp01(y) }
}

/** True when a stored point has coordinates we can draw (imported data may carry NaN, null or text). */
export const hasValidCoords = (p: Record<string, unknown>): p is Record<string, unknown> & { x: number; y: number } =>
  typeof p.x === 'number' && typeof p.y === 'number' && Number.isFinite(p.x) && Number.isFinite(p.y)

export const PIN_COLORS: Record<string, string> = {
  lugar: '#dc2626',
  pnj: '#22c55e',
  faccion: '#f59e0b',
  lore: '#3b82f6',
  item: '#06b6d4',
  sesion: '#6b7280',
  mapa: '#eab308',
}
export const PIN_DEFAULT_COLOR = '#e5e7eb'

/** Own-property lookup: a link_type of `constructor` / `__proto__` never yields a non-colour. */
export function pinColor(linkType: unknown): string {
  return typeof linkType === 'string' && Object.prototype.hasOwnProperty.call(PIN_COLORS, linkType) ? PIN_COLORS[linkType] : PIN_DEFAULT_COLOR
}

/**
 * Pin opacity, or `null` when the pin is not drawn. Players only ever receive what RLS lets them see and
 * the database hides `visible_to` from them, so a received `secreto` pin is by definition shared with them.
 * A draft is never drawn for a player even if one slipped through (defense in depth).
 */
export function pinOpacity(estado: unknown, isDM: boolean): number | null {
  if (estado === 'borrador') return isDM ? 0.4 : null
  if (estado === 'secreto') return isDM ? 0.4 : 1
  return 1
}

/** Wiki-link letter of every point `link_type` that targets a wiki article (maps are handled by the page). */
export const LINK_LETTER: Record<string, string> = { lugar: 'G', pnj: 'N', faccion: 'F', lore: 'L', item: 'I', sesion: 'S', mapa: 'M' }

/** Longest breadcrumb trail kept in a URL. */
export const MAX_TRAIL = 10

const ID_RE = /^[0-9]{1,15}$/

/**
 * `?trail=3,7` -> `[3, 7]`: the maps the viewer came through, oldest first, WITHOUT the current one.
 * Strict: a single malformed entry invalidates the whole value (a hand-edited URL shows no trail instead of a
 * half-guessed one); duplicates keep their first position; at most MAX_TRAIL (the most recent) survive.
 */
export function parseTrail(raw: string | null | undefined): number[] {
  if (!raw) return []
  const ids: number[] = []
  for (const part of raw.split(',')) {
    if (!ID_RE.test(part)) return []
    const n = Number(part)
    if (n <= 0) return []
    if (!ids.includes(n)) ids.push(n)
  }
  return ids.slice(-MAX_TRAIL)
}

/** `/c/:slug/mapas/:id[?trail=...]` */
export function mapPath(slug: string, mapId: number, trail: readonly number[] = []): string {
  const base = `/c/${encodeURIComponent(slug)}/mapas/${mapId}`
  return trail.length > 0 ? `${base}?trail=${trail.join(',')}` : base
}

/** The grid of all maps; `todos=1` stops the "open the default map" redirect. */
export const mapsGridPath = (slug: string): string => `/c/${encodeURIComponent(slug)}/mapas?todos=1`

/**
 * Trail for opening `targetId` from `currentId`. Opening a map already in the way goes back to it (no cycles);
 * opening the current map is a no-op (`null`).
 */
export function trailForOpening(trail: readonly number[], currentId: number, targetId: number): number[] | null {
  if (targetId === currentId) return null
  const way = [...trail, currentId]
  const at = way.indexOf(targetId)
  return (at >= 0 ? way.slice(0, at) : way).slice(-MAX_TRAIL)
}
