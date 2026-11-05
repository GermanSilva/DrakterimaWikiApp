/** G2b: option fields and columns, table calculations, sorted rows and passed-through reset (resolveSheet). */
import { describe, expect, it } from 'vitest'
import { resolveSheet, type ResolvedItem, type ResolvedSheet } from './resolveSheet'
import type { Sheet } from './sheetModel'

type Loose = Record<string, unknown>

const sheetOf = (items: Loose[]): Sheet =>
  ({
    categories: [{ key: 'c', label: 'C', sections: [{ key: 's', label: 'S', items, blocks: [{ key: 'b', mode: 'plano', items: items.map((i) => i.key) }] }] }],
    roles: {},
  }) as unknown as Sheet

const find = (resolved: ResolvedSheet, key: string): ResolvedItem => {
  const found = resolved.sections.flatMap((s) => s.blocks.flatMap((b) => b.items)).find((i) => i.key === key)
  if (!found) throw new Error(`no item ${key}`)
  return found
}
const field = (resolved: ResolvedSheet, key: string) => {
  const item = find(resolved, key)
  if (item.kind !== 'field') throw new Error('not a field')
  return item
}
const rowsOf = (resolved: ResolvedSheet, key: string) => {
  const item = find(resolved, key)
  if (item.kind !== 'rows') throw new Error('not a rows table')
  return item
}
const opts = (...pairs: [string, string, string?][]) => pairs.map(([key, label, formula]) => ({ key, label, ...(formula ? { formula } : {}) }))
const num = (key: string, extra: Loose = {}) => ({ kind: 'field', key, label: key, type: 'number', editableBy: 'dm', ...extra })

describe('option fields (S20)', () => {
  const sheet = sheetOf([
    num('bonus', { default: 2 }),
    { kind: 'field', key: 'fuerza', label: 'Fuerza', type: 'options', display: 'select', editableBy: 'player', default: 'baja', options: opts(['baja', 'Baja'], ['media', 'Media', '{bonus} * 2'], ['alta', 'Alta', '"Mucha " & {bonus}']) },
    { kind: 'field', key: 'firmada', label: 'Firmada', type: 'options', display: 'select', editableBy: 'player', format: 'signed', options: opts(['cero', 'Cero', '{bonus} * 0'], ['uno', 'Uno', '{bonus} * 1'], ['neg', 'Neg', '0 - {bonus}']) },
    { kind: 'field', key: 'sin_defecto', label: 'Sin defecto', type: 'options', display: 'select', editableBy: 'player', options: opts(['a', 'A'], ['b', 'B', '7']) },
    { kind: 'field', key: 'interruptor', label: 'Interruptor', type: 'options', display: 'checkbox', editableBy: 'player', options: opts(['apagado', 'Apagado'], ['encendido', 'Encendido', '1']) },
    { kind: 'field', key: 'rota', label: 'Rota', type: 'options', display: 'select', editableBy: 'player', options: opts(['a', 'A'], ['b', 'B', '{ghost}']) },
    { kind: 'field', key: 'circular', label: 'Circular', type: 'options', display: 'select', editableBy: 'player', options: opts(['a', 'A', '{circular}'], ['b', 'B']) },
    num('suma_fuerza', { formula: '{fuerza} + 1' }),
  ])
  const resolve = (pj: Loose) => resolveSheet(sheet, pj)

  it('resolves to the formula result of the selected option, number or text', () => {
    const resolved = resolve({ fuerza: 'media', bonus: 3 })
    expect(field(resolved, 'fuerza')).toMatchObject({ type: 'options', value: 6, text: '6', error: false, empty: false })
    expect(field(resolve({ fuerza: 'alta', bonus: 3 }), 'fuerza')).toMatchObject({ value: 'Mucha 3', text: 'Mucha 3', error: false })
  })

  it('resolves an option with no formula to its key, shown as its label', () => {
    expect(field(resolve({ fuerza: 'baja' }), 'fuerza')).toMatchObject({ value: 'baja', text: 'Baja', error: false, empty: false })
  })

  it('honours the signed format on numeric results only', () => {
    expect(field(resolve({ firmada: 'uno', bonus: 3 }), 'firmada')).toMatchObject({ value: 3, text: '+3', format: 'signed' })
    expect(field(resolve({ firmada: 'cero', bonus: 3 }), 'firmada')).toMatchObject({ value: 0, text: '+0' })
    expect(field(resolve({ firmada: 'neg', bonus: 3 }), 'firmada')).toMatchObject({ value: -3, text: '-3' })
    expect(field(resolve({ fuerza: 'alta' }), 'fuerza').text).toBe('Mucha 2')
  })

  it('falls back to the default for a missing, unknown or mistyped stored value', () => {
    for (const stored of [undefined, 'ghost', 5, null, true, '']) {
      expect(field(resolve({ fuerza: stored }), 'fuerza'), String(stored)).toMatchObject({ value: 'baja', text: 'Baja', error: false })
    }
  })

  it('is empty (not an error) when nothing is selected and there is no default', () => {
    for (const stored of [undefined, 'ghost']) {
      expect(field(resolve({ sin_defecto: stored }), 'sin_defecto'), String(stored)).toMatchObject({ value: null, text: '', error: false, empty: true })
    }
  })

  it('a checkbox option field is the same: the second option is the checked one', () => {
    expect(field(resolve({ interruptor: 'encendido' }), 'interruptor')).toMatchObject({ value: 1, text: '1', empty: false })
    expect(field(resolve({ interruptor: 'apagado' }), 'interruptor')).toMatchObject({ value: 'apagado', text: 'Apagado' })
  })

  it('reports a formula that cannot be computed as an error, not a throw, and still draws it', () => {
    expect(field(resolve({ rota: 'b' }), 'rota')).toMatchObject({ value: null, text: '', error: true, empty: false })
    expect(field(resolve({ rota: 'a' }), 'rota')).toMatchObject({ value: 'a', text: 'A', error: false })
  })

  it('ends a formula that reads its own field in an error instead of a loop', () => {
    expect(field(resolve({ circular: 'a' }), 'circular')).toMatchObject({ value: null, error: true })
  })

  it('can be read by other formulas through its resolved value', () => {
    expect(field(resolve({ fuerza: 'media', bonus: 3 }), 'suma_fuerza')).toMatchObject({ value: 7, error: false })
    expect(field(resolve({ fuerza: 'baja' }), 'suma_fuerza')).toMatchObject({ value: null, error: true }) // the key is a text
  })
})

