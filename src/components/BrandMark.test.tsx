import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BrandMark } from './BrandMark'

describe('BrandMark', () => {
  it('is decorative by default', () => {
    const { container } = render(<BrandMark />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(svg?.getAttribute('role')).toBeNull()
  })

  it('exposes an accessible name when a title is given', () => {
    const { getByRole } = render(<BrandMark title="RPG Quester" size={24} />)
    const svg = getByRole('img', { name: 'RPG Quester' })
    expect(svg.getAttribute('aria-hidden')).toBeNull()
    expect(svg.getAttribute('width')).toBe('24')
  })

  it('gives every instance its own gradient id', () => {
    const { container } = render(
      <>
        <BrandMark />
        <BrandMark />
      </>,
    )
    const ids = [...container.querySelectorAll('linearGradient')].map((g) => g.id)
    expect(new Set(ids).size).toBe(2)
  })
})
