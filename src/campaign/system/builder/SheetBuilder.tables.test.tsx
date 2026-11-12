import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { addField, addTable, click, expectSaved, group, item, itemsOf, section, setup, type } from './builderTestKit'

const col = (g: HTMLElement, name: string) => group(within(g), `Columna ${name}`)
const row = (g: HTMLElement, name: string) => group(within(g), `Fila ${name}`)

describe('Stat tables', () => {
  it('rows get keys from their names; modifier formula with live feedback; editable by', () => {
    const t = setup()
    const g = addTable('stat', 'Atributos')
    click('Agregar fila', within(g))
    type(within(row(g, 'Nuevo stat')).getByLabelText('Nombre de la fila'), 'Fuerza')
    const fuerza = row(g, 'Fuerza')
    expect(within(fuerza).getByLabelText('Clave de la fila')).toHaveValue('fuerza')
    type(within(fuerza).getByLabelText('Fórmula del modificador'), 'floor(({valor} - 10) / 2')
    expect(within(fuerza).getByRole('alert')).toHaveTextContent('No se puede calcular')
    type(within(fuerza).getByLabelText('Fórmula del modificador'), 'floor(({valor} - 10) / 2)')
    expect(within(fuerza).getByRole('status')).toHaveTextContent('Fórmula válida')
    type(within(fuerza).getByLabelText('Valor editable por'), 'player')
    click('Agregar fila', within(g))
    type(within(row(g, 'Nuevo stat')).getByLabelText('Nombre de la fila'), 'Destreza')
    click('Subir fila', within(row(g, 'Destreza')))
    expectSaved(t.sheet(), 'atributos', {
      kind: 'table', type: 'stat', key: 'atributos', label: 'Atributos',
      rows: [
        { key: 'destreza', label: 'Destreza', modifier: '{valor}', editableBy: 'dm' },
        { key: 'fuerza', label: 'Fuerza', modifier: 'floor(({valor} - 10) / 2)', editableBy: 'player' },
      ],
    })
  })
})

describe('Capacidades tables', () => {
  it('rows link to a stat; the columns are free', () => {
    const t = setup()
    const caps = addTable('capacidades', 'Habilidades')
    expect(within(caps).getByText('Primero definí una tabla de stats', { exact: false })).toBeInTheDocument()
    const stats = addTable('stat', 'Atributos')
    click('Agregar fila', within(stats))
    type(within(row(stats, 'Nuevo stat')).getByLabelText('Nombre de la fila'), 'Destreza')
    expect(within(caps).queryByText('Primero definí una tabla de stats', { exact: false })).not.toBeInTheDocument()
    click('Agregar fila', within(caps))
    expect(within(row(caps, 'Nueva capacidad')).getByLabelText('Stat asociado')).toHaveValue('destreza')
    type(within(row(caps, 'Nueva capacidad')).getByLabelText('Nombre de la fila'), 'Sigilo')
    type(within(row(caps, 'Sigilo')).getByLabelText('Usa'), 'valor')
    click('Agregar columna', within(caps))
    type(within(col(caps, 'Nueva columna')).getByLabelText('Nombre de la columna'), 'Bonus')
    type(within(col(caps, 'Bonus')).getByLabelText('Tipo de la columna'), 'number')
    expectSaved(t.sheet(), 'habilidades', {
      kind: 'table', type: 'capacidades', key: 'habilidades', label: 'Habilidades',
      columns: [{ key: 'bonus', label: 'Bonus', type: 'number', editableBy: 'dm' }],
      rows: [{ key: 'sigilo', label: 'Sigilo', stat: 'destreza', use: 'valor', editableBy: 'dm' }],
    })
  })
})

