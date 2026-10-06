import { render, screen, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import useStickyTitle, { HEADER_H } from './useStickyTitle'

let instances
let disconnects

class MockIntersectionObserver {
  constructor(callback, options) {
    this.callback = callback
    this.options = options
    this.observed = []
    instances.push(this)
  }
  observe(el) { this.observed.push(el) }
  disconnect() { disconnects += 1 }
}

function Probe() {
  const { backBarRef, nameRef, showNameInHeader } = useStickyTitle()
  return (
    <div>
      <div ref={backBarRef} data-testid="bar">bar</div>
      <h1 ref={nameRef}>Title</h1>
      <span data-testid="flag">{String(showNameInHeader)}</span>
    </div>
  )
}

describe('useStickyTitle', () => {
  beforeEach(() => {
    instances = []
    disconnects = 0
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('observes the title with a root margin that accounts for header and back bar', () => {
    render(<Probe />)
    expect(instances).toHaveLength(1)
    const [obs] = instances
    expect(obs.observed[0]).toBe(screen.getByText('Title'))
    // jsdom has no layout, so offsetHeight is 0
    expect(obs.options).toEqual({ threshold: 0, rootMargin: `-${HEADER_H}px 0px 0px 0px` })
  })

  it('shows the name in the header only while the title is out of view', () => {
    render(<Probe />)
    const [obs] = instances
    expect(screen.getByTestId('flag')).toHaveTextContent('false')
    act(() => obs.callback([{ isIntersecting: false }]))
    expect(screen.getByTestId('flag')).toHaveTextContent('true')
    act(() => obs.callback([{ isIntersecting: true }]))
    expect(screen.getByTestId('flag')).toHaveTextContent('false')
  })

  it('disconnects the observer on unmount', () => {
    const { unmount } = render(<Probe />)
    unmount()
    expect(disconnects).toBe(1)
  })
})