describe('option columns', () => {
  const stats = { kind: 'table', type: 'stat', key: 'tabla_stats', label: 'Stats', rows: [{ key: 'stat_car', label: 'CAR', modifier: 'floor(({valor} - 10) / 2)', editableBy: 'dm' }] }
  const habilidades = {
    kind: 'table',
    type: 'capacidades',
    key: 'habilidades',
    label: 'Habilidades',
    columns: [
      {
        key: 'competencia',
        label: 'Competencia',
        type: 'options',
        display: 'select',
        format: 'signed',
        editableBy: 'player',
        default: 'no_competente',
        options: opts(
          ['no_competente', 'No competente', '{modificador} + {bonus_proficiencia} * 0'],
          ['competente', 'Competente', '{modificador} + {bonus_proficiencia} * 1'],
          ['experto', 'Experto', '{modificador} + {bonus_proficiencia} * 2'],
        ),
      },
      { key: 'nota', label: 'Nota', type: 'options', display: 'select', editableBy: 'player', options: opts(['a', 'A', '{competencia} + {valor}'], ['b', 'B']) },
    ],
    rows: [
      { key: 'sk_persuasion', label: 'Persuasión', stat: 'stat_car', use: 'modificador', editableBy: 'player' },
      { key: 'sk_engano', label: 'Engaño', stat: 'stat_car', use: 'modificador', editableBy: 'player' },
      { key: 'sk_intimidar', label: 'Intimidar', stat: 'stat_car', use: 'modificador', editableBy: 'player' },
      { key: 'sk_actuar', label: 'Actuar', stat: 'stat_car', use: 'modificador', editableBy: 'player' },
    ],
  }
  const sheet = sheetOf([stats, num('bonus_proficiencia', { default: 2 }), habilidades])
  const cells = (pj: Loose, row: string) => {
    const table = find(resolveSheet(sheet, pj), 'habilidades')
    if (table.kind !== 'capacidades') throw new Error('not capacidades')
    const found = table.rows.find((r) => r.key === row)
    if (!found) throw new Error(`no row ${row}`)
    return Object.fromEntries(found.cells.map((c) => [c.key, c]))
  }
  // CAR 16: modifier 3; proficiency bonus 2 (the default of the field)
  const pj = { stat_car: 16, sk_persuasion: 'no_competente', sk_engano: 'competente', sk_intimidar: 'experto' }

  it('resolves the S20 example: 3 / 5 / 7 shown as +3 / +5 / +7', () => {
    expect(cells(pj, 'sk_persuasion').competencia).toMatchObject({ type: 'options', format: 'signed', value: 3, text: '+3', error: false })
    expect(cells(pj, 'sk_engano').competencia).toMatchObject({ value: 5, text: '+5' })
    expect(cells(pj, 'sk_intimidar').competencia).toMatchObject({ value: 7, text: '+7' })
  })

  it('uses the default option for a row that has no stored value, and a negative modifier keeps its sign', () => {
    expect(cells(pj, 'sk_actuar').competencia).toMatchObject({ value: 3, text: '+3' })
    expect(cells({ ...pj, stat_car: 6 }, 'sk_engano').competencia).toMatchObject({ value: 0, text: '+0' })
    expect(cells({ ...pj, stat_car: 4 }, 'sk_persuasion').competencia).toMatchObject({ value: -3, text: '-3' })
  })

  it('reads the other columns of the row and the {valor} of the linked stat from an option formula', () => {
    // nota "a" = competencia + valor = 5 + 16
    expect(cells({ ...pj, sk_engano__nota: 'a' }, 'sk_engano').nota).toMatchObject({ value: 21, text: '21' })
    expect(cells({ ...pj, sk_engano__nota: 'b' }, 'sk_engano').nota).toMatchObject({ value: 'b', text: 'B' })
    expect(cells(pj, 'sk_engano').nota).toMatchObject({ value: null, text: '', error: false })
  })

  it('is an error when the stat has no value (the modifier is missing)', () => {
    expect(cells({ sk_engano: 'competente' }, 'sk_engano').competencia).toMatchObject({ value: null, text: '', error: true })
  })

  it('a sheet formula can read it through {row.column}', () => {
    const other = sheetOf([stats, num('bonus_proficiencia', { default: 2 }), habilidades, num('doble', { formula: '{sk_engano.competencia} * 2' })])
    expect(field(resolveSheet(other, pj), 'doble')).toMatchObject({ value: 10, error: false })
  })
})