describe('Libre tables', () => {
  it('columns of every type: formula, reset, default, signed and sortBy', () => {
    const t = setup()
    const g = addTable('libre', 'Espacios')
    click('Agregar columna', within(g))
    type(within(col(g, 'Nueva columna')).getByLabelText('Nombre de la columna'), 'Nivel')
    type(within(col(g, 'Nivel')).getByLabelText('Tipo de la columna'), 'number')
    click('Agregar columna', within(g))
    type(within(col(g, 'Nueva columna')).getByLabelText('Nombre de la columna'), 'Total')
    type(within(col(g, 'Total')).getByLabelText('Tipo de la columna'), 'number')
    click('Agregar columna', within(g))
    type(within(col(g, 'Nueva columna')).getByLabelText('Nombre de la columna'), 'Gastados')
    type(within(col(g, 'Gastados')).getByLabelText('Tipo de la columna'), 'number')
    type(within(col(g, 'Gastados')).getByLabelText('Reinicio de la columna'), 'column')
    type(within(col(g, 'Gastados')).getByLabelText('Columna de reinicio'), 'total')
    click('Agregar columna', within(g))
    type(within(col(g, 'Nueva columna')).getByLabelText('Nombre de la columna'), 'Libres')
    type(within(col(g, 'Libres')).getByLabelText('Tipo de la columna'), 'number')
    type(within(col(g, 'Libres')).getByLabelText('Origen de la columna'), 'formula')
    expect(within(col(g, 'Libres')).queryByLabelText('Reinicio de la columna')).not.toBeInTheDocument()
    type(within(col(g, 'Libres')).getByLabelText('Fórmula de la columna'), '{total} - {gastados}')
    fireEvent.click(within(col(g, 'Libres')).getByLabelText('Mostrar con signo (columna)'))
    click('Agregar columna', within(g))
    type(within(col(g, 'Nueva columna')).getByLabelText('Nombre de la columna'), 'Veces')
    type(within(col(g, 'Veces')).getByLabelText('Tipo de la columna'), 'number')
    type(within(col(g, 'Veces')).getByLabelText('Reinicio de la columna'), 'value')
    type(within(col(g, 'Veces')).getByLabelText('Valor de reinicio'), '3')
    type(within(col(g, 'Veces')).getByLabelText('Valor por defecto de la columna'), '1')
    type(within(g).getByLabelText('Ordenar por columna'), 'nivel')
    type(within(g).getByLabelText('Dirección'), 'desc')
    type(within(g).getByLabelText('Editable por'), 'player')
    // a player table cannot hold a DM column: every column goes to the player
    for (const name of ['Nombre', 'Nivel', 'Total', 'Gastados', 'Libres', 'Veces']) type(within(col(g, name)).getByLabelText('Editable por (columna)'), 'player')
    expectSaved(t.sheet(), 'espacios', {
      kind: 'table', type: 'libre', key: 'espacios', label: 'Espacios', editableBy: 'player', sortBy: { column: 'nivel', direction: 'desc' },
      columns: [
        { key: 'nombre', label: 'Nombre', type: 'short', editableBy: 'player' },
        { key: 'nivel', label: 'Nivel', type: 'number', editableBy: 'player' },
        { key: 'total', label: 'Total', type: 'number', editableBy: 'player' },
        { key: 'gastados', label: 'Gastados', type: 'number', editableBy: 'player', reset: { to: 'column', column: 'total' } },
        { key: 'libres', label: 'Libres', type: 'number', editableBy: 'player', formula: '{total} - {gastados}', format: 'signed' },
        { key: 'veces', label: 'Veces', type: 'number', editableBy: 'player', reset: { to: 'value', value: 3 }, default: 1 },
      ],
    })
  })

  it('a column can be an options column with its own formulas, and be reordered and removed', () => {
    const t = setup()
    const g = addTable('libre', 'Rasgos')
    click('Agregar columna', within(g))
    type(within(col(g, 'Nueva columna')).getByLabelText('Tipo de la columna'), 'options')
    type(within(col(g, 'Nueva columna')).getByLabelText('Nombre de la columna'), 'Nivel de dominio')
    expect(within(col(g, 'Nivel de dominio')).getAllByRole('group', { name: /^Opción / })).toHaveLength(2)
    click('Subir columna', within(col(g, 'Nivel de dominio')))
    expect(itemsOf(t.sheet())[0]).toMatchObject({ columns: [{ key: 'nivel_de_dominio' }, { key: 'nombre' }] })
    click('Quitar columna', within(col(g, 'Nivel de dominio')))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument() // added in this session
    expect(itemsOf(t.sheet())[0]).toMatchObject({ columns: [{ key: 'nombre' }] })
  })
})

describe('Habilidad tables', () => {
  it('start with Nombre and Categoría; columns choose a scope; categories are declared in order', () => {
    const t = setup()
    const g = addTable('habilidad', 'Hechizos')
    expect(within(g).getAllByRole('group', { name: /^Columna / }).map((c) => c.getAttribute('aria-label'))).toEqual(['Columna Nombre', 'Columna Categoría'])
    click('Agregar columna', within(g))
    type(within(col(g, 'Nueva columna')).getByLabelText('Nombre de la columna'), 'Preparado')
    type(within(col(g, 'Preparado')).getByLabelText('Tipo de la columna'), 'boolean')
    type(within(col(g, 'Preparado')).getByLabelText('Pertenece a'), 'character')
    click('Agregar categoría de acciones', within(g))
    type(within(group(within(g), 'Categoría de acciones Nueva categoría de acciones')).getByLabelText('Nombre de la categoría de acciones'), 'Trucos')
    click('Agregar categoría de acciones', within(g))
    type(within(group(within(g), 'Categoría de acciones Nueva categoría de acciones')).getByLabelText('Nombre de la categoría de acciones'), 'Nivel 1')
    click('Subir categoría de acciones', within(group(within(g), 'Categoría de acciones Nivel 1')))
    expectSaved(t.sheet(), 'hechizos', {
      kind: 'table', type: 'habilidad', key: 'hechizos', label: 'Hechizos', editableBy: 'dm',
      columns: [
        { key: 'nombre', label: 'Nombre', type: 'short', editableBy: 'dm' },
        { key: 'categoria', label: 'Categoría', type: 'short', editableBy: 'dm' },
        { key: 'preparado', label: 'Preparado', type: 'boolean', editableBy: 'dm', scope: 'character' },
      ],
      categories: [{ key: 'nivel_1', label: 'Nivel 1' }, { key: 'trucos', label: 'Trucos' }],
    })
  })

  it('a formula column has no scope to choose', () => {
    setup()
    const g = addTable('habilidad', 'Hechizos')
    expect(within(col(g, 'Nombre')).getByLabelText('Pertenece a')).toHaveValue('entry')
    click('Agregar columna', within(g))
    type(within(col(g, 'Nueva columna')).getByLabelText('Tipo de la columna'), 'number')
    type(within(col(g, 'Nueva columna')).getByLabelText('Origen de la columna'), 'formula')
    expect(within(col(g, 'Nueva columna')).queryByLabelText('Pertenece a')).not.toBeInTheDocument()
  })
})

