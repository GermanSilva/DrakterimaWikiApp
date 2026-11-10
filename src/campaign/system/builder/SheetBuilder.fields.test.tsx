import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { STORED_SHEET } from './builderFixture'
import { addField, click, expectSaved, group, item, itemsOf, section, setup, type } from './builderTestKit'

const LIBRE = {
  categories: [
    {
      key: 'c',
      label: 'C',
      sections: [
        {
          key: 's',
          label: 'S',
          items: [
            { kind: 'field', key: 'vida', label: 'Vida', type: 'number', editableBy: 'dm' },
            { kind: 'table', type: 'libre', key: 'inventario', label: 'Inventario', editableBy: 'dm', columns: [{ key: 'peso', label: 'Peso', type: 'number', editableBy: 'dm' }] },
          ],
          blocks: [],
        },
      ],
    },
  ],
  roles: {},
}

describe('field editor: basics', () => {
  it('a new field gets its key from the name, then a number field takes bounds, default, signed and searchable', () => {
    const t = setup()
    const f = addField('Puntos de Vida')
    expect(within(f).getByLabelText('Clave del ítem')).toHaveValue('puntos_de_vida')
    type(within(f).getByLabelText('Tipo'), 'number')
    type(within(f).getByLabelText('Editable por'), 'player')
    type(within(f).getByLabelText('Mínimo'), '0')
    type(within(f).getByLabelText('Máximo'), '99')
    type(within(f).getByLabelText('Valor por defecto'), '10')
    fireEvent.click(within(f).getByLabelText('Mostrar con signo (+)'))
    fireEvent.click(within(f).getByLabelText('Buscable'))
    expectSaved(t.sheet(), 'puntos_de_vida', {
      kind: 'field', key: 'puntos_de_vida', label: 'Puntos de Vida', type: 'number', editableBy: 'player', format: 'signed', min: 0, max: 99, searchable: true, default: 10,
    })
  })

  it('a text, a paragraph and a boolean field keep only what fits their type', () => {
    const t = setup()
    const f = addField('Apodo')
    type(within(f).getByLabelText('Valor por defecto'), 'Sin apodo')
    expectSaved(t.sheet(), 'apodo', { kind: 'field', key: 'apodo', label: 'Apodo', type: 'short', editableBy: 'dm', default: 'Sin apodo' })
    type(within(f).getByLabelText('Tipo'), 'paragraph')
    expect(within(f).queryByLabelText('Buscable')).not.toBeInTheDocument()
    expect(within(f).queryByLabelText('Mínimo')).not.toBeInTheDocument()
    type(within(f).getByLabelText('Tipo'), 'boolean')
    expect(within(f).queryByLabelText('Valor por defecto')).not.toBeInTheDocument()
    fireEvent.click(within(f).getByLabelText('Marcado por defecto'))
    expectSaved(t.sheet(), 'apodo', { kind: 'field', key: 'apodo', label: 'Apodo', type: 'boolean', editableBy: 'dm', default: true })
  })

  it('a number typed with a comma or a leading minus sign is understood, and clearing removes the bound', () => {
    const t = setup()
    const f = addField('Temperatura')
    type(within(f).getByLabelText('Tipo'), 'number')
    type(within(f).getByLabelText('Mínimo'), '-')
    type(within(f).getByLabelText('Mínimo'), '-2,5')
    expect(itemsOf(t.sheet())[0]).toMatchObject({ min: -2.5 })
    type(within(f).getByLabelText('Mínimo'), '')
    expect(itemsOf(t.sheet())[0]).not.toHaveProperty('min')
  })

  it('a saved field shows its key read-only and cannot change type; a new one can until saved', () => {
    setup(STORED_SHEET)
    const edad = item('Edad')
    click('Editar ítem', within(edad))
    expect(within(item('Edad')).getByLabelText('Clave del ítem')).toHaveAttribute('readonly')
    expect(within(item('Edad')).getByLabelText('Tipo')).toBeDisabled()
    type(within(item('Edad')).getByLabelText('Nombre del ítem'), 'Años')
    expect(within(item('Años')).getByLabelText('Clave del ítem')).toHaveValue('edad')

    click('Agregar campo', within(section('Perfil')))
    expect(within(item('Nuevo campo')).getByLabelText('Tipo')).toBeEnabled()
    expect(within(item('Nuevo campo')).getByLabelText('Clave del ítem')).not.toHaveAttribute('readonly')
  })

  it('a stored item starts closed and its editor opens and closes', () => {
    setup(STORED_SHEET)
    expect(within(item('Vida')).queryByLabelText('Nombre del ítem')).not.toBeInTheDocument()
    click('Editar ítem', within(item('Vida')))
    expect(within(item('Vida')).getByLabelText('Nombre del ítem')).toHaveValue('Vida')
    click('Cerrar ítem', within(item('Vida')))
    expect(within(item('Vida')).queryByLabelText('Nombre del ítem')).not.toBeInTheDocument()
  })
})