describe('table calculation (S16, S34)', () => {
  const equipo = {
    kind: 'table',
    type: 'libre',
    key: 'equipo',
    label: 'Equipo',
    editableBy: 'player',
    columns: [
      { key: 'nombre', label: 'Nombre', type: 'short', editableBy: 'player' },
      { key: 'peso', label: 'Peso', type: 'number', editableBy: 'player' },
      { key: 'cantidad', label: 'Cantidad', type: 'number', editableBy: 'player' },
      { key: 'total', label: 'Total', type: 'number', formula: '{peso} * {cantidad}', editableBy: 'player' },
      { key: 'calidad', label: 'Calidad', type: 'options', display: 'select', editableBy: 'player', options: opts(['mala', 'Mala', '{peso} * 1'], ['buena', 'Buena', '{peso} * {cantidad}'], ['rara', 'Rara']) },
    ],
  }
  const dinero = { kind: 'table', type: 'monedas', key: 'dinero', label: 'Dinero', rows: [{ key: 'oro', label: 'Oro', value: 100 }, { key: 'bronce', label: 'Bronce', value: 1 }] }
  const calc = (key: string, spec: Loose, extra: Loose = {}) => ({ kind: 'field', key, label: key, type: 'number', editableBy: 'dm', calc: spec, ...extra })
  const sheet = sheetOf([
    equipo,
    dinero,
    calc('suma_peso', { table: 'equipo', column: 'peso', op: 'suma' }),
    calc('prom_peso', { table: 'equipo', column: 'peso', op: 'promedio' }),
    calc('filas', { table: 'equipo', op: 'conteo' }),
    calc('con_cantidad', { table: 'equipo', column: 'cantidad', op: 'conteo' }),
    calc('mayor_peso', { table: 'equipo', column: 'peso', op: 'mayor' }),
    calc('menor_peso', { table: 'equipo', column: 'peso', op: 'menor' }),
    calc('comun', { table: 'equipo', column: 'nombre', op: 'mas_frecuente' }, { type: 'short' }),
    calc('raro', { table: 'equipo', column: 'nombre', op: 'menos_frecuente' }, { type: 'short' }),
    calc('peso_comun', { table: 'equipo', column: 'peso', op: 'mas_frecuente' }),
    calc('suma_total', { table: 'equipo', column: 'total', op: 'suma' }),
    calc('suma_calidad', { table: 'equipo', column: 'calidad', op: 'suma' }),
    calc('plata', { table: 'dinero', column: 'value', op: 'suma' }),
    calc('firmado', { table: 'equipo', column: 'peso', op: 'suma' }, { format: 'signed' }),
    calc('oculto', { table: 'equipo', column: 'peso', op: 'suma' }, { hidden: true }),
    num('doble', { formula: '{suma_peso} * 2' }),
  ])
  const pj = {
    equipo: [
      { nombre: 'Cuerda', peso: 10, cantidad: 2, calidad: 'buena' },
      { nombre: 'Antorcha', peso: 1, cantidad: 5, calidad: 'mala' },
      { nombre: 'Cuerda', peso: 3, cantidad: 0 },
    ],
  }
  const resolved = resolveSheet(sheet, pj)

  it.each([
    ['suma_peso', 14, '14'],
    ['prom_peso', 14 / 3, '4.67'],
    ['filas', 3, '3'],
    ['con_cantidad', 2, '2'],
    ['mayor_peso', 10, '10'],
    ['menor_peso', 1, '1'],
    ['comun', 'Cuerda', 'Cuerda'],
    ['raro', 'Antorcha', 'Antorcha'],
    ['peso_comun', 10, '10'], // every weight appears once: the first one wins
    ['suma_total', 25, '25'], // over a formula column: 20 + 5 + 0
    ['suma_calidad', 21, '21'], // over an options column: 10 * 2 + 1, the row with no option is skipped
    ['plata', 101, '101'],
    ['firmado', 14, '+14'],
    ['doble', 28, '28'],
  ])('%s resolves to %s (shown %s)', (key, value, text) => {
    expect(field(resolved, key)).toMatchObject({ value, text, error: false, empty: false })
  })

  it('ignores a value stored under the key of a calculation', () => {
    expect(field(resolveSheet(sheet, { ...pj, suma_peso: 999 }), 'suma_peso')).toMatchObject({ value: 14 })
  })

  it('flags a hidden calculation like a hidden formula field', () => {
    expect(field(resolved, 'oculto')).toMatchObject({ hidden: true, value: 14 })
    expect(field(resolved, 'suma_peso')).not.toHaveProperty('hidden')
  })

  it('counts nothing and sums nothing on a table with no rows, and errors where there is nothing to pick', () => {
    const empty = resolveSheet(sheet, {})
    expect(field(empty, 'suma_peso')).toMatchObject({ value: 0, error: false })
    expect(field(empty, 'filas')).toMatchObject({ value: 0, error: false })
    for (const key of ['prom_peso', 'mayor_peso', 'menor_peso', 'comun', 'raro', 'peso_comun']) {
      expect(field(empty, key), key).toMatchObject({ value: null, text: '', error: true, empty: false })
    }
  })

  it('errors on a column it cannot read: a failing formula cell', () => {
    const broken = resolveSheet(sheet, { equipo: [{ nombre: 'x', peso: 1 }] }) // no cantidad: total cannot be computed
    expect(field(broken, 'suma_total')).toMatchObject({ value: null, error: true })
    expect(field(broken, 'suma_peso')).toMatchObject({ value: 1, error: false })
  })

  it('a most repeated text in a number field is an error', () => {
    const odd = sheetOf([equipo, calc('c', { table: 'equipo', column: 'nombre', op: 'mas_frecuente' })])
    expect(field(resolveSheet(odd, pj), 'c')).toMatchObject({ value: null, error: true })
  })
})

