import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { item, setup, type } from './builderTestKit'
import { TEST_CHARACTERS } from './formula/workbenchFixture'

const PANES_SHEET = {
  categories: [
    {
      key: 'general',
      label: 'General',
      sections: [
        {
          key: 'perfil',
          label: 'Perfil',
          items: [
            { _open: true, kind: 'field', key: 'fuerza', label: 'Fuerza', type: 'number', editableBy: 'dm' },
            { _open: true, kind: 'field', key: 'poder', label: 'Poder', type: 'number', editableBy: 'dm', formula: '{fuerza} + 1' },
            { _open: true, kind: 'field', key: 'secreto', label: 'Dato oculto', type: 'number', editableBy: 'dm', formula: '{fuerza} * 9', hidden: true },
          ],
          blocks: [{ key: 'datos', mode: 'tile', items: ['fuerza', 'poder', 'secreto'] }],
        },
      ],
    },
    {
      key: 'mecanicas',
      label: 'Mecánicas',
      sections: [
        {
          key: 'combate',
          label: 'Combate',
          items: [{ kind: 'field', key: 'iniciativa', label: 'Iniciativa', type: 'number', editableBy: 'dm', formula: '{fuerza} * 2' }],
          blocks: [{ key: 'ini', mode: 'tile', items: ['iniciativa'] }],
        },
      ],
    },
  ],
  roles: {},
}

const render = (props = {}) => setup(PANES_SHEET, { testCharacters: TEST_CHARACTERS, onSave: vi.fn(), ...props })
const outline = () => screen.getByRole('navigation', { name: 'Estructura de la ficha' })
const outlineButton = (name: RegExp) => within(outline()).getByRole('button', { name })
const preview = () => screen.getByRole('region', { name: 'Vista previa' })
const formula = (name: string) => within(item(name)).getByLabelText('Fórmula')
const probar = (name: string) => within(item(name)).getByLabelText('Probar con') as HTMLSelectElement
const previewCharacter = () => within(preview()).getByLabelText('Personaje de prueba') as HTMLSelectElement
const saveState = () => screen.getByRole('group', { name: 'Estado de la plantilla' })

afterEach(() => vi.restoreAllMocks())

