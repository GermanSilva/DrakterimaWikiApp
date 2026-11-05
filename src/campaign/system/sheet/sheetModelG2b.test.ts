/** G2b: option fields and columns, table calculations, resettable columns, default sort and searchable (validateSheet). */
import { describe, expect, it } from 'vitest'
import { calcFormula, validateSheet, type Item, type Sheet } from './sheetModel'

const base = (): Sheet => ({
  categories: [
    {
      key: 'mecanicas',
      label: 'Mecánicas',
      sections: [
        {
          key: 'atributos',
          label: 'Atributos',
          items: [
            {
              kind: 'table',
              type: 'stat',
              key: 'stats',
              label: 'Stats',
              rows: [
                { key: 'stat_str', label: 'FUE', modifier: 'floor(({valor} - 10) / 2)', editableBy: 'player' },
                { key: 'stat_dex', label: 'DES', modifier: 'floor(({valor} - 10) / 2)', editableBy: 'dm' },
              ],
            },
            {
              kind: 'table',
              type: 'capacidades',
              key: 'skills',
              label: 'Habilidades',
              columns: [{ key: 'bonus', label: 'Bonus', type: 'number', editableBy: 'player' }],
              rows: [{ key: 'skill_athletics', label: 'Atletismo', stat: 'stat_str', use: 'modificador', editableBy: 'player' }],
            },
            { kind: 'field', key: 'nivel_extra', label: 'Extra', type: 'number', editableBy: 'player' },
            { kind: 'field', key: 'prof', label: 'Competencia', type: 'number', formula: '2 + floor(({nivel} - 1) / 4)', editableBy: 'dm' },
          ],
          blocks: [
            { key: 'b1', mode: 'stat', items: ['stats'] },
            { key: 'b2', mode: 'capacidades', items: ['skills'] },
            { key: 'b3', mode: 'tile', items: ['nivel_extra', 'prof'] },
          ],
        },
      ],
    },
  ],
  roles: {},
})

const errorsOf = (sheet: unknown) => {
  const result = validateSheet(sheet)
  return result.ok ? [] : result.errors.map((e) => e.path)
}

const PATH = 'categories[0].sections[0].items'
const section = (sheet: Sheet) => sheet.categories[0].sections[0]
type Loose = Record<string, unknown>
/** Items 0-3 are the base; 4 is the free table `equipo`, 5 the coin table, 6 the item under test. */
const withTables = (): Sheet => {
  const sheet = base()
  section(sheet).items.push(
    {
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
      ],
    },
    { kind: 'table', type: 'monedas', key: 'dinero', label: 'Dinero', rows: [{ key: 'oro', label: 'Oro', value: 100 }, { key: 'bronce', label: 'Bronce', value: 1 }] },
  )
  return sheet
}
const withItem = (item: Loose, sheet: Sheet = withTables()): Sheet => {
  section(sheet).items.push(item as unknown as Item)
  return sheet
}
const equipo = (sheet: Sheet) => section(sheet).items[4] as unknown as { columns: Loose[] } & Loose
const ok = (sheet: unknown): Sheet => {
  const result = validateSheet(sheet)
  expect(result.ok, JSON.stringify(result.ok ? [] : result.errors)).toBe(true)
  return result.ok ? result.sheet : (null as never)
}
const itemAt = (sheet: Sheet, index = 6) => section(sheet).items[index] as unknown as Loose
const withoutUndefined = (raw: Loose): Loose => Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== undefined))

const opts = (...pairs: [string, string, string?][]) => pairs.map(([key, label, formula]) => ({ key, label, ...(formula ? { formula } : {}) }))
const select = (extra: Loose = {}): Loose => ({
  kind: 'field',
  key: 'dado',
  label: 'Dado',
  type: 'options',
  display: 'select',
  options: opts(['d6', 'D6'], ['d8', 'D8', '8'], ['d10', 'D10', '"d" & 10']),
  editableBy: 'player',
  ...extra,
})