describe('default sort of a table', () => {
  const column = (key: string, type: string, extra: Loose = {}) => ({ key, label: key, type, editableBy: 'dm', ...extra })
  const table = (sortBy: Loose | undefined, columns: Loose[]) => ({ kind: 'table', type: 'libre', key: 't', label: 'T', editableBy: 'dm', columns, ...(sortBy ? { sortBy } : {}) })
  const order = (item: Loose, rows: Loose[], key = 'n') => {
    const resolved = resolveSheet(sheetOf([item]), { t: rows })
    return rowsOf(resolved, 't').rows.map((r) => r[key])
  }
  const cols = [column('n', 'number'), column('s', 'short')]

  it('keeps the stored order when there is no sortBy', () => {
    expect(order(table(undefined, cols), [{ n: 3 }, { n: 1 }, { n: 2 }])).toEqual([3, 1, 2])
  })

  it('sorts numbers numerically, ascending and descending, empty cells always last', () => {
    const rows = [{ n: 10, id: 'a' }, { n: 2, id: 'b' }, {}, { n: null }, { n: 33 }, { n: '' }]
    expect(order(table({ column: 'n', direction: 'asc' }, cols), rows)).toEqual([2, 10, 33, undefined, null, ''])
    expect(order(table({ column: 'n', direction: 'desc' }, cols), rows)).toEqual([33, 10, 2, undefined, null, ''])
  })

  it('sorts texts by the Spanish collation', () => {
    const rows = ['zorro', 'árbol', 'Ñandú', 'nube', 'Abeja'].map((s) => ({ s }))
    expect(order(table({ column: 's', direction: 'asc' }, cols), rows, 's')).toEqual(['Abeja', 'árbol', 'nube', 'Ñandú', 'zorro'])
    expect(order(table({ column: 's', direction: 'desc' }, cols), rows, 's')).toEqual(['zorro', 'Ñandú', 'nube', 'árbol', 'Abeja'])
  })

  it('is stable: rows that compare equal keep their stored order, in both directions', () => {
    const rows = [{ n: 1, s: 'a' }, { n: 2, s: 'b' }, { n: 1, s: 'c' }, { n: 2, s: 'd' }]
    expect(order(table({ column: 'n', direction: 'asc' }, cols), rows, 's')).toEqual(['a', 'c', 'b', 'd'])
    expect(order(table({ column: 'n', direction: 'desc' }, cols), rows, 's')).toEqual(['b', 'd', 'a', 'c'])
  })

  it('sorts by a formula column and by an options column (by its resolved value)', () => {
    const formula = [column('a', 'number'), column('b', 'number'), column('p', 'number', { formula: '{a} * {b}' })]
    expect(order(table({ column: 'p', direction: 'desc' }, formula), [{ a: 1, b: 2 }, { a: 5, b: 5 }, { a: 2, b: 2 }], 'p')).toEqual([25, 4, 2])
    const options = [column('a', 'number'), column('o', 'options', { display: 'select', options: opts(['x', 'X', '{a} * 10'], ['y', 'Y', '0 - {a}']) })]
    const resolved = resolveSheet(sheetOf([table({ column: 'o', direction: 'asc' }, options)]), { t: [{ a: 1, o: 'x' }, { a: 2, o: 'y' }, { a: 3, o: 'x' }, { a: 9 }] })
    expect(rowsOf(resolved, 't').rows.map((r) => r.a)).toEqual([2, 1, 3, 9])
  })

  it('sorts a flag column with false before true', () => {
    const flags = [column('f', 'boolean'), column('s', 'short')]
    expect(order(table({ column: 'f', direction: 'asc' }, flags), [{ f: true, s: 'x' }, { f: false, s: 'y' }, { s: 'z' }], 's')).toEqual(['y', 'x', 'z'])
  })

  it('puts the habilidad modal groups in the sorted order too', () => {
    const habilidad = {
      kind: 'table',
      type: 'habilidad',
      key: 't',
      label: 'T',
      editableBy: 'dm',
      sortBy: { column: 'nombre', direction: 'asc' },
      columns: [column('nombre', 'short'), column('categoria', 'short')],
    }
    const modal = {
      categories: [{ key: 'c', label: 'C', sections: [{ key: 's', label: 'S', items: [habilidad], blocks: [{ key: 'b', mode: 'modal', items: ['t'], filterCategories: ['Trucos'] }] }] }],
      roles: {},
    } as unknown as Sheet
    const resolved = resolveSheet(modal, { t: [{ nombre: 'Zap', categoria: 'Trucos' }, { nombre: 'Aura', categoria: 'Trucos' }, { nombre: 'Luz', categoria: 'Otros' }] })
    expect(resolved.sections[0].blocks[0].groups?.[0].rows.map((r) => r.nombre)).toEqual(['Aura', 'Zap'])
  })
})

