import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { STORED_SHEET } from './builderFixture'
import { addField, click, group, item, section, setup, SMALL, type } from './builderTestKit'
import { SheetBuilder } from './SheetBuilder'

const save = () => screen.getByRole('button', { name: 'Guardar plantilla' })

describe('SheetBuilder: live validation', () => {
  it('a valid sheet says so and Save is enabled', () => {
    render(<SheetBuilder initial={STORED_SHEET} onSave={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('La plantilla es válida.')
    expect(save()).toBeEnabled()
  })

  it('shows the Spanish error next to the offending part and in a summary, and disables Save', () => {
    render(<SheetBuilder initial={SMALL} onSave={vi.fn()} />)
    const f = addField('Vida')
    type(within(f).getByLabelText('Tipo'), 'number')
    type(within(f).getByLabelText('Origen del valor'), 'formula')
    type(within(f).getByLabelText('Fórmula'), '{zzz} + 1')
    const inline = within(item('Vida')).getByRole('list', { name: 'Errores de este elemento' })
    expect(inline).toHaveTextContent('Fórmula: La referencia {zzz} no existe.')
    const summary = screen.getByRole('alert', { name: 'Errores de la plantilla' })
    expect(summary).toHaveTextContent('La plantilla tiene 1 error. Corregilo para poder guardar.')
    expect(summary).toHaveTextContent('Categoría «C» › Sección «S» › Ítem «Vida» › Fórmula: La referencia {zzz} no existe.')
    expect(save()).toBeDisabled()
    type(within(item('Vida')).getByLabelText('Fórmula'), '2 + 1')
    expect(screen.queryByRole('alert', { name: 'Errores de la plantilla' })).not.toBeInTheDocument()
    expect(within(item('Vida')).queryByRole('list', { name: 'Errores de este elemento' })).not.toBeInTheDocument()
    expect(save()).toBeEnabled()
  })

  it('reports an empty name, a repeated key and a checkbox with three options, each at its part', () => {
    render(<SheetBuilder initial={SMALL} onSave={vi.fn()} />)
    const f = addField('Modo')
    type(within(f).getByLabelText('Tipo'), 'options')
    click('Agregar opción', within(item('Modo')))
    type(within(item('Modo')).getByLabelText('Mostrar como'), 'checkbox')
    expect(within(item('Modo')).getByRole('list', { name: 'Errores de este elemento' })).toHaveTextContent('Mostrar como: Una casilla tiene exactamente dos opciones.')
    type(within(item('Modo')).getByLabelText('Mostrar como'), 'select')
    type(within(group(within(item('Modo')), 'Opción Opción 1')).getByLabelText('Nombre de la opción'), '   ')
    expect(within(within(item('Modo')).getAllByRole('group', { name: /^Opción/ })[0]).getByRole('list', { name: 'Errores de este elemento' })).toHaveTextContent('Nombre: El nombre debe tener entre 1 y 60 caracteres')
    expect(screen.getByRole('alert', { name: 'Errores de la plantilla' })).toHaveTextContent('Categoría «C» › Sección «S» › Ítem «Modo» › Opción')
    expect(save()).toBeDisabled()
  })

  it('a hand-typed key that repeats another or is reserved is reported at the key', () => {
    render(<SheetBuilder initial={STORED_SHEET} onSave={vi.fn()} />)
    click('Agregar campo', within(section('Perfil')))
    const key = within(item('Nuevo campo')).getByLabelText('Clave del ítem')
    type(key, 'edad')
    expect(within(item('Nuevo campo')).getByRole('list', { name: 'Errores de este elemento' })).toHaveTextContent('Clave: Esa clave ya está en uso por otro elemento.')
    type(key, 'nombre')
    expect(within(item('Nuevo campo')).getByRole('list', { name: 'Errores de este elemento' })).toHaveTextContent('Clave: Esa clave está reservada por la aplicación. Elegí otra.')
    type(key, 'Mala Clave')
    expect(within(item('Nuevo campo')).getByRole('list', { name: 'Errores de este elemento' })).toHaveTextContent('Clave: Clave no válida')
    expect(save()).toBeDisabled()
  })

  it('removing a field that a formula reads leaves the formula invalid and blocks Save', () => {
    render(<SheetBuilder initial={SMALL} onSave={vi.fn()} />)
    addField('Base')
    const f = addField('Doble')
    type(within(f).getByLabelText('Tipo'), 'number')
    type(within(f).getByLabelText('Origen del valor'), 'formula')
    type(within(f).getByLabelText('Fórmula'), '{base} * 2')
    expect(save()).toBeEnabled()
    click('Quitar ítem', within(item('Base')))
    expect(within(item('Doble')).getByRole('list', { name: 'Errores de este elemento' })).toHaveTextContent('La referencia {base} no existe.')
    expect(save()).toBeDisabled()
  })

  it('a sheet without categories cannot be saved', () => {
    render(<SheetBuilder initial={SMALL} onSave={vi.fn()} />)
    click('Quitar categoría')
    expect(screen.getByRole('alert', { name: 'Errores de la plantilla' })).toHaveTextContent('La plantilla necesita al menos una categoría.')
    expect(save()).toBeDisabled()
  })

  it('marks the tab of a category that has an error', () => {
    render(<SheetBuilder initial={STORED_SHEET} onSave={vi.fn()} />)
    click('Agregar sección', screen)
    type(within(section('Nueva sección')).getByLabelText('Clave de la sección'), 'dm')
    expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute('data-invalid', 'true')
    expect(screen.getByRole('tab', { name: 'Mecánicas' })).not.toHaveAttribute('data-invalid')
  })
})

describe('SheetBuilder: save', () => {
  it('hands over the normalised sheet (no editing markers) and shows progress', async () => {
    let finish: () => void = () => undefined
    const onSave = vi.fn<(sheet: unknown) => Promise<void>>(() => new Promise<void>((resolve) => void (finish = resolve)))
    render(<SheetBuilder initial={SMALL} onSave={onSave} />)
    addField('Edad')
    fireEvent.click(save())
    expect(onSave).toHaveBeenCalledTimes(1)
    const sent = JSON.stringify(onSave.mock.calls[0])
    expect(sent).not.toContain('_new')
    expect(sent).not.toContain('_open')
    expect(onSave.mock.calls[0][0]).toEqual({
      categories: [{ key: 'c', label: 'C', sections: [{ key: 's', label: 'S', blocks: [], items: [{ kind: 'field', key: 'edad', label: 'Edad', type: 'short', editableBy: 'dm' }] }] }],
      roles: {},
    })
    expect(await screen.findByRole('button', { name: 'Guardando…' })).toBeDisabled()
    finish()
    expect(await screen.findByRole('button', { name: 'Guardar plantilla' })).toBeEnabled()
  })

  it('does not call save while the sheet is invalid', () => {
    const onSave = vi.fn()
    render(<SheetBuilder initial={SMALL} onSave={onSave} />)
    click('Agregar campo', within(section('S')))
    type(within(item('Nuevo campo')).getByLabelText('Nombre del ítem'), '   ')
    expect(save()).toBeDisabled()
    fireEvent.click(save())
    expect(onSave).not.toHaveBeenCalled()
  })

  it('works without a save handler (read-only host): no Save button', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'Guardar plantilla' })).not.toBeInTheDocument()
  })
})