describe('option fields (S20)', () => {
  it('accepts a select field and returns it normalised, with only the known option properties', () => {
    const raw = select({ default: 'a', format: 'signed', options: [{ key: 'a', label: ' A ', formula: '1', extra: 1 }, { key: 'b', label: 'B' }], junk: true })
    expect(itemAt(ok(withItem(raw)))).toEqual({
      kind: 'field',
      key: 'dado',
      label: 'Dado',
      type: 'options',
      display: 'select',
      options: [{ key: 'a', label: 'A', formula: '1' }, { key: 'b', label: 'B' }],
      editableBy: 'player',
      format: 'signed',
      default: 'a',
    })
  })

  it('accepts a checkbox with exactly two options', () => {
    const raw = select({ display: 'checkbox', options: opts(['no', 'No'], ['si', 'Sí', '1']) })
    expect(itemAt(ok(withItem(raw)))).toMatchObject({ display: 'checkbox', options: [{ key: 'no', label: 'No' }, { key: 'si', label: 'Sí', formula: '1' }] })
  })

  it('accepts 2 and 20 options, rejects 1 and 21 at the options path', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ key: `o${i}`, label: `O${i}` }))
    ok(withItem(select({ options: many(2) })))
    ok(withItem(select({ options: many(20) })))
    expect(errorsOf(withItem(select({ options: many(1) })))).toEqual([`${PATH}[6].options`])
    expect(errorsOf(withItem(select({ options: many(21) })))).toEqual([`${PATH}[6].options`])
  })

  it.each([
    ['no options', { options: undefined }, 'options'],
    ['options that are not a list', { options: 'a,b' }, 'options'],
    ['an option that is not an object', { options: ['a', { key: 'b', label: 'B' }] }, 'options[0]'],
    ['a repeated option key', { options: opts(['a', 'A'], ['a', 'B']) }, 'options[1].key'],
    ['an option key with the wrong charset', { options: opts(['Bad Key', 'A'], ['b', 'B']) }, 'options[0].key'],
    ['a prototype option key', { options: opts(['a', 'A'], ['constructor', 'B']) }, 'options[1].key'],
    ['an option without a label', { options: [{ key: 'a' }, { key: 'b', label: 'B' }] }, 'options[0].label'],
    ['an option formula that does not parse', { options: opts(['a', 'A'], ['b', 'B', '1 +']) }, 'options[1].formula'],
    ['an option formula that reads nothing known', { options: opts(['a', 'A', '{ghost}'], ['b', 'B']) }, 'options[0].formula'],
    ['an option formula that reads a table as a value', { options: opts(['a', 'A', '{equipo} + 1'], ['b', 'B']) }, 'options[0].formula'],
    ['an option formula naming a column that does not exist', { options: opts(['a', 'A', 'suma({equipo}, "ghost")'], ['b', 'B']) }, 'options[0].formula'],
    ['no display', { display: undefined }, 'display'],
    ['an unknown display', { display: 'radio' }, 'display'],
    ['a checkbox with three options', { display: 'checkbox' }, 'display'],
    ['a default that is not an option key', { default: 'd12' }, 'default'],
    ['a default that is not text', { default: 6 }, 'default'],
    ['a formula on the field itself', { formula: '1', editableBy: 'dm' }, 'formula'],
  ])('rejects %s', (_label, extra, path) => {
    expect(errorsOf(withItem(withoutUndefined({ ...select(), ...extra })))).toEqual([`${PATH}[6].${path}`])
  })

  it('rejects options and display on a field that is not an options field', () => {
    expect(errorsOf(withItem({ kind: 'field', key: 'n', label: 'N', type: 'number', editableBy: 'dm', options: opts(['a', 'A'], ['b', 'B']) }))).toEqual([`${PATH}[6].options`])
    expect(errorsOf(withItem({ kind: 'field', key: 'n', label: 'N', type: 'short', editableBy: 'dm', display: 'select' }))).toEqual([`${PATH}[6].display`])
  })

  it('still rejects format signed on a short field, accepts it on an options field, rejects other formats', () => {
    expect(errorsOf(withItem({ kind: 'field', key: 's', label: 'S', type: 'short', editableBy: 'dm', format: 'signed' }))).toEqual([`${PATH}[6].format`])
    expect(itemAt(ok(withItem(select({ format: 'signed' }))))).toMatchObject({ format: 'signed' })
    expect(errorsOf(withItem(select({ format: 'loud' })))).toEqual([`${PATH}[6].format`])
  })

  it('lets an option formula read fields, rows and tables through functions', () => {
    ok(withItem(select({ options: opts(['a', 'A', '{prof} + {stat_str.modificador} + {skill_athletics.bonus}'], ['b', 'B', 'suma({equipo}, "peso") + suma({dinero}, "value")']) })))
  })

  it('finds a cycle through option formulas, between fields or on itself', () => {
    const sheet = withItem(select({ key: 'uno', options: opts(['a', 'A', '{dos}'], ['b', 'B']) }))
    withItem(select({ key: 'dos', options: opts(['a', 'A'], ['b', 'B', '{uno} + 1']) }), sheet)
    expect(errorsOf(sheet)).toEqual(['categories'])
    expect(errorsOf(withItem(select({ options: opts(['a', 'A', '{dado}'], ['b', 'B']) })))).toEqual(['categories'])
  })

  it('finds a cycle between an option formula and a table column it reads', () => {
    const sheet = withTables()
    equipo(sheet).columns[3].formula = '{peso} + {dado}'
    expect(errorsOf(withItem(select({ options: opts(['a', 'A', 'suma({equipo}, "total")'], ['b', 'B']) }), sheet))).toEqual(['categories'])
  })

  it('is not a number field, so no role can be bound to it', () => {
    const sheet = withItem(select())
    sheet.roles = { hp: 'dado' }
    expect(errorsOf(sheet)).toEqual(['roles.hp'])
  })
})