describe('field editor: formulas and calculations', () => {
  it('a formula field is DM only, can be hidden or overridable, and shows live feedback on the formula', () => {
    const t = setup(LIBRE)
    const f = addField('Doble vida')
    type(within(f).getByLabelText('Tipo'), 'number')
    type(within(f).getByLabelText('Editable por'), 'player')
    type(within(f).getByLabelText('Origen del valor'), 'formula')
    expect(within(f).getByLabelText('Editable por')).toBeDisabled()
    expect(within(f).getByLabelText('Editable por')).toHaveValue('dm')
    expect(within(f).getByRole('alert')).toHaveTextContent('Fórmula no válida: la fórmula está vacía.')
    type(within(f).getByLabelText('Fórmula'), '{vida')
    expect(within(f).getByRole('alert')).toHaveTextContent('Fórmula no válida: falta cerrar una referencia con }.')
    type(within(f).getByLabelText('Fórmula'), '{vida} * 2')
    expect(within(f).getByRole('status')).toHaveTextContent('Fórmula válida.')
    fireEvent.click(within(f).getByLabelText('Reemplazable por un valor guardado'))
    fireEvent.click(within(f).getByLabelText('Oculto'))
    expectSaved(t.sheet(), 'doble_vida', { kind: 'field', key: 'doble_vida', label: 'Doble vida', type: 'number', editableBy: 'dm', formula: '{vida} * 2', overridable: true, hidden: true })
    type(within(f).getByLabelText('Origen del valor'), 'custom')
    expectSaved(t.sheet(), 'doble_vida', { kind: 'field', key: 'doble_vida', label: 'Doble vida', type: 'number', editableBy: 'dm' })
  })

  it('a table calculation picks table, column and operation; counting rows needs no column', () => {
    const t = setup(LIBRE)
    const f = addField('Peso total')
    type(within(f).getByLabelText('Tipo'), 'number')
    type(within(f).getByLabelText('Origen del valor'), 'calc')
    expect(within(f).getByLabelText('Tabla del cálculo')).toHaveValue('')
    type(within(f).getByLabelText('Tabla del cálculo'), 'inventario')
    expect(within(within(f).getByLabelText('Columna del cálculo')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Elegí una columna', 'Peso'])
    type(within(f).getByLabelText('Columna del cálculo'), 'peso')
    expectSaved(t.sheet(), 'peso_total', { kind: 'field', key: 'peso_total', label: 'Peso total', type: 'number', editableBy: 'dm', calc: { table: 'inventario', column: 'peso', op: 'suma' } })
    type(within(f).getByLabelText('Operación'), 'conteo')
    type(within(f).getByLabelText('Columna del cálculo'), '')
    expectSaved(t.sheet(), 'peso_total', { kind: 'field', key: 'peso_total', label: 'Peso total', type: 'number', editableBy: 'dm', calc: { table: 'inventario', op: 'conteo' } })
  })

  it('a most frequent calculation can give a short text', () => {
    const t = setup(LIBRE)
    const f = addField('Moda')
    type(within(f).getByLabelText('Origen del valor'), 'calc')
    type(within(f).getByLabelText('Tabla del cálculo'), 'inventario')
    type(within(f).getByLabelText('Columna del cálculo'), 'peso')
    type(within(f).getByLabelText('Operación'), 'mas_frecuente')
    expectSaved(t.sheet(), 'moda', { kind: 'field', key: 'moda', label: 'Moda', type: 'short', editableBy: 'dm', calc: { table: 'inventario', column: 'peso', op: 'mas_frecuente' } })
  })

  it('a paragraph or options field offers no value source', () => {
    setup()
    const f = addField('Historia')
    type(within(f).getByLabelText('Tipo'), 'paragraph')
    expect(within(f).queryByLabelText('Origen del valor')).not.toBeInTheDocument()
  })
})

describe('field editor: options', () => {
  it('turns a field into an options field with two options, each with its own formula', () => {
    const t = setup(LIBRE)
    const f = addField('Competencia')
    type(within(f).getByLabelText('Tipo'), 'options')
    const [one, two] = within(f).getAllByRole('group', { name: /^Opción / })
    expect(one).toHaveAccessibleName('Opción Opción 1')
    type(within(one).getByLabelText('Nombre de la opción'), 'Sin competencia')
    type(within(group(within(f), 'Opción Opción 2')).getByLabelText('Nombre de la opción'), 'Competente')
    expect(two).toBeInTheDocument()
    type(within(group(within(f), 'Opción Sin competencia')).getByLabelText('Fórmula de la opción'), '{vida} * 0')
    type(within(group(within(f), 'Opción Competente')).getByLabelText('Fórmula de la opción'), '{vida} * 1')
    click('Agregar opción', within(f))
    type(within(group(within(f), 'Opción Opción 3')).getByLabelText('Nombre de la opción'), 'Experto')
    type(within(group(within(f), 'Opción Experto')).getByLabelText('Fórmula de la opción'), '{vida} * 2')
    type(within(f).getByLabelText('Valor por defecto'), 'sin_competencia')
    fireEvent.click(within(f).getByLabelText('Mostrar con signo (+)'))
    expectSaved(t.sheet(), 'competencia', {
      kind: 'field', key: 'competencia', label: 'Competencia', type: 'options', editableBy: 'dm', display: 'select', format: 'signed', default: 'sin_competencia',
      options: [
        { key: 'sin_competencia', label: 'Sin competencia', formula: '{vida} * 0' },
        { key: 'competente', label: 'Competente', formula: '{vida} * 1' },
        { key: 'experto', label: 'Experto', formula: '{vida} * 2' },
      ],
    })
  })

  it('gives an option an optional mark of up to 3 characters, and says when it is too long (ficha-indice-lateral S9)', () => {
    const stored = {
      categories: [{ key: 'c', label: 'C', sections: [{ key: 's', label: 'S', blocks: [], items: [{ kind: 'field', key: 'rango', label: 'Rango', type: 'options', display: 'select', editableBy: 'dm', options: [{ key: 'u', label: 'Sin entrenar' }, { key: 'e', label: 'Entrenado' }] }] }] }],
      roles: {},
    }
    const t = setup(stored)
    click('Editar ítem', within(item('Rango')))
    const f = item('Rango')
    type(within(group(within(f), 'Opción Entrenado')).getByLabelText('Marca (hasta 3 caracteres, opcional)'), 'E')
    expect(itemsOf(t.sheet())[0]).toMatchObject({ options: [{ key: 'u', label: 'Sin entrenar' }, { key: 'e', label: 'Entrenado', mark: 'E' }] })
    type(within(group(within(f), 'Opción Entrenado')).getByLabelText('Marca (hasta 3 caracteres, opcional)'), 'Entr')
    expect(screen.getAllByText(/La marca tiene de 1 a 3 caracteres\./).length).toBeGreaterThan(0)
    type(within(group(within(f), 'Opción Entrenado')).getByLabelText('Marca (hasta 3 caracteres, opcional)'), '')
    expect(itemsOf(t.sheet())[0]).toMatchObject({ options: [{ key: 'u' }, { key: 'e', label: 'Entrenado' }] })
    expect((itemsOf(t.sheet())[0] as unknown as { options: Record<string, unknown>[] }).options[1]).not.toHaveProperty('mark')
  })

  it('reorders and removes options, a saved option keeps its key, a checkbox display is offered', () => {
    const stored = {
      categories: [{ key: 'c', label: 'C', sections: [{ key: 's', label: 'S', blocks: [], items: [{ kind: 'field', key: 'modo', label: 'Modo', type: 'options', display: 'select', editableBy: 'dm', options: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'c', label: 'Cc' }] }] }] }],
      roles: {},
    }
    const t = setup(stored)
    click('Editar ítem', within(item('Modo')))
    const f = item('Modo')
    expect(within(group(within(f), 'Opción A')).getByLabelText('Clave de la opción')).toHaveAttribute('readonly')
    click('Bajar opción', within(group(within(f), 'Opción A')))
    expect(itemsOf(t.sheet())[0]).toMatchObject({ options: [{ key: 'b' }, { key: 'a' }, { key: 'c' }] })
    click('Quitar opción', within(group(within(f), 'Opción Cc')))
    expect(screen.getByRole('dialog')).toHaveTextContent('Cc')
    click(/^Quitar$/, within(screen.getByRole('dialog')))
    type(within(f).getByLabelText('Mostrar como'), 'checkbox')
    expect(itemsOf(t.sheet())[0]).toMatchObject({ display: 'checkbox', options: [{ key: 'b' }, { key: 'a' }] })
  })
})