describe('BuilderOutline', () => {
  it('lists categories, sections and items with a kind hint', () => {
    render()
    const nav = within(outline())
    expect(nav.getByRole('button', { name: /^General/ })).toBeInTheDocument()
    expect(nav.getByRole('button', { name: /^Perfil/ })).toBeInTheDocument()
    expect(nav.getByRole('button', { name: /^Fuerza/ })).toHaveTextContent('número')
    expect(nav.getByRole('button', { name: /^Poder/ })).toHaveTextContent('ƒ')
    expect(nav.getByRole('button', { name: /^Iniciativa/ })).toBeInTheDocument()
  })

  it('selects the category tab, opens the item and focuses its editor when an item is clicked', () => {
    render()
    expect(screen.getByRole('tab', { name: /General/ })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(outlineButton(/^Iniciativa/))
    expect(screen.getByRole('tab', { name: /Mecánicas/ })).toHaveAttribute('aria-selected', 'true')
    expect(outlineButton(/^Iniciativa/)).toHaveAttribute('aria-current', 'true')
    expect(outlineButton(/^Fuerza/)).not.toHaveAttribute('aria-current')
    const editor = item('Iniciativa')
    expect(within(editor).getByRole('button', { name: 'Cerrar ítem' })).toBeInTheDocument()
    expect(document.activeElement).toBe(editor)
  })

  it('selects a category tab when a category is clicked', () => {
    render()
    fireEvent.click(outlineButton(/^Mecánicas/))
    expect(screen.getByRole('tab', { name: /Mecánicas/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('marks the items, sections and categories that have errors with a dot', () => {
    render()
    type(formula('Poder'), '{nope} + 1')
    expect(within(outlineButton(/^Poder/)).getByRole('img', { name: 'Con errores' })).toBeInTheDocument()
    expect(within(outlineButton(/^Perfil/)).getByRole('img', { name: 'Con errores' })).toBeInTheDocument()
    expect(within(outlineButton(/^General/)).getByRole('img', { name: 'Con errores' })).toBeInTheDocument()
    expect(within(outlineButton(/^Fuerza/)).queryByRole('img', { name: 'Con errores' })).toBeNull()
    expect(within(outlineButton(/^Mecánicas/)).queryByRole('img', { name: 'Con errores' })).toBeNull()
  })

  it('filters by name or key', () => {
    render()
    const search = within(outline()).getByLabelText('Buscar en la estructura')
    type(search, 'inic')
    expect(within(outline()).queryByRole('button', { name: /^Fuerza/ })).toBeNull()
    expect(outlineButton(/^Iniciativa/)).toBeInTheDocument()
    type(search, 'secreto')
    expect(outlineButton(/^Dato oculto/)).toBeInTheDocument()
    expect(within(outline()).queryByRole('button', { name: /^Iniciativa/ })).toBeNull()
    type(search, 'zzz')
    expect(within(outline()).getByText('Sin resultados')).toBeInTheDocument()
  })
})

describe('BuilderPreview', () => {
  it('draws the draft with the first test character, with the unsaved note', () => {
    render()
    const view = within(preview())
    expect(view.getByText('Ficha con los cambios sin guardar, calculada con el personaje de prueba.')).toBeInTheDocument()
    expect(previewCharacter().value).toBe('liria')
    expect(view.getByText('Poder')).toBeInTheDocument()
    expect(view.getByText('15')).toBeInTheDocument()
  })

  it('follows an unsaved formula change', () => {
    render()
    type(formula('Poder'), '{fuerza} + 100')
    expect(within(preview()).getByText('114')).toBeInTheDocument()
  })

  it('shares the test character with every workbench, both ways', () => {
    render()
    expect(probar('Poder').value).toBe('liria')
    fireEvent.change(probar('Poder'), { target: { value: 'borin' } })
    expect(previewCharacter().value).toBe('borin')
    expect(probar('Dato oculto').value).toBe('borin')
    expect(within(preview()).getByText('9')).toBeInTheDocument()
    fireEvent.change(previewCharacter(), { target: { value: 'liria' } })
    expect(probar('Poder').value).toBe('liria')
    expect(probar('Dato oculto').value).toBe('liria')
  })

  it('shows hidden fields only in the DM view', () => {
    render()
    const toggle = within(preview()).getByRole('group', { name: 'Ver como' })
    const dm = within(toggle).getByRole('button', { name: 'DM' })
    const player = within(toggle).getByRole('button', { name: 'Jugador' })
    expect(dm).toHaveAttribute('aria-pressed', 'true')
    expect(player).toHaveAttribute('aria-pressed', 'false')
    expect(within(preview()).getByText('Dato oculto')).toBeInTheDocument()
    fireEvent.click(player)
    expect(player).toHaveAttribute('aria-pressed', 'true')
    expect(dm).toHaveAttribute('aria-pressed', 'false')
    expect(within(preview()).queryByText('Dato oculto')).toBeNull()
    expect(within(preview()).getByText('Poder')).toBeInTheDocument()
    fireEvent.click(dm)
    expect(within(preview()).getByText('Dato oculto')).toBeInTheDocument()
  })

  it('keeps the last valid version while the draft has errors, and says so', () => {
    render()
    expect(within(preview()).queryByText('Mostrando la última versión válida')).toBeNull()
    type(formula('Poder'), '{nope} + 1')
    expect(within(preview()).getByText('Mostrando la última versión válida')).toBeInTheDocument()
    expect(within(preview()).getByText('15')).toBeInTheDocument()
    type(formula('Poder'), '{fuerza} + 2')
    expect(within(preview()).queryByText('Mostrando la última versión válida')).toBeNull()
  })

  it('never writes anything', () => {
    const onSave = vi.fn()
    const store = vi.spyOn(Storage.prototype, 'setItem')
    render({ onSave })
    fireEvent.click(within(preview()).getByRole('button', { name: 'Jugador' }))
    fireEvent.change(previewCharacter(), { target: { value: 'borin' } })
    expect(onSave).not.toHaveBeenCalled()
    expect(store).not.toHaveBeenCalled()
  })
})

describe('SaveBar', () => {
  it('counts the unsaved changes', () => {
    render()
    expect(saveState()).toHaveTextContent('Sin cambios')
    type(formula('Poder'), '{fuerza} + 2')
    expect(saveState()).toHaveTextContent('1 cambio sin guardar')
    type(formula('Dato oculto'), '{fuerza} * 2')
    expect(saveState()).toHaveTextContent('2 cambios sin guardar')
  })

  it('says why it cannot save while there are errors, and links the reason to the button', () => {
    render()
    const button = screen.getByRole('button', { name: 'Guardar plantilla' })
    expect(button).toBeEnabled()
    type(formula('Poder'), '{nope} + 1')
    expect(saveState()).toHaveTextContent('1 cambio sin guardar · 1 error impide guardar')
    expect(button).toBeDisabled()
    const reason = document.getElementById(button.getAttribute('aria-describedby') ?? 'none')
    expect(reason).toHaveTextContent(/Corregí/)
  })
})