describe('option columns', () => {
  const skillColumn = (extra: Loose = {}): Loose => ({
    key: 'competencia',
    label: 'Competencia',
    type: 'options',
    display: 'select',
    format: 'signed',
    options: opts(['no', 'No competente', '{modificador} + {prof} * 0'], ['si', 'Competente', '{modificador} + {prof} * 1'], ['ex', 'Experto', '{modificador} + {prof} * 2']),
    editableBy: 'player',
    ...extra,
  })
  const withSkillColumn = (extra: Loose = {}) => {
    const sheet = withTables()
    ;(section(sheet).items[1] as unknown as { columns: unknown[] }).columns.push(withoutUndefined(skillColumn(extra)))
    return sheet
  }
  const COL = `${PATH}[1].columns[1]`

  it('accepts them in a Capacidades table (locals: its columns, {valor} and {modificador}) and keeps them normalised', () => {
    const sheet = ok(withSkillColumn({ default: 'no', junk: 1 }))
    expect((section(sheet).items[1] as unknown as { columns: unknown[] }).columns[1]).toEqual(skillColumn({ default: 'no' }))
    ok(withSkillColumn({ options: opts(['a', 'A', '{bonus} + {valor}'], ['b', 'B']) }))
  })

  it('checks every option formula like a formula of that place', () => {
    expect(errorsOf(withSkillColumn({ options: opts(['a', 'A', '{ghost}'], ['b', 'B']) }))).toEqual([`${COL}.options[0].formula`])
    expect(errorsOf(withSkillColumn({ options: opts(['a', 'A'], ['b', 'B', '{equipo} * 2']) }))).toEqual([`${COL}.options[1].formula`])
  })

  it('applies the option rules to columns too (count, keys, display, default, no column formula)', () => {
    expect(errorsOf(withSkillColumn({ options: opts(['a', 'A']) }))).toEqual([`${COL}.options`])
    expect(errorsOf(withSkillColumn({ options: opts(['a', 'A'], ['a', 'B']) }))).toEqual([`${COL}.options[1].key`])
    expect(errorsOf(withSkillColumn({ display: 'checkbox' }))).toEqual([`${COL}.display`])
    expect(errorsOf(withSkillColumn({ default: 'zz' }))).toEqual([`${COL}.default`])
    expect(errorsOf(withSkillColumn({ options: undefined }))).toEqual([`${COL}.options`])
    expect(errorsOf(withSkillColumn({ formula: '1' }))).toEqual([`${COL}.formula`])
  })

  it('accepts them in Libre and Habilidad tables, where the locals are the columns of the table', () => {
    const sheet = withTables()
    equipo(sheet).columns.push({ key: 'calidad', label: 'Calidad', type: 'options', display: 'select', options: opts(['mala', 'Mala', '{peso} * 1'], ['buena', 'Buena', '{peso} * {cantidad} + {prof} + suma({equipo}, "peso")']), editableBy: 'player' })
    ok(sheet)
    const bad = withTables()
    equipo(bad).columns.push({ key: 'calidad', label: 'Calidad', type: 'options', display: 'select', options: opts(['mala', 'Mala', '{valor}'], ['buena', 'Buena']), editableBy: 'player' })
    expect(errorsOf(bad)).toEqual([`${PATH}[4].columns[4].options[0].formula`])
    const habilidad = withTables()
    withItem({ kind: 'table', type: 'habilidad', key: 'hechizos', label: 'Hechizos', editableBy: 'dm', columns: [{ key: 'nombre', label: 'Nombre', type: 'short', editableBy: 'dm' }, { key: 'escuela', label: 'Escuela', type: 'options', display: 'select', options: opts(['a', 'A'], ['b', 'B']), editableBy: 'dm' }] }, habilidad)
    ok(habilidad)
  })

  it('finds a cycle through an option column of a Libre table, reading itself or through a formula column', () => {
    const sheet = withTables()
    equipo(sheet).columns.push({ key: 'calidad', label: 'Calidad', type: 'options', display: 'select', options: opts(['mala', 'Mala', '{calidad}'], ['buena', 'Buena']), editableBy: 'player' })
    expect(errorsOf(sheet)).toEqual(['categories'])
    const sheet2 = withTables()
    equipo(sheet2).columns.push({ key: 'calidad', label: 'Calidad', type: 'options', display: 'select', options: opts(['mala', 'Mala', '{total}'], ['buena', 'Buena']), editableBy: 'player' })
    equipo(sheet2).columns[3].formula = '{calidad} + 1'
    expect(errorsOf(sheet2)).toEqual(['categories'])
  })

  it('keeps the rule that a table the player edits holds no DM column', () => {
    const sheet = withTables()
    equipo(sheet).columns.push({ key: 'calidad', label: 'Calidad', type: 'options', display: 'select', options: opts(['a', 'A'], ['b', 'B']), editableBy: 'dm' })
    expect(errorsOf(sheet)).toEqual([`${PATH}[4].columns[4].editableBy`])
  })
})

