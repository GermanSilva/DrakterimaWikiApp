import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WikiPortContext } from '../ports'
import WikiText from './WikiText'

const TARGET = { title: 'Torre de Vigía', section: 'Lugar', imagenUrl: null, table: 'lugares' }

function makePort(overrides = {}) {
  return {
    pending: () => false,
    resolve: (letter, id) => (letter === 'L' && id === 7 ? TARGET : null),
    navigate: vi.fn(),
    search: () => [],
    ...overrides,
  }
}

function renderText(text, port = makePort()) {
  return render(
    <WikiPortContext.Provider value={port}>
      <WikiText text={text} />
    </WikiPortContext.Provider>,
  )
}

describe('WikiText article links (behaviour kept)', () => {
  it('renders nothing for empty text', () => {
    const { container } = renderText('')
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a resolved link with its display text, and navigates on click', () => {
    const port = makePort()
    renderText('Ver [[{7L}la torre]] ahora', port)
    const link = screen.getByText('la torre')
    expect(link.className).toContain('text-accent-bright')
    link.click()
    expect(port.navigate).toHaveBeenCalledWith('lugares', 7)
  })

  it('renders an unresolved link as dashed muted text with the not-found title', () => {
    renderText('[[{9L}perdido]]')
    const el = screen.getByText('perdido')
    expect(el).toHaveAttribute('title', 'Artículo #9 no encontrado')
    expect(el.className).toContain('border-dashed')
  })

  it('renders a link as neutral text while its collection is still loading', () => {
    renderText('[[{9L}cargando]]', makePort({ pending: () => true }))
    const el = screen.getByText('cargando')
    expect(el).not.toHaveAttribute('title')
    expect(el.className).toBe('')
  })

  it('flags a link without the section letter', () => {
    renderText('[[{5}sin letra]]')
    expect(screen.getByText('sin letra')).toHaveAttribute('title', 'Formato de wiki-link inválido: falta la letra de sección')
  })

  it('shows a placeholder for an invalid link with no text', () => {
    renderText('[[{5}]]')
    expect(screen.getByText('[[ID incorrecto]]')).toBeInTheDocument()
  })

  it('treats an empty valid link as a link with no text', () => {
    const { container } = renderText('[[{7L}]]')
    expect(container.textContent).not.toContain('[[')
  })

  it('renders an https image', () => {
    const { container } = renderText('[[https://example.com/a.png]]')
    expect(container.querySelector('img')).not.toBeNull()
  })

  it('keeps the markdown inline styles', () => {
    const { container } = renderText('**a** *b* ***c***')
    expect(container.querySelector('strong')).toHaveTextContent('a')
    expect(container.querySelector('em')).toHaveTextContent('b')
    expect(container.querySelector('strong > em')).toHaveTextContent('c')
  })

  it('leaves unknown bracket markup as plain text', () => {
    const { container } = renderText('[[nada]] y [[{x}y]] y [[{1S]]')
    expect(container.textContent).toBe('[[nada]] y [[{x}y]] y [[{1S]]')
  })

  it('renders a link inside a heading and a list item', () => {
    renderText('# Título [[{7L}torre]]\n- item [[{7L}otra]]')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Título torre')
    expect(screen.getByRole('listitem')).toHaveTextContent('item otra')
  })
})

describe('WikiText distances', () => {
  const DISTANCE = {
    locale: 'es',
    config: {
      main: 'ft',
      units: [
        { key: 'ft', label: 'Pies', value: 1, decimals: 0 },
        { key: 'm', label: 'Metros', value: 3.28084, decimals: 1 },
        { key: 'c', label: 'Casilleros', value: 5, decimals: 0 },
      ],
    },
  }
  const withDistance = (d = DISTANCE) => makePort({ distance: d })

  it('renders a distance with every equivalence', () => {
    const { container } = renderText('Salta [[{D:ft}15]] de ancho', withDistance())
    expect(container.textContent).toBe('Salta [15ft|4,5m|3c] de ancho')
  })

  it('accepts decimal amounts with point or comma', () => {
    expect(renderText('[[{D:m}4.5]]', withDistance()).container.textContent).toBe('[14ft|4,5m|2c]')
    expect(renderText('[[{D:m}4,5]]', withDistance()).container.textContent).toBe('[14ft|4,5m|2c]')
  })

  it('uses the locale of the port for the separator', () => {
    expect(renderText('[[{D:ft}15]]', withDistance({ ...DISTANCE, locale: 'en' })).container.textContent).toBe('[15ft|4.5m|3c]')
  })

  it('renders a distance inside a heading and a list item', () => {
    renderText('## Alcance [[{D:ft}30]]\n- salto [[{D:ft}15]]', withDistance())
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Alcance [30ft|9,1m|6c]')
    expect(screen.getByRole('listitem')).toHaveTextContent('salto [15ft|4,5m|3c]')
  })

  it('mixes distances and article links in one line', () => {
    renderText('[[{7L}torre]] a [[{D:ft}15]]', withDistance())
    expect(screen.getByText('torre')).toBeInTheDocument()
    expect(screen.getByText(/\[15ft\|4,5m\|3c\]/)).toBeInTheDocument()
  })

  it('keeps the original markup for an unknown unit or a malformed amount', () => {
    const { container } = renderText('[[{D:yd}15]] [[{D:ft}abc]] [[{D:ft}]] [[{D}15]] [[{Dx}1]]', withDistance())
    expect(container.textContent).toBe('[[{D:yd}15]] [[{D:ft}abc]] [[{D:ft}]] [[{D}15]] [[{Dx}1]]')
  })

  it('keeps the original markup when the port has no distance configuration (legacy pages)', () => {
    const { container } = renderText('Salta [[{D:ft}15]]', makePort())
    expect(container.textContent).toBe('Salta [[{D:ft}15]]')
  })

  it('does not turn an old-style numbered unit into an article link', () => {
    const { container } = renderText('[[{D1}15]]', withDistance())
    expect(container.textContent).toBe('[[{D1}15]]')
    expect(container.querySelector('[title]')).toBeNull()
  })

  it('does not change the article links around a distance', () => {
    renderText('[[{9L}perdido]] [[{D:ft}15]] [[{5}x]]', withDistance())
    expect(screen.getByText('perdido')).toHaveAttribute('title', 'Artículo #9 no encontrado')
    expect(screen.getByText('x')).toHaveAttribute('title', 'Formato de wiki-link inválido: falta la letra de sección')
  })
})
