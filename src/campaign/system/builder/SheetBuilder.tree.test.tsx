import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { validateSheet } from '../sheet/sheetModel'
import { STORED_SHEET } from './builderFixture'
import { SheetBuilder } from './SheetBuilder'

const setup = (initial: unknown = STORED_SHEET) => render(<SheetBuilder initial={initial} />)
const tabs = () => screen.getAllByRole('tab').map((t) => t.textContent)
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } })
const click = (name: string | RegExp, scope: Pick<typeof screen, 'getByRole'> = screen) => fireEvent.click(scope.getByRole('button', { name }))
const section = (name: string) => screen.getByRole('group', { name: `Sección ${name}` })
const item = (name: string) => screen.getByRole('group', { name: `Ítem ${name}` })
const itemNames = (scope: HTMLElement) => within(scope).getAllByRole('group', { name: /^Ítem / }).map((g) => g.getAttribute('aria-label'))

describe('the stored fixture', () => {
  it('is a valid sheet', () => {
    expect(validateSheet(STORED_SHEET).ok).toBe(true)
  })
})

describe('SheetBuilder: categories', () => {
  it('shows the categories as tabs and the sections of the selected one', () => {
    setup()
    expect(tabs()).toEqual(['General', 'Mecánicas'])
    expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'true')
    expect(section('Perfil')).toBeInTheDocument()
    expect(section('Extra')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Sección Magia' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Mecánicas' }))
    expect(section('Magia')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Sección Perfil' })).not.toBeInTheDocument()
  })

  it('adds a category (selected, with a key made from its name), renames it and reorders it', () => {
    setup()
    click('Agregar categoría')
    expect(tabs()).toEqual(['General', 'Mecánicas', 'Nueva categoría'])
    expect(screen.getByRole('tab', { name: 'Nueva categoría' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Clave de la categoría')).toHaveValue('nueva_categoria')
    type(screen.getByLabelText('Nombre de la categoría'), 'Combate Ágil')
    expect(tabs()).toEqual(['General', 'Mecánicas', 'Combate Ágil'])
    expect(screen.getByLabelText('Clave de la categoría')).toHaveValue('combate_agil')
    click('Subir categoría')
    expect(tabs()).toEqual(['General', 'Combate Ágil', 'Mecánicas'])
    expect(screen.getByRole('button', { name: 'Bajar categoría' })).toBeEnabled()
    click('Subir categoría')
    expect(screen.getByRole('button', { name: 'Subir categoría' })).toBeDisabled()
  })

  it('a stored category keeps its key, a new one lets the DM edit it until it is saved', () => {
    setup()
    expect(screen.getByLabelText('Clave de la categoría')).toHaveAttribute('readonly')
    type(screen.getByLabelText('Nombre de la categoría'), 'Otro nombre')
    expect(screen.getByLabelText('Clave de la categoría')).toHaveValue('general')
    click('Agregar categoría')
    const key = screen.getByLabelText('Clave de la categoría')
    expect(key).not.toHaveAttribute('readonly')
    type(key, 'mi_clave')
    type(screen.getByLabelText('Nombre de la categoría'), 'Cualquiera')
    expect(screen.getByLabelText('Clave de la categoría')).toHaveValue('mi_clave') // a key typed by hand stops following the name
  })

  it('removes a new category without asking, and a stored one only after confirming', () => {
    setup()
    click('Agregar categoría')
    click('Quitar categoría')
    expect(tabs()).toEqual(['General', 'Mecánicas'])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'General' }))
    click('Quitar categoría') // General holds stored fields
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('los datos ya cargados en los personajes se conservan, pero dejan de mostrarse')
    click('Cancelar', within(dialog))
    expect(tabs()).toEqual(['General', 'Mecánicas'])
    click('Quitar categoría')
    click(/^Quitar$/, within(screen.getByRole('dialog')))
    expect(tabs()).toEqual(['Mecánicas'])
    expect(screen.getByRole('tab', { name: 'Mecánicas' })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('SheetBuilder: sections', () => {
  it('adds, renames and reorders sections', () => {
    setup()
    click('Agregar sección')
    const added = section('Nueva sección')
    type(within(added).getByLabelText('Nombre de la sección'), 'Combate')
    expect(within(section('Combate')).getByLabelText('Clave de la sección')).toHaveValue('combate')
    const names = () => screen.getAllByRole('group', { name: /^Sección / }).map((g) => g.getAttribute('aria-label'))
    expect(names()).toEqual(['Sección Perfil', 'Sección Extra', 'Sección Combate'])
    click('Subir sección', within(section('Combate')))
    expect(names()).toEqual(['Sección Perfil', 'Sección Combate', 'Sección Extra'])
    expect(within(section('Perfil')).getByRole('button', { name: 'Subir sección' })).toBeDisabled()
  })

  it('removes an empty stored section directly and asks for a section with stored items', () => {
    setup()
    click('Quitar sección', within(section('Extra')))
    expect(screen.queryByRole('group', { name: 'Sección Extra' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    click('Quitar sección', within(section('Perfil')))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('SheetBuilder: items', () => {
  it('lists the items in order and reorders them', () => {
    setup()
    expect(itemNames(section('Perfil'))).toEqual(['Ítem Edad', 'Ítem Vida', 'Ítem Notas'])
    click('Bajar ítem', within(item('Edad')))
    expect(itemNames(section('Perfil'))).toEqual(['Ítem Vida', 'Ítem Edad', 'Ítem Notas'])
    expect(within(item('Vida')).getByRole('button', { name: 'Subir ítem' })).toBeDisabled()
  })

  it('adds a field and a table of the chosen type, keys made from fresh names', () => {
    setup()
    const perfil = section('Perfil')
    click('Agregar campo', within(perfil))
    type(within(perfil).getByLabelText('Tipo de tabla'), 'libre')
    click('Agregar tabla', within(perfil))
    expect(itemNames(perfil)).toEqual(['Ítem Edad', 'Ítem Vida', 'Ítem Notas', 'Ítem Nuevo campo', 'Ítem Nueva tabla'])
    expect(within(item('Nuevo campo')).getByText('Campo corto')).toBeInTheDocument()
    expect(within(item('Nueva tabla')).getByText('Tabla libre')).toBeInTheDocument()
  })

  it('removing a stored item asks, says what happens to the data and also unlinks it from blocks and roles', () => {
    setup()
    click('Quitar ítem', within(item('Vida')))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Vida')
    expect(dialog).toHaveTextContent('se conservan, pero dejan de mostrarse')
    click('Cancelar', within(dialog))
    expect(item('Vida')).toBeInTheDocument()
    click('Quitar ítem', within(item('Vida')))
    click(/^Quitar$/, within(screen.getByRole('dialog')))
    expect(screen.queryByRole('group', { name: 'Ítem Vida' })).not.toBeInTheDocument()
    const block = screen.getByRole('group', { name: 'Bloque Datos' })
    expect(within(block).getByLabelText('Edad')).toBeChecked()
    expect(within(block).queryByLabelText('Vida')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Vida máxima')).toHaveValue('') // the hp role pointed at it
  })

  it('removing an item added in this session needs no confirmation', () => {
    setup()
    click('Agregar campo', within(section('Perfil')))
    click('Quitar ítem', within(item('Nuevo campo')))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Ítem Nuevo campo' })).not.toBeInTheDocument()
  })
})

describe('SheetBuilder: blocks', () => {
  it('shows the blocks of a section with title, mode and the items they show', () => {
    setup()
    const block = screen.getByRole('group', { name: 'Bloque Datos' })
    expect(within(block).getByLabelText('Título del bloque')).toHaveValue('Datos')
    expect(within(block).getByLabelText('Modo')).toHaveValue('tile')
    expect(within(block).getByLabelText('Edad')).toBeChecked()
    expect(within(block).getByLabelText('Vida')).toBeChecked()
    expect(within(block).getByLabelText('Notas')).not.toBeChecked()
  })

  it('adds a block, sets its mode and items, reorders and removes it', () => {
    setup()
    click('Agregar bloque', within(section('Perfil')))
    const blocks = () => within(section('Perfil')).getAllByRole('group', { name: /^Bloque / }).map((g) => g.getAttribute('aria-label'))
    expect(blocks()).toEqual(['Bloque Datos', 'Bloque Nuevo bloque'])
    const added = screen.getByRole('group', { name: 'Bloque Nuevo bloque' })
    type(within(added).getByLabelText('Modo'), 'plano')
    fireEvent.click(within(added).getByLabelText('Notas'))
    expect(within(added).getByLabelText('Notas')).toBeChecked()
    click('Subir bloque', within(added))
    expect(blocks()).toEqual(['Bloque Nuevo bloque', 'Bloque Datos'])
    click('Quitar bloque', within(screen.getByRole('group', { name: 'Bloque Nuevo bloque' })))
    expect(blocks()).toEqual(['Bloque Datos'])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument() // blocks hold no character data
  })

  it('a modal block picks among the categories its table declares, in the order they were picked', () => {
    setup()
    fireEvent.click(screen.getByRole('tab', { name: 'Mecánicas' }))
    const block = screen.getByRole('group', { name: 'Bloque lista' })
    expect(within(block).getByLabelText('Trucos')).toBeChecked()
    expect(within(block).getByLabelText('Nivel 1')).not.toBeChecked()
    fireEvent.click(within(block).getByLabelText('Nivel 1'))
    expect(within(block).getByLabelText('Nivel 1')).toBeChecked()
    expect(within(block).getByText('Orden: Trucos, Nivel 1')).toBeInTheDocument()
    click('Subir categoría filtrada Nivel 1', within(block))
    expect(within(block).getByText('Orden: Nivel 1, Trucos')).toBeInTheDocument()
  })
})

describe('SheetBuilder: roles', () => {
  it('binds roles to number fields only', () => {
    setup()
    const hp = screen.getByLabelText('Vida máxima')
    expect(hp).toHaveValue('vida')
    expect(within(hp).getAllByRole('option').map((o) => o.textContent)).toEqual(['Sin asignar', 'Vida (vida)'])
    type(screen.getByLabelText('Clase de armadura'), 'vida')
    expect(screen.getByLabelText('Clase de armadura')).toHaveValue('vida')
    type(hp, '')
    expect(hp).toHaveValue('')
  })
})

describe('SheetBuilder: starting point', () => {
  it('without a stored sheet starts with one category and one section', () => {
    setup(null)
    expect(tabs()).toEqual(['General'])
    expect(screen.getAllByRole('group', { name: /^Sección / })).toHaveLength(1)
  })
})