describe('table calculation (S16, S34)', () => {
  const calc = (extra: Loose = {}): Loose => ({ kind: 'field', key: 'calculo', label: 'Cálculo', type: 'number', editableBy: 'dm', calc: { table: 'equipo', column: 'peso', op: 'suma' }, ...extra })

  it.each([
    ['suma', 'number', { table: 'equipo', column: 'peso', op: 'suma' }],
    ['promedio', 'number', { table: 'equipo', column: 'total', op: 'promedio' }],
    ['mayor', 'number', { table: 'equipo', column: 'peso', op: 'mayor' }],
    ['menor', 'number', { table: 'equipo', column: 'peso', op: 'menor' }],
    ['conteo with a column', 'number', { table: 'equipo', column: 'nombre', op: 'conteo' }],
    ['conteo of the rows', 'number', { table: 'equipo', op: 'conteo' }],
    ['mas_frecuente as number', 'number', { table: 'equipo', column: 'peso', op: 'mas_frecuente' }],
    ['mas_frecuente as text', 'short', { table: 'equipo', column: 'nombre', op: 'mas_frecuente' }],
    ['menos_frecuente as text', 'short', { table: 'equipo', column: 'nombre', op: 'menos_frecuente' }],
    ['a coin table column', 'number', { table: 'dinero', column: 'value', op: 'suma' }],
  ])('accepts %s and keeps the calc, without a formula', (_label, type, spec) => {
    const item = itemAt(ok(withItem(calc({ type, calc: { ...spec, junk: 1 } }))))
    expect(item).toEqual({ kind: 'field', key: 'calculo', label: 'Cálculo', type, editableBy: 'dm', calc: spec })
    expect(item).not.toHaveProperty('formula')
  })

  it('compiles to the table functions', () => {
    expect(calcFormula({ table: 'equipo', column: 'peso', op: 'suma' })).toBe('suma({equipo}, "peso")')
    expect(calcFormula({ table: 'equipo', column: 'peso', op: 'promedio' })).toBe('promedio({equipo}, "peso")')
    expect(calcFormula({ table: 'equipo', op: 'conteo' })).toBe('conteo({equipo})')
    expect(calcFormula({ table: 'equipo', column: 'nombre', op: 'conteo' })).toBe('conteo({equipo}, "nombre")')
    expect(calcFormula({ table: 'equipo', column: 'peso', op: 'mayor' })).toBe('mayor({equipo}, "peso")')
    expect(calcFormula({ table: 'equipo', column: 'peso', op: 'menor' })).toBe('menor({equipo}, "peso")')
    expect(calcFormula({ table: 'equipo', column: 'peso', op: 'mas_frecuente' })).toBe('frecuente({equipo}, "peso")')
    expect(calcFormula({ table: 'equipo', column: 'peso', op: 'menos_frecuente' })).toBe('infrecuente({equipo}, "peso")')
  })

  it.each([
    ['a formula as well', { formula: '1' }, 'calc'],
    ['a calc that is not an object', { calc: 'suma' }, 'calc'],
    ['an unknown op', { calc: { table: 'equipo', column: 'peso', op: 'mediana' } }, 'calc.op'],
    ['no op', { calc: { table: 'equipo', column: 'peso' } }, 'calc.op'],
    ['no table', { calc: { column: 'peso', op: 'suma' } }, 'calc.table'],
    ['a table that does not exist', { calc: { table: 'ghost', column: 'peso', op: 'suma' } }, 'calc.table'],
    ['a field as the table', { calc: { table: 'prof', column: 'peso', op: 'suma' } }, 'calc.table'],
    ['a stat table', { calc: { table: 'stats', column: 'x', op: 'suma' } }, 'calc.table'],
    ['a capacidades table', { calc: { table: 'skills', column: 'bonus', op: 'suma' } }, 'calc.table'],
    ['no column for suma', { calc: { table: 'equipo', op: 'suma' } }, 'calc.column'],
    ['no column for mayor', { calc: { table: 'equipo', op: 'mayor' } }, 'calc.column'],
    ['no column for mas_frecuente', { type: 'short', calc: { table: 'equipo', op: 'mas_frecuente' } }, 'calc.column'],
    ['a column that does not exist', { calc: { table: 'equipo', column: 'ghost', op: 'suma' } }, 'calc.column'],
    ['a column that is not text', { calc: { table: 'equipo', column: 5, op: 'suma' } }, 'calc.column'],
    ['a column the coin table does not have', { calc: { table: 'dinero', column: 'total', op: 'suma' } }, 'calc.column'],
    ['a short field for a numeric op', { type: 'short' }, 'type'],
    ['a paragraph field for mas_frecuente', { type: 'paragraph', calc: { table: 'equipo', column: 'nombre', op: 'mas_frecuente' } }, 'type'],
    ['a boolean field for mayor', { type: 'boolean', calc: { table: 'equipo', column: 'peso', op: 'mayor' } }, 'type'],
    ['a short field for conteo', { type: 'short', calc: { table: 'equipo', op: 'conteo' } }, 'type'],
    ['a field the player owns', { editableBy: 'player' }, 'editableBy'],
    ['overridable', { overridable: true }, 'overridable'],
  ])('rejects %s', (_label, extra, path) => {
    expect(errorsOf(withItem(calc(extra)))).toEqual([`${PATH}[6].${path}`])
  })

  it('can be hidden, searchable and signed like any computed number', () => {
    expect(itemAt(ok(withItem(calc({ hidden: true, format: 'signed', searchable: true }))))).toMatchObject({ hidden: true, format: 'signed', searchable: true })
  })

  it('is referenceable by its key from other formulas', () => {
    const sheet = withItem(calc())
    withItem({ kind: 'field', key: 'doble', label: 'Doble', type: 'number', formula: '{calculo} * 2', editableBy: 'dm' }, sheet)
    ok(sheet)
  })

  it('takes part in cycle detection: through a column formula it reads, not through a stored column', () => {
    const sheet = withTables()
    equipo(sheet).columns[3].formula = '{peso} + {calculo}'
    expect(errorsOf(withItem(calc({ calc: { table: 'equipo', column: 'total', op: 'suma' } }), sheet))).toEqual(['categories'])
    const stored = withTables()
    equipo(stored).columns[3].formula = '{peso} + {calculo}'
    ok(withItem(calc({ calc: { table: 'equipo', column: 'peso', op: 'mayor' } }), stored))
  })

  it('also finds a cycle through another formula field', () => {
    const sheet = withTables()
    equipo(sheet).columns[3].formula = '{peso} + {otro}'
    withItem(calc({ calc: { table: 'equipo', column: 'total', op: 'suma' } }), sheet)
    withItem({ kind: 'field', key: 'otro', label: 'Otro', type: 'number', formula: '{calculo}', editableBy: 'dm' }, sheet)
    expect(errorsOf(sheet)).toEqual(['categories'])
  })

  it('accepts a calc over a table defined after it', () => {
    const sheet = base()
    withItem(calc(), sheet)
    section(sheet).items.push(withTables().categories[0].sections[0].items[4])
    ok(sheet)
  })
})