describe('option columns of a Libre table, reset and untouched behaviour', () => {
  const table = {
    kind: 'table',
    type: 'libre',
    key: 't',
    label: 'T',
    editableBy: 'dm',
    columns: [
      { key: 'peso', label: 'Peso', type: 'number', editableBy: 'dm' },
      { key: 'max', label: 'Máximo', type: 'number', editableBy: 'dm' },
      { key: 'gastado', label: 'Gastado', type: 'number', editableBy: 'dm', reset: { to: 'column', column: 'max' } },
      { key: 'usos', label: 'Usos', type: 'number', editableBy: 'dm', reset: { to: 'value', value: 3 } },
      { key: 'cero', label: 'Cero', type: 'number', editableBy: 'dm', reset: { to: 'zero' } },
      { key: 'calidad', label: 'Calidad', type: 'options', display: 'select', format: 'signed', editableBy: 'dm', default: 'mala', options: opts(['mala', 'Mala', '{peso} * 1'], ['rara', 'Rara']) },
    ],
  }
  const resolved = resolveSheet(sheetOf([table]), { t: [{ peso: 4, calidad: 'mala' }, { peso: 2, calidad: 'rara' }, { peso: 7 }, { peso: 1, calidad: 'ghost' }, 'junk', null] })

  it('resolves an option cell to its value, its display text and whether it failed', () => {
    expect(rowsOf(resolved, 't').rows.map((r) => r.calidad)).toEqual([
      { value: 4, text: '+4', error: false },
      { value: 'rara', text: 'Rara', error: false },
      { value: 7, text: '+7', error: false }, // the default option
      { value: 1, text: '+1', error: false }, // unknown stored key: the default option
    ])
  })

  it('passes the columns through, with their reset, options and display', () => {
    const item = rowsOf(resolved, 't')
    expect(item.columns.map((c) => c.reset)).toEqual([undefined, undefined, { to: 'column', column: 'max' }, { to: 'value', value: 3 }, { to: 'zero' }, undefined])
    expect(item.columns[5]).toMatchObject({ type: 'options', display: 'select', format: 'signed', options: [{ key: 'mala' }, { key: 'rara' }] })
  })

  it('keeps stored cells of the other columns as they were, and the row count', () => {
    const rows = rowsOf(resolved, 't').rows
    expect(rows).toHaveLength(4)
    expect(rows[0]).toMatchObject({ peso: 4 })
    expect(rowsOf(resolved, 't').empty).toBe(false)
    expect(rowsOf(resolveSheet(sheetOf([table]), {}), 't')).toMatchObject({ rows: [], empty: true })
  })

  it('an option column with an error shows an error cell', () => {
    const broken = { ...table, columns: [{ key: 'calidad', label: 'C', type: 'options', display: 'select', editableBy: 'dm', options: opts(['a', 'A', '{ghost}'], ['b', 'B']) }] }
    const rows = rowsOf(resolveSheet(sheetOf([broken]), { t: [{ calidad: 'a' }] }), 't').rows
    expect(rows[0].calidad).toEqual({ value: null, text: '', error: true })
  })
})
