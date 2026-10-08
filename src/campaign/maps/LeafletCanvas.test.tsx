import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import LeafletCanvas from './LeafletCanvas'

// react-leaflet needs a real layout engine: light doubles that record what the canvas asks of them
const mapHandlers: Record<string, (e?: unknown) => void> = {}
const divIcon = vi.fn((options: { html: string }) => ({ options }))
const seenIcons: unknown[] = []

vi.mock('leaflet', () => ({ default: { CRS: { Simple: 'simple' }, divIcon: (o: { html: string }) => divIcon(o) } }))
vi.mock('react-leaflet', async () => {
  const { createElement: h, useEffect, useRef } = await import('react')
  return {
    MapContainer: (p: { bounds: unknown; crs: unknown; children: unknown }) =>
      h('div', { 'data-testid': 'map', 'data-bounds': JSON.stringify(p.bounds), 'data-crs': String(p.crs) }, p.children as never),
    ImageOverlay: (p: { url: string; bounds: unknown }) => h('div', { 'data-testid': 'overlay', 'data-url': p.url, 'data-bounds': JSON.stringify(p.bounds) }),
    Tooltip: (p: { children: unknown }) => h('span', null, p.children as never),
    useMap: () => ({ latLngToContainerPoint: ([lat, lng]: [number, number]) => ({ x: lng / 10, y: lat / 10 }) }),
    useMapEvents: (handlers: Record<string, (e?: unknown) => void>) => {
      Object.assign(mapHandlers, handlers)
      return null
    },
    Marker: (p: {
      position: [number, number]
      opacity?: number
      draggable?: boolean
      icon: { options: { html: string } }
      eventHandlers: Record<string, (e: unknown) => void>
      children?: unknown
    }) => {
      const ref = useRef<HTMLDivElement>(null)
      seenIcons.push(p.icon)
      // Leaflet fires "add" once the marker element exists
      useEffect(() => {
        p.eventHandlers.add?.({ target: { getElement: () => ref.current } })
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      // Leaflet replaces the marker element when the icon changes (setIcon): the aria-label set on "add" is lost
      const firstIcon = useRef(p.icon)
      useEffect(() => {
        if (firstIcon.current !== p.icon) ref.current?.removeAttribute('aria-label')
      }, [p.icon])
      return h(
        'div',
        {
          ref,
          tabIndex: 0,
          'data-testid': p.draggable ? 'ghost' : 'pin',
          'data-pos': p.position.join(','),
          'data-opacity': p.opacity,
          'data-html': p.icon.options.html,
          onClick: () => p.eventHandlers.click?.({ containerPoint: { x: 11, y: 22 }, originalEvent: { stopPropagation: vi.fn() } }),
          onDoubleClick: () => p.eventHandlers.dragend?.({ target: { getLatLng: () => ({ lat: 100, lng: 900 }) } }),
        },
        p.children as never,
      )
    },
  }
})

const SIZE = { w: 1000, h: 500 }
const base = () => ({
  imageUrl: 'https://img.test/m.png',
  size: SIZE,
  points: [
    { id: 1, x: 0.25, y: 0.5, nombre: 'Faro', color: '#dc2626', opacity: 1 },
    { id: 2, x: 1, y: 0, nombre: 'Borde', color: '#e5e7eb', opacity: 0.4 },
  ],
  addMode: false,
  ghost: null as { x: number; y: number } | null,
  onBackgroundClick: vi.fn(),
  onPlace: vi.fn(),
  onGhostMove: vi.fn(),
  onPointClick: vi.fn(),
})

beforeEach(() => {
  for (const k of Object.keys(mapHandlers)) delete mapHandlers[k]
  divIcon.mockClear()
  seenIcons.length = 0
})

describe('LeafletCanvas', () => {
  it('lays the image over a CRS.Simple plane of the measured size', () => {
    render(<LeafletCanvas {...base()} />)
    expect(screen.getByTestId('map')).toHaveAttribute('data-crs', 'simple')
    expect(screen.getByTestId('map')).toHaveAttribute('data-bounds', '[[0,0],[500,1000]]')
    expect(screen.getByTestId('overlay')).toHaveAttribute('data-url', 'https://img.test/m.png')
  })

  it('draws no image overlay without an image', () => {
    render(<LeafletCanvas {...base()} imageUrl={null} />)
    expect(screen.queryByTestId('overlay')).toBeNull()
  })

  it('places pins with the flipped y axis, their opacity and palette colour; the name is text in the tooltip', () => {
    render(<LeafletCanvas {...base()} />)
    const pins = screen.getAllByTestId('pin')
    expect(pins.map((p) => p.getAttribute('data-pos'))).toEqual(['250,250', '500,1000'])
    expect(pins[1]).toHaveAttribute('data-opacity', '0.4')
    expect(pins[0].getAttribute('data-html')).toContain('background:#dc2626')
    expect(pins[0]).toHaveTextContent('Faro')
  })

  it('a pin click reports the point id and the container position', () => {
    const props = base()
    render(<LeafletCanvas {...props} />)
    fireEvent.click(screen.getAllByTestId('pin')[1])
    expect(props.onPointClick).toHaveBeenCalledWith(2, { x: 11, y: 22 })
  })

  it('a map click closes the popup, and in add mode places a normalised pin (clamped to the image)', () => {
    const props = { ...base(), addMode: true }
    render(<LeafletCanvas {...props} />)
    mapHandlers.click({ latlng: { lat: 125, lng: 250 } })
    expect(props.onBackgroundClick).toHaveBeenCalledTimes(1)
    expect(props.onPlace).toHaveBeenCalledWith({ x: 0.25, y: 0.75 })
    mapHandlers.click({ latlng: { lat: -50, lng: 2000 } })
    expect(props.onPlace).toHaveBeenLastCalledWith({ x: 1, y: 1 })
    mapHandlers.click({ latlng: { lat: Number.NaN, lng: 5 } })
    expect(props.onPlace).toHaveBeenCalledTimes(2) // a non-finite click places nothing
  })

  it('does not place outside add mode or while a ghost pin exists', () => {
    const idle = base()
    const { unmount } = render(<LeafletCanvas {...idle} />)
    mapHandlers.click({ latlng: { lat: 10, lng: 10 } })
    expect(idle.onPlace).not.toHaveBeenCalled()
    expect(idle.onBackgroundClick).toHaveBeenCalled()
    unmount()
    const withGhost = { ...base(), addMode: true, ghost: { x: 0.1, y: 0.1 } }
    render(<LeafletCanvas {...withGhost} />)
    mapHandlers.click({ latlng: { lat: 10, lng: 10 } })
    expect(withGhost.onPlace).not.toHaveBeenCalled()
  })

  it('panning or zooming closes the popup (it is anchored to a screen position)', () => {
    const props = base()
    render(<LeafletCanvas {...props} />)
    mapHandlers.dragstart()
    mapHandlers.zoomstart()
    expect(props.onBackgroundClick).toHaveBeenCalledTimes(2)
  })

  it('the draggable ghost pin reports its new normalised position', () => {
    const props = { ...base(), addMode: true, ghost: { x: 0.5, y: 0.5 } }
    render(<LeafletCanvas {...props} />)
    const ghost = screen.getByTestId('ghost')
    expect(ghost).toHaveAttribute('data-pos', '250,500')
    fireEvent.doubleClick(ghost) // the double fires dragend at (lat 100, lng 900)
    expect(props.onGhostMove).toHaveBeenCalledWith({ x: 0.9, y: 0.8 })
  })

  it('reuses one icon per colour across re-renders (no setIcon) and keeps the accessible name', () => {
    const props = base()
    const { rerender } = render(<LeafletCanvas {...props} />)
    const pin = () => screen.getAllByTestId('pin')[0]
    expect(pin()).toHaveAttribute('aria-label', 'Faro')
    const firstIcons = seenIcons.slice()
    seenIcons.length = 0
    rerender(<LeafletCanvas {...props} points={props.points.map((p) => ({ ...p }))} />)
    rerender(<LeafletCanvas {...props} points={props.points.map((p) => ({ ...p }))} />)
    // every render handed the markers the SAME icon objects as the first one
    expect(new Set([...firstIcons, ...seenIcons]).size).toBe(2) // two colours, two icons
    expect(pin()).toHaveAttribute('aria-label', 'Faro')
  })

  it('a renamed pin is a new marker with the new accessible name', () => {
    const props = base()
    const { rerender } = render(<LeafletCanvas {...props} />)
    rerender(<LeafletCanvas {...props} points={[{ ...props.points[0], nombre: 'Faro viejo' }, props.points[1]]} />)
    expect(screen.getAllByTestId('pin')[0]).toHaveAttribute('aria-label', 'Faro viejo')
  })

  it('a re-linked pin (new colour) is a new marker, so it keeps its accessible name', () => {
    const props = base()
    const { rerender } = render(<LeafletCanvas {...props} />)
    rerender(<LeafletCanvas {...props} points={[{ ...props.points[0], color: '#22c55e' }, props.points[1]]} />)
    const pin = screen.getAllByTestId('pin')[0]
    expect(pin.getAttribute('data-html')).toContain('background:#22c55e')
    expect(pin).toHaveAttribute('aria-label', 'Faro')
  })

  it('Space on a pin that moved opens it at its current position, not the one it was first drawn at', () => {
    const props = base()
    const { rerender } = render(<LeafletCanvas {...props} />)
    const pin = screen.getAllByTestId('pin')[0]
    // same id / name / colour: the marker element is kept, only its position changes
    rerender(<LeafletCanvas {...props} points={[{ ...props.points[0], x: 0.5, y: 0.1 }, props.points[1]]} />)
    expect(screen.getAllByTestId('pin')[0]).toBe(pin)
    fireEvent.keyDown(pin, { key: ' ' })
    // [lat, lng] = [(1 - 0.1) * 500, 0.5 * 1000] = [450, 500] -> the double maps lat/lng / 10
    expect(props.onPointClick).toHaveBeenLastCalledWith(1, { x: 50, y: 45 })
  })

  it('Space and Enter on a focused pin open it, using the pin position when there is no containerPoint', () => {
    const props = base()
    render(<LeafletCanvas {...props} />)
    const pin = screen.getAllByTestId('pin')[0]
    fireEvent.keyDown(pin, { key: ' ' })
    // pin 1 is at [250, 250] -> the double maps lat/lng / 10
    expect(props.onPointClick).toHaveBeenLastCalledWith(1, { x: 25, y: 25 })
    fireEvent.keyDown(pin, { key: 'Enter' })
    expect(props.onPointClick).toHaveBeenCalledTimes(2)
    fireEvent.keyDown(pin, { key: 'a' })
    expect(props.onPointClick).toHaveBeenCalledTimes(2)
  })

  it('toggles the crosshair class only while adding and no ghost pin exists', () => {
    const props = base()
    const { rerender } = render(<LeafletCanvas {...props} />)
    const wrapper = () => screen.getByTestId('map-canvas-wrapper')
    expect(wrapper()).not.toHaveClass('map-add-mode')
    rerender(<LeafletCanvas {...props} addMode />)
    expect(wrapper()).toHaveClass('map-add-mode')
    rerender(<LeafletCanvas {...props} addMode ghost={{ x: 0.5, y: 0.5 }} />)
    expect(wrapper()).not.toHaveClass('map-add-mode')
    cleanup()
  })
})