describe('resettable number columns (S16)', () => {
  const resetOf = (reset: unknown, column = 2) => {
    const sheet = withTables()
    equipo(sheet).columns[column].reset = reset
    return sheet
  }
  const RESET = `${PATH}[4].columns[2].reset`

  it.each([
    [{ to: 'zero' }, { to: 'zero' }],
    [{ to: 'value', value: 6 }, { to: 'value', value: 6 }],
    [{ to: 'value', value: 0 }, { to: 'value', value: 0 }],
    [{ to: 'value', value: -2.5 }, { to: 'value', value: -2.5 }],
    [{ to: 'column', column: 'peso' }, { to: 'column', column: 'peso' }],
    [{ to: 'column', column: 'total' }, { to: 'column', column: 'total' }],
    [{ to: 'zero', column: 'peso', value: 3 }, { to: 'zero' }],
  ])('accepts %j on a number column of a Libre table and keeps %j', (reset, kept) => {
    expect(equipo(ok(resetOf(reset))).columns[2].reset).toEqual(kept)
  })

  it.each([
    ['an unknown target', { to: 'max' }],
    ['no target', {}],
    ['not an object', 'zero'],
    ['a column target with no column', { to: 'column' }],
    ['a column that does not exist', { to: 'column', column: 'ghost' }],
    ['the column itself', { to: 'column', column: 'cantidad' }],
    ['a column that is not a number', { to: 'column', column: 'nombre' }],
    ['a value target with no value', { to: 'value' }],
    ['a value that is not a number', { to: 'value', value: '3' }],
    ['an infinite value', { to: 'value', value: Infinity }],
  ])('rejects %s', (_label, reset) => {
    expect(errorsOf(resetOf(reset))).toEqual([RESET])
  })

  it('rejects a reset on a column that is not a custom number column', () => {
    expect(errorsOf(resetOf({ to: 'zero' }, 0))).toEqual([`${PATH}[4].columns[0].reset`]) // short
    expect(errorsOf(resetOf({ to: 'zero' }, 3))).toEqual([`${PATH}[4].columns[3].reset`]) // formula column
  })

  it('rejects a reset on a Capacidades column, accepts it on Habilidad', () => {
    const sheet = withTables()
    ;(section(sheet).items[1] as unknown as { columns: Loose[] }).columns[0].reset = { to: 'zero' }
    expect(errorsOf(sheet)).toEqual([`${PATH}[1].columns[0].reset`])
    const habilidad = withTables()
    withItem({ kind: 'table', type: 'habilidad', key: 'recursos', label: 'Recursos', editableBy: 'dm', columns: [{ key: 'maximo', label: 'Máximo', type: 'number', editableBy: 'dm' }, { key: 'usado', label: 'Usado', type: 'number', reset: { to: 'column', column: 'maximo' }, editableBy: 'dm' }] }, habilidad)
    expect(itemAt(ok(habilidad)) as unknown as { columns: Loose[] }).toMatchObject({ columns: [{}, { reset: { to: 'column', column: 'maximo' } }] })
  })
})