describe('coin and economy tables (S8: configured in Sistema and Juegos, the builder only places them)', () => {
  const ECONOMY_SHEET = {
    categories: [
      {
        key: 'c',
        label: 'C',
        sections: [
          {
            key: 's',
            label: 'S',
            items: [
              { kind: 'table', type: 'monedas', key: 'bolsa', label: 'Bolsa', rows: [{ key: 'oro', label: 'Oro', value: 100 }, { key: 'bronce', label: 'Bronce', value: 1 }], rewardDestination: true },
              { kind: 'table', type: 'economia', key: 'banco', label: 'Banco', editableBy: 'dm' },
            ],
            blocks: [{ key: 'dinero', title: 'Dinero', mode: 'plano', items: ['bolsa', 'banco'] }],
          },
          { key: 'otra', label: 'Otra', items: [], blocks: [] },
        ],
      },
    ],
    roles: {},
  }

  it('does not offer coin or economy tables when adding a table', () => {
    setup()
    const options = within(within(section('S')).getByLabelText('Tipo de tabla')).getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['Stat', 'Capacidades', 'Habilidad', 'Libre'])
  })

  it('shows no denominations editor and no reward-destination check, only a note that points to Sistema', () => {
    setup(ECONOMY_SHEET)
    for (const name of ['Bolsa', 'Banco']) {
      click('Editar ítem', within(item(name)))
      const g = item(name)
      expect(within(g).queryByRole('button', { name: 'Agregar fila' })).toBeNull()
      expect(within(g).queryByLabelText('Destino de recompensa')).toBeNull()
      expect(within(g).queryByLabelText('Nombre del ítem')).toBeNull()
      expect(within(g).getByText('Las monedas y las instancias se configuran en Sistema › Economía.')).toBeInTheDocument()
      expect(within(g).queryByRole('button', { name: 'Quitar ítem' })).toBeNull()
    }
  })

  it('still moves a coin table inside its section and keeps its denominations, destination and block untouched', () => {
    const t = setup(ECONOMY_SHEET)
    click('Subir ítem', within(item('Banco')))
    const sheet = t.sheet()
    expect(itemsOf(sheet).map((i) => i.key)).toEqual(['banco', 'bolsa'])
    expect(itemsOf(sheet).find((i) => i.key === 'bolsa')).toEqual(ECONOMY_SHEET.categories[0].sections[0].items[0])
  })

  it('refuses to remove a section that holds an economy table, and says where to delete the instance', () => {
    const t = setup(ECONOMY_SHEET)
    click('Quitar sección', within(section('S')))
    expect(screen.getByRole('alert', { name: 'No se pudo quitar' })).toHaveTextContent('Eliminá antes las instancias de economía en Sistema › Economía')
    expect(itemsOf(t.sheet()).map((i) => i.key)).toEqual(['bolsa', 'banco'])
    click('Quitar sección', within(section('Otra'))) // a section without economy still goes
    expect(screen.queryByRole('group', { name: 'Sección Otra' })).toBeNull()
  })

  it('keeps the card pin of a coin table (display is still the builder\'s)', () => {
    const t = setup({ ...ECONOMY_SHEET, card: { pinned: [{ key: 'bolsa' }] } })
    expect((t.sheet().card as { pinned: { key: string }[] }).pinned.map((p) => p.key)).toEqual(['bolsa'])
  })
})

describe('keys of saved rows, columns and tables', () => {
  it('stay read-only', () => {
    setup({
      categories: [{ key: 'c', label: 'C', sections: [{ key: 's', label: 'S', blocks: [], items: [{ kind: 'table', type: 'libre', key: 'inv', label: 'Inv', editableBy: 'dm', columns: [{ key: 'peso', label: 'Peso', type: 'number', editableBy: 'dm' }] }] }] }],
      roles: {},
    })
    click('Editar ítem', within(screen.getByRole('group', { name: 'Ítem Inv' })))
    const g = screen.getByRole('group', { name: 'Ítem Inv' })
    expect(within(g).getByLabelText('Clave del ítem')).toHaveAttribute('readonly')
    expect(within(col(g, 'Peso')).getByLabelText('Clave de la columna')).toHaveAttribute('readonly')
    expect(within(col(g, 'Peso')).getByLabelText('Tipo de la columna')).toBeDisabled()
    addField('Otro') // adding elsewhere leaves them alone
    expect(within(col(g, 'Peso')).getByLabelText('Clave de la columna')).toHaveValue('peso')
  })
})
