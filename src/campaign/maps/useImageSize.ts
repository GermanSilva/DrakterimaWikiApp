import { useEffect, useState } from 'react'
import { DEFAULT_MAP_SIZE, fitImageSize, type MapSize } from './mapGeometry'

export type ImageSizeState = { ready: false } | { ready: true; size: MapSize; failed: boolean }

/** A slow or silent host must not leave the map on "Cargando mapa…" forever. */
export const IMAGE_LOAD_TIMEOUT_MS = 15_000

/**
 * Plane for an image that LOADED but reports no intrinsic size (an SVG without width / height reports 0 x 0).
 * Its real aspect ratio is unknowable here, so it gets a neutral landscape 4:3 plane instead of a NaN / zero
 * one; Leaflet stretches the image over the plane, so such an image may look distorted. The pins stay correct
 * relative to the image because both live in normalised coordinates.
 */
export const UNKNOWN_SIZE_MAP: MapSize = { w: 1000, h: 750 }

interface Settled {
  url: string
  size: MapSize
  failed: boolean
}

/**
 * Natural size of the map image, as the plane size Leaflet needs BEFORE the map mounts (the aspect ratio of
 * the real image is preserved). Without an image the plane is a square, immediately. A load error or a
 * timeout settles to the square too (`failed`) so the pins stay usable. The result is tied to the URL it was
 * measured for: a stale answer for a previous URL is never reported as ready. Cleanup aborts the download.
 */
export function useImageSize(url: string | null): ImageSizeState {
  const [settled, setSettled] = useState<Settled | null>(null)

  useEffect(() => {
    if (!url) return undefined
    const img = new window.Image()
    const timer = setTimeout(() => setSettled({ url, size: DEFAULT_MAP_SIZE, failed: true }), IMAGE_LOAD_TIMEOUT_MS)
    img.onload = () => {
      clearTimeout(timer)
      const unknown = !(img.naturalWidth > 0 && img.naturalHeight > 0)
      setSettled({ url, size: unknown ? UNKNOWN_SIZE_MAP : fitImageSize(img.naturalWidth, img.naturalHeight), failed: false })
    }
    img.onerror = () => {
      clearTimeout(timer)
      setSettled({ url, size: DEFAULT_MAP_SIZE, failed: true })
    }
    img.src = url
    return () => {
      clearTimeout(timer)
      img.onload = null
      img.onerror = null
      img.src = '' // abort the download
    }
  }, [url])

  if (!url) return { ready: true, size: DEFAULT_MAP_SIZE, failed: false }
  if (settled?.url !== url) return { ready: false }
  return { ready: true, size: settled.size, failed: settled.failed }
}
