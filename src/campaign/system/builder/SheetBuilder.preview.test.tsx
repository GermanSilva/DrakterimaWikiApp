import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SheetBuilder } from './SheetBuilder'
import { SMALL } from './builderTestKit'
import { TEST_CHARACTERS } from './formula/workbenchFixture'

const KEY = 'rpgquester:builder-preview-collapsed'
const mount = () => render(<SheetBuilder initial={SMALL} testCharacters={TEST_CHARACTERS} />)
const region = () => screen.getByRole('region', { name: 'Vista previa' })
const toggle = () => within(region()).getByRole('button', { name: /Vista previa/ })
const grid = () => region().parentElement!.parentElement as HTMLElement

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('BuilderPreview collapse', () => {
  it('starts expanded with a labelled toggle that controls the content', () => {
    mount()
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    expect(toggle()).toHaveAttribute('title', 'Colapsar vista previa')
    const body = document.getElementById(toggle().getAttribute('aria-controls')!)!
    expect(body).toBeVisible()
    expect(within(region()).getByLabelText('Personaje de prueba')).toBeVisible()
    expect(grid().className).toContain('220px_minmax(0,1fr)_minmax(0,420px)')
  })

  it('collapses to a rail: content hidden, header kept, editors take the width', () => {
    mount()
    fireEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(toggle()).toHaveAttribute('title', 'Expandir vista previa')
    expect(document.getElementById(toggle().getAttribute('aria-controls')!)).not.toBeVisible()
    expect(grid().className).toContain('220px_minmax(0,1fr)_44px')
    expect(grid().className).not.toContain('420px')
  })

  it('keeps the chosen test character and view mode after collapsing and expanding', () => {
    mount()
    const select = () => within(region()).getByLabelText('Personaje de prueba') as HTMLSelectElement
    const other = Array.from(select().options).map((o) => o.value)[1]
    fireEvent.change(select(), { target: { value: other } })
    fireEvent.click(within(region()).getByRole('button', { name: 'Jugador' }))
    fireEvent.click(toggle())
    fireEvent.click(toggle())
    expect(select().value).toBe(other)
    expect(within(region()).getByRole('button', { name: 'Jugador' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('remembers the state across remounts', () => {
    mount()
    fireEvent.click(toggle())
    expect(localStorage.getItem(KEY)).toBe('true')
    cleanup()
    mount()
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle())
    expect(localStorage.getItem(KEY)).toBe('false')
    cleanup()
    mount()
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
  })

  it('falls back to expanded when the stored value is invalid', () => {
    localStorage.setItem(KEY, 'quizá')
    mount()
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
  })

  it('works when storage is unavailable (read and write throw)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    mount()
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
  })
})
