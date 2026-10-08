import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FormActionsContext, FormPortContext, WikiPortContext, type FormActions, type FormPort, type WikiPort } from '../ports'
import MapaForm from './MapaForm'
import MapPointForm from './MapPointForm'

const port: FormPort = { isDM: true, regions: [], characters: [{ id: 1, nombre: 'Ana' }], sesiones: [] }
const wiki: WikiPort = {
  pending: () => false,
  resolve: () => null,
  navigate: () => undefined,
  search: () => [
    { table: 'lugares', letter: 'G', id: 5, title: 'Torre' },
    { table: 'lugares', letter: 'G', id: 6, title: '' },
    { table: 'pnjs', letter: 'N', id: 7, title: 'Brea' },
    { table: 'mapas', letter: 'M', id: 2, title: 'Sótano' },
  ],
}

function render_(ui: React.ReactElement, wikiPort: WikiPort, overrides: Partial<FormActions> = {}) {
  const actions: FormActions = { save: vi.fn(), remove: vi.fn(), closeForm: vi.fn(), activeFieldRef: { current: null }, ...overrides }
  const view = render(
    <FormActionsContext.Provider value={actions}>
      <FormPortContext.Provider value={port}>
        <WikiPortContext.Provider value={wikiPort}>{ui}</WikiPortContext.Provider>
      </FormPortContext.Provider>
    </FormActionsContext.Provider>,
  )
  return { ...view, actions }
}

function setup(ui: React.ReactElement, overrides: Partial<FormActions> = {}, wikiPort: WikiPort = wiki) {
  return render_(ui, wikiPort, overrides).actions
}

describe('MapPointForm (port based, shared by legacy and hub)', () => {
  it('a new point carries the prefilled map and coordinates; no link is saved as nulls', () => {
    const actions = setup(<MapPointForm item={null} prefill={{ map_id: 3, x: 0.25, y: 0.75 }} />)
    expect(screen.getByText(/x: 0\.250 · y: 0\.750/)).toBeInTheDocument()
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Faro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(actions.save).toHaveBeenCalledWith('map_points', expect.objectContaining({ map_id: 3, x: 0.25, y: 0.75, nombre: 'Faro', link_type: null, link_id: null, id: undefined }))
  })

  it('offers only the entities of the chosen link type, with a fallback label for an untitled one', () => {
    setup(<MapPointForm item={null} prefill={{ map_id: 3 }} />)
    fireEvent.change(screen.getByDisplayValue('Sin link'), { target: { value: 'lugar' } })
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toContain('Torre')
    expect(options).toContain('(id 6)')
    expect(options).not.toContain('Brea')
    expect(options).not.toContain('Sótano')
  })

  it('saves a complete link, and drops a half link (type without a target) instead of failing the database check', () => {
    const actions = setup(<MapPointForm item={null} prefill={{ map_id: 3 }} />)
    fireEvent.change(screen.getByDisplayValue('Sin link'), { target: { value: 'mapa' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(actions.save).toHaveBeenLastCalledWith('map_points', expect.objectContaining({ link_type: null, link_id: null }))
    fireEvent.change(screen.getByDisplayValue('— elegir —'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(actions.save).toHaveBeenLastCalledWith('map_points', expect.objectContaining({ link_type: 'mapa', link_id: 2 }))
  })

  it('changing the link type clears the previous target instead of saving a type with a foreign id', () => {
    const actions = setup(<MapPointForm item={{ id: 4, map_id: 3, nombre: 'P', x: 0.1, y: 0.2, link_type: 'lugar', link_id: 5 }} prefill={null} />)
    fireEvent.change(screen.getByDisplayValue('Lugar'), { target: { value: 'pnj' } })
    expect(screen.getByRole('option', { name: /elegir/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(actions.save).toHaveBeenLastCalledWith('map_points', expect.objectContaining({ link_type: null, link_id: null }))
  })

  it.each([
    [{ x: 7, y: -3 }, 'x: 1.000 · y: 0.000'],
    [{ x: Number.NaN, y: 'abc' }, 'x: 0.500 · y: 0.500'],
    [undefined, 'x: 0.500 · y: 0.500'],
  ])('sanitises prefill %j', (prefill, text) => {
    setup(<MapPointForm item={null} prefill={prefill as never} />)
    expect(screen.getByText(text, { exact: false })).toBeInTheDocument()
  })

  it('editing shows Eliminar and disables Guardar while saving', () => {
    const actions = setup(<MapPointForm item={{ id: 4, map_id: 3, nombre: 'P', x: 0.1, y: 0.2, link_type: 'pnj', link_id: 7 }} prefill={null} />, { saving: true })
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(actions.remove).toHaveBeenCalledWith('map_points', 4)
  })
})

describe('MapPointForm link picker states', () => {
  const stored = { id: 9, map_id: 3, nombre: 'P', x: 0.1, y: 0.2, link_type: 'lugar', link_id: 9 }

  it('shows a loading option while the wiki index is pending and keeps the stored target selected', () => {
    setup(<MapPointForm item={stored} prefill={null} />, {}, { ...wiki, pending: () => true, search: () => [] })
    expect(screen.getByRole('option', { name: 'Cargando…' })).toBeInTheDocument()
    const select = screen.getByDisplayValue('(id 9)') as HTMLSelectElement
    expect(select.value).toBe('9')
  })

  it('labels the stored target from the index once it resolves, and keeps (id N) when it is not available', () => {
    const resolving = { ...wiki, resolve: () => ({ title: 'Torre vieja', section: 'Lugar', table: 'lugares' }), search: () => [] }
    const { unmount } = render_(<MapPointForm item={stored} prefill={null} />, resolving)
    expect(screen.getByDisplayValue('Torre vieja')).toBeInTheDocument()
    unmount()
    setup(<MapPointForm item={stored} prefill={null} />) // not in the options, nothing resolves it
    expect(screen.getByDisplayValue('(id 9)')).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Cargando…' })).toBeNull()
  })

  it('does not duplicate the stored target when it is among the options', () => {
    setup(<MapPointForm item={{ ...stored, link_id: 5 }} prefill={null} />)
    expect(screen.getAllByRole('option', { name: 'Torre' })).toHaveLength(1)
  })
})

describe('MapaForm (port based)', () => {
  it('saves the whole form and previews only http(s) images', () => {
    const actions = setup(<MapaForm item={null} />)
    fireEvent.change(screen.getByPlaceholderText('https://...'), { target: { value: 'javascript:alert(1)' } })
    expect(screen.queryByAltText('preview')).toBeNull()
    fireEvent.change(screen.getByPlaceholderText('https://...'), { target: { value: 'https://img.test/m.png' } })
    expect(screen.getByAltText('preview')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: /Mapa por defecto/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(actions.save).toHaveBeenCalledWith('mapas', expect.objectContaining({ imagen_url: 'https://img.test/m.png', is_default: true, estado: 'publicado' }))
  })
})