describe('default sort of a table', () => {
  const sorted = (sortBy: unknown) => {
    const sheet = withTables()
    equipo(sheet).sortBy = sortBy
    return sheet
  }

  it('accepts a column of the table and a direction, on Libre and Habilidad', () => {
    expect(equipo(ok(sorted({ column: 'peso', direction: 'desc', junk: 1 }))).sortBy).toEqual({ column: 'peso', direction: 'desc' })
    expect(equipo(ok(sorted({ column: 'total', direction: 'asc' }))).sortBy).toEqual({ column: 'total', direction: 'asc' })
    const habilidad = withTables()
    withItem({ kind: 'table', type: 'habilidad', key: 'hechizos', label: 'Hechizos', editableBy: 'dm', sortBy: { column: 'nombre', direction: 'asc' }, columns: [{ key: 'nombre', label: 'Nombre', type: 'short', editableBy: 'dm' }] }, habilidad)
    expect(itemAt(ok(habilidad)).sortBy).toEqual({ column: 'nombre', direction: 'asc' })
  })

  it.each([
    ['a column that does not exist', { column: 'ghost', direction: 'asc' }, 'sortBy.column'],
    ['no column', { direction: 'asc' }, 'sortBy.column'],
    ['a direction that is not asc or desc', { column: 'peso', direction: 'up' }, 'sortBy.direction'],
    ['no direction', { column: 'peso' }, 'sortBy.direction'],
    ['a sortBy that is not an object', 'peso', 'sortBy'],
  ])('rejects %s', (_label, sortBy, path) => {
    expect(errorsOf(sorted(sortBy))).toEqual([`${PATH}[4].${path}`])
  })

  it('rejects a sortBy on the other kinds of table', () => {
    const sheet = withTables()
    ;(section(sheet).items[1] as unknown as Loose).sortBy = { column: 'bonus', direction: 'asc' }
    ;(section(sheet).items[5] as unknown as Loose).sortBy = { column: 'value', direction: 'asc' }
    ;(section(sheet).items[0] as unknown as Loose).sortBy = { column: 'x', direction: 'asc' }
    expect(errorsOf(sheet).sort()).toEqual([`${PATH}[0].sortBy`, `${PATH}[1].sortBy`, `${PATH}[5].sortBy`])
  })
})

