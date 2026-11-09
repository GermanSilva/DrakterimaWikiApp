import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ScrollStrip from './ScrollStrip'

const LEFT = 'Desplazar a la izquierda'
const RIGHT = 'Desplazar a la derecha'

let resizeCallbacks: (() => void)[] = []
class FakeResizeObserver {
  constructor(cb: () => void) {
    resizeCallbacks.push(cb)
  }
  observe() {}
  disconnect() {}
  unobserve() {}
}
vi.stubGlobal('ResizeObserver', FakeResizeObserver)
afterEach(() => {
  resizeCallbacks = []
})

function setup(active = 'a') {
  const view = render(
    <ScrollStrip activeKey={active}>
      <button type="button" data-active={active === 'a' ? 'true' : undefined}>A</button>
      <button type="button" data-active={active === 'b' ? 'true' : undefined}>B</button>
    </ScrollStrip>,
  )
  const strip = screen.getByTestId('scroll-strip')
  const scrollBy = vi.fn()
  strip.scrollBy = scrollBy as unknown as typeof strip.scrollBy
  const measure = (scrollWidth: number, clientWidth: number, scrollLeft: number) => {
    Object.defineProperty(strip, 'scrollWidth', { configurable: true, value: scrollWidth })
    Object.defineProperty(strip, 'clientWidth', { configurable: true, value: clientWidth })
    Object.defineProperty(strip, 'scrollLeft', { configurable: true, value: scrollLeft })
    fireEvent.scroll(strip)
  }
  return { ...view, strip, scrollBy, measure }
}

describe('ScrollStrip', () => {
  it('shows no chevron when everything fits', () => {
    const { measure } = setup()
    measure(300, 300, 0)
    expect(screen.queryByRole('button', { name: LEFT })).toBeNull()
    expect(screen.queryByRole('button', { name: RIGHT })).toBeNull()
  })

  it('shows only the right chevron at the start', () => {
    const { measure } = setup()
    measure(900, 300, 0)
    expect(screen.queryByRole('button', { name: LEFT })).toBeNull()
    expect(screen.getByRole('button', { name: RIGHT })).toBeInTheDocument()
  })

  it('shows both chevrons in the middle', () => {
    const { measure } = setup()
    measure(900, 300, 200)
    expect(screen.getByRole('button', { name: LEFT })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: RIGHT })).toBeInTheDocument()
  })

  it('shows only the left chevron at the end', () => {
    const { measure } = setup()
    measure(900, 300, 600)
    expect(screen.getByRole('button', { name: LEFT })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: RIGHT })).toBeNull()
  })

  it('recomputes on resize', () => {
    const { measure } = setup()
    measure(300, 300, 0)
    Object.defineProperty(screen.getByTestId('scroll-strip'), 'scrollWidth', { configurable: true, value: 900 })
    act(() => resizeCallbacks.forEach((cb) => cb()))
    expect(screen.getByRole('button', { name: RIGHT })).toBeInTheDocument()
  })

  it('scrolls smoothly by about one visible width when a chevron is clicked', () => {
    const { measure, scrollBy } = setup()
    measure(900, 300, 300)
    fireEvent.click(screen.getByRole('button', { name: RIGHT }))
    expect(scrollBy).toHaveBeenLastCalledWith({ left: 270, behavior: 'smooth' })
    fireEvent.click(screen.getByRole('button', { name: LEFT }))
    expect(scrollBy).toHaveBeenLastCalledWith({ left: -270, behavior: 'smooth' })
  })

  it('scrolls the active item into view when the active key changes', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const { rerender } = setup('a')
    expect(scrollIntoView).not.toHaveBeenCalled()
    rerender(
      <ScrollStrip activeKey="b">
        <button type="button">A</button>
        <button type="button" data-active="true">B</button>
      </ScrollStrip>,
    )
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.instances[0]).toBe(screen.getByRole('button', { name: 'B' }))
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  })

  it('hides the native scrollbar', () => {
    setup()
    expect(screen.getByTestId('scroll-strip').className).toContain('[&::-webkit-scrollbar]:hidden')
  })
})