describe('searchable (S27)', () => {
  const field = (type: string, extra: Loose = {}): Loose => ({ kind: 'field', key: 'buscable', label: 'Buscable', type, editableBy: 'player', ...extra })

  it.each(['short', 'number'])('is kept on a %s field, true or false, and absent when not given', (type) => {
    expect(itemAt(ok(withItem(field(type, { searchable: true }))))).toMatchObject({ searchable: true })
    expect(itemAt(ok(withItem(field(type, { searchable: false }))))).toMatchObject({ searchable: false })
    expect(itemAt(ok(withItem(field(type))))).not.toHaveProperty('searchable')
  })

  it.each(['paragraph', 'boolean'])('is rejected on a %s field', (type) => {
    expect(errorsOf(withItem(field(type, { searchable: true })))).toEqual([`${PATH}[6].searchable`])
  })

  it('is rejected on an options field and when it is not a boolean', () => {
    expect(errorsOf(withItem(select({ searchable: true })))).toEqual([`${PATH}[6].searchable`])
    expect(errorsOf(withItem(field('short', { searchable: 'yes' })))).toEqual([`${PATH}[6].searchable`])
    expect(errorsOf(withItem(field('number', { searchable: null })))).toEqual([`${PATH}[6].searchable`])
  })
})

describe('what G2a accepted keeps working', () => {
  it('a sheet with tables and a formula column validates with no new properties added', () => {
    const sheet = ok(withTables())
    expect(equipo(sheet).columns[3]).toMatchObject({ formula: '{peso} * {cantidad}' })
    expect(equipo(sheet)).not.toHaveProperty('sortBy')
    expect(equipo(sheet).columns[2]).not.toHaveProperty('reset')
    expect(equipo(sheet).columns[2]).not.toHaveProperty('options')
  })
})
