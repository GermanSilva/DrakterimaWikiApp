import { describe, expect, it } from 'vitest'
import { validateSheet, type Item, type Sheet } from './sheetModel'

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

describe('validateSheet', () => {
  it('accepts a well formed sheet and returns it normalised', () => {
    const result = validateSheet(base())
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.sheet.categories[0].sections[0].items).toHaveLength(4)
  })

  it('rejects anything that is not an object with categories', () => {
    expect(validateSheet(null).ok).toBe(false)
    expect(validateSheet([]).ok).toBe(false)
    expect(validateSheet({ roles: {} }).ok).toBe(false)
  })

  it('ignores unknown properties instead of keeping them', () => {
    const sheet = { ...base(), extra: 'x' } as unknown
    const result = validateSheet(sheet)
    expect(result.ok).toBe(true)
    if (result.ok) expect(Object.keys(result.sheet).sort()).toEqual(['categories', 'roles'])
  })

  describe('keys', () => {
    it.each(['Stat', '1abc', 'a b', 'a-b', '', 'x'.repeat(41), '__proto__', 'constructor', 'prototype'])('rejects the key %j', (key) => {
      const sheet = base()
      sheet.categories[0].sections[0].items[2] = { kind: 'field', key, label: 'X', type: 'number', editableBy: 'player' }
      expect(validateSheet(sheet).ok).toBe(false)
    })

    it.each(['nombre', 'jugador', 'imagen_url', 'visible_to', 'monedas', 'monedas_guardado', 'notas', 'sections_updated', 'id', 'nivel', 'clase', 'raza', 'estado', 'owner_id'])(
      'rejects the key %s because the application owns it',
      (key) => {
        const sheet = base()
        sheet.categories[0].sections[0].items[2] = { kind: 'field', key, label: 'X', type: 'number', editableBy: 'player' }
        expect(validateSheet(sheet).ok).toBe(false)
      },
    )

    it('rejects a key repeated across items, rows and categories', () => {
      const sheet = base()
      sheet.categories[0].sections[0].items[2] = { kind: 'field', key: 'stat_str', label: 'X', type: 'number', editableBy: 'player' }
      expect(errorsOf(sheet)).toContain('categories[0].sections[0].items[2].key')
    })

    it('accepts application-owned names as column keys, since a column lives inside a row', () => {
      const sheet = base()
      const table = sheet.categories[0].sections[0].items[1]
      if (table.kind === 'table' && table.type === 'capacidades') {
        table.columns.push({ key: 'nombre', label: 'Nombre', type: 'short', editableBy: 'dm' })
      }
      expect(validateSheet(sheet).ok).toBe(true)
    })

    it('still rejects prototype names as column keys', () => {
      const sheet = base()
      const table = sheet.categories[0].sections[0].items[1]
      if (table.kind === 'table' && table.type === 'capacidades') {
        table.columns.push({ key: 'constructor', label: 'X', type: 'short', editableBy: 'dm' })
      }
      expect(validateSheet(sheet).ok).toBe(false)
    })

    it('rejects a repeated column key inside one table', () => {
      const sheet = base()
      const table = sheet.categories[0].sections[0].items[1]
      if (table.kind === 'table' && table.type === 'capacidades') {
        table.columns.push({ key: 'bonus', label: 'Otro', type: 'number', editableBy: 'dm' })
      }
      expect(validateSheet(sheet).ok).toBe(false)
    })
  })

  describe('verifier findings', () => {
    it('accepts a tab inside a formula', () => {
      const sheet = base()
      const field = sheet.categories[0].sections[0].items[3]
      if (field.kind === 'field') field.formula = '2 +	1'
      expect(validateSheet(sheet).ok).toBe(true)
    })

    it('rejects a top level key with a double underscore (it is the row/column separator in data)', () => {
      const sheet = base()
      sheet.categories[0].sections[0].items[2] = { kind: 'field', key: 'skill_athletics__bonus', label: 'X', type: 'number', editableBy: 'player' }
      expect(errorsOf(sheet)).toContain('categories[0].sections[0].items[2].key')
    })

    it('rejects a sheet over the size cap before walking it', () => {
      const sheet = base()
      sheet.categories[0].label = 'x'.repeat(50000)
      expect(errorsOf(sheet)).toContain('')
    })

    it('measures a text default in characters, not UTF-16 units', () => {
      const sheet = base()
      const field = (default_: string): Sheet['categories'][number]['sections'][number]['items'][number] => ({ kind: 'field', key: 'nivel_extra', label: 'Extra', type: 'short', editableBy: 'dm', default: default_ })
      sheet.categories[0].sections[0].items[2] = field('😀'.repeat(2001))
      expect(validateSheet(sheet).ok).toBe(true)
      sheet.categories[0].sections[0].items[2] = field('😀'.repeat(4001))
      expect(validateSheet(sheet).ok).toBe(false)
    })
  })

  describe('F3 findings (access rules)', () => {
    it('rejects the key custom_fields: the guard always opens that legacy key to players', () => {
      const sheet = base()
      sheet.categories[0].sections[0].items[2] = { kind: 'field', key: 'custom_fields', label: 'X', type: 'short', editableBy: 'dm' }
      expect(errorsOf(sheet)).toContain('categories[0].sections[0].items[2].key')
    })

    it('rejects a section keyed dm: its unread stamp is frozen for players', () => {
      const sheet = base()
      sheet.categories[0].sections[0].key = 'dm'
      expect(errorsOf(sheet)).toContain('categories[0].sections[0].key')
    })

    it('rejects a DM column inside a table that the player may edit', () => {
      const sheet = base()
      sheet.categories[0].sections[0].items[2] = {
        kind: 'table',
        type: 'libre',
        key: 'inv',
        label: 'Inv',
        columns: [{ key: 'price', label: 'Price', type: 'number', editableBy: 'dm' }],
        editableBy: 'player',
      }
      expect(errorsOf(sheet)).toContain('categories[0].sections[0].items[2].columns[0].editableBy')
    })

    it('accepts a DM column inside a table only the DM edits', () => {
      const sheet = base()
      sheet.categories[0].sections[0].items[2] = {
        kind: 'table',
        type: 'libre',
        key: 'inv',
        label: 'Inv',
        columns: [{ key: 'price', label: 'Price', type: 'number', editableBy: 'dm' }],
        editableBy: 'dm',
      }
      sheet.categories[0].sections[0].blocks[2].items = ['prof'] // the replaced field is no longer there
      const result = validateSheet(sheet)
      expect(result.ok, JSON.stringify(result.ok ? [] : result.errors)).toBe(true)
    })
  })

  describe('F4 refinements', () => {
    const skills = (sheet: Sheet) => {
      const table = sheet.categories[0].sections[0].items[1]
      if (table.kind !== 'table' || table.type !== 'capacidades') throw new Error('fixture changed')
      return table
    }
    const prof = (sheet: Sheet) => {
      const field = sheet.categories[0].sections[0].items[3]
      if (field.kind !== 'field') throw new Error('fixture changed')
      return field
    }

    it.each(['{modificador}', '{valor}'])('lets a capacidades column formula read the linked stat through %s', (ref) => {
      const sheet = base()
      skills(sheet).columns.push({ key: 'total', label: 'Total', type: 'number', formula: `${ref} + {bonus}`, editableBy: 'dm' })
      const result = validateSheet(sheet)
      expect(result.ok, JSON.stringify(result.ok ? [] : result.errors)).toBe(true)
    })

    it('does not let a free table column read a linked stat (it has none)', () => {
      const sheet = base()
      sheet.categories[0].sections[0].items[2] = {
        kind: 'table',
        type: 'libre',
        key: 'inv',
        label: 'Inv',
        columns: [{ key: 'total', label: 'T', type: 'number', formula: '{modificador}', editableBy: 'dm' }],
        editableBy: 'dm',
      }
      sheet.categories[0].sections[0].blocks[2].items = ['prof']
      expect(errorsOf(sheet)).toContain('categories[0].sections[0].items[2].columns[0].formula')
    })

    it('does not let a plain field formula read {modificador}', () => {
      const sheet = base()
      prof(sheet).formula = '{modificador} + 1'
      expect(errorsOf(sheet)).toContain('categories[0].sections[0].items[3].formula')
    })

    it('keeps an overridable formula field as it came', () => {
      const sheet = base()
      prof(sheet).overridable = true
      const result = validateSheet(sheet)
      expect(result.ok && (result.sheet.categories[0].sections[0].items[3] as { overridable?: boolean }).overridable).toBe(true)
    })

    it('rejects overridable on a field with no formula, or with a non boolean value', () => {
      const sheet = base()
      const plain = sheet.categories[0].sections[0].items[2]
      if (plain.kind === 'field') plain.overridable = true
      expect(errorsOf(sheet)).toContain('categories[0].sections[0].items[2].overridable')
      const odd = base()
      ;(prof(odd) as unknown as { overridable: unknown }).overridable = 'yes'
      expect(errorsOf(odd)).toContain('categories[0].sections[0].items[3].overridable')
    })

    it('accepts format signed on number fields and columns and keeps it', () => {
      const sheet = base()
      prof(sheet).format = 'signed'
      skills(sheet).columns[0].format = 'signed'
      const result = validateSheet(sheet)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect((result.sheet.categories[0].sections[0].items[3] as { format?: string }).format).toBe('signed')
        const table = result.sheet.categories[0].sections[0].items[1]
        expect(table.kind === 'table' && table.type === 'capacidades' && table.columns[0].format).toBe('signed')
      }
    })

    it('keeps a column default and checks it against the column type', () => {
      const sheet = base()
      skills(sheet).columns[0].default = 0
      const result = validateSheet(sheet)
      const table = result.ok ? result.sheet.categories[0].sections[0].items[1] : undefined
      expect(table && table.kind === 'table' && table.type === 'capacidades' && table.columns[0].default).toBe(0)
      const odd = base()
      ;(skills(odd).columns[0] as unknown as { default: unknown }).default = 'zero'
      expect(errorsOf(odd)).toContain('categories[0].sections[0].items[1].columns[0].default')
    })

    it('rejects an unknown format, or a format on a text field', () => {
      const sheet = base()
      ;(prof(sheet) as unknown as { format: string }).format = 'bold'
      expect(errorsOf(sheet)).toContain('categories[0].sections[0].items[3].format')
      const text = base()
      text.categories[0].sections[0].items[2] = { kind: 'field', key: 'bio', label: 'Bio', type: 'short', editableBy: 'dm', format: 'signed' }
      text.categories[0].sections[0].blocks[2].items = ['prof']
      expect(errorsOf(text)).toContain('categories[0].sections[0].items[2].format')
    })
  })

  describe('labels', () => {
    it.each(['', '   ', 'x'.repeat(61), 'a\u200bb', 'a\u202eb'])('rejects the label %j', (label) => {
      const sheet = base()
      sheet.categories[0].label = label
      expect(errorsOf(sheet)).toContain('categories[0].label')
    })

    it('trims the label it keeps', () => {
      const sheet = base()
      sheet.categories[0].label = '  Mecánicas  '
      const result = validateSheet(sheet)
      expect(result.ok && result.sheet.categories[0].label).toBe('Mecánicas')
    })
  })

  describe('limits', () => {
    it('rejects more than 12 categories', () => {
      const sheet = base()
      sheet.categories = Array.from({ length: 13 }, (_, i) => ({ key: `cat${i}`, label: `C${i}`, sections: [] }))
      expect(validateSheet(sheet).ok).toBe(false)
    })

    it('rejects more than 100 rows in a table', () => {
      const sheet = base()
      const table = sheet.categories[0].sections[0].items[0]
      if (table.kind === 'table' && table.type === 'stat') {
        table.rows = Array.from({ length: 101 }, (_, i) => ({ key: `r${i}`, label: `R${i}`, modifier: '0', editableBy: 'dm' as const }))
      }
      expect(validateSheet(sheet).ok).toBe(false)
    })
  })

  describe('structure rules (S11)', () => {
    it('rejects a capacidad that points to a stat row that does not exist', () => {
      const sheet = base()
      const table = sheet.categories[0].sections[0].items[1]
      if (table.kind === 'table' && table.type === 'capacidades') table.rows[0].stat = 'stat_nope'
      expect(errorsOf(sheet)).toContain('categories[0].sections[0].items[1].rows[0].stat')
    })

    it('rejects an editableBy that is neither dm nor player', () => {
      const sheet = base()
      const table = sheet.categories[0].sections[0].items[0]
      if (table.kind === 'table' && table.type === 'stat') (table.rows[0] as { editableBy: string }).editableBy = 'owner'
      expect(validateSheet(sheet).ok).toBe(false)
    })
  })

  describe('formulas', () => {
    it('rejects a formula that does not parse', () => {
      const sheet = base()
      const field = sheet.categories[0].sections[0].items[3]
      if (field.kind === 'field') field.formula = '2 +'
      expect(errorsOf(sheet)).toContain('categories[0].sections[0].items[3].formula')
    })

    it('rejects a formula that references something that does not exist', () => {
      const sheet = base()
      const field = sheet.categories[0].sections[0].items[3]
      if (field.kind === 'field') field.formula = '{ghost} + 1'
      expect(validateSheet(sheet).ok).toBe(false)
    })

    it('accepts references to fields, rows, row columns and nivel', () => {
      const sheet = base()
      const field = sheet.categories[0].sections[0].items[3]
      if (field.kind === 'field') field.formula = '{nivel} + {stat_str} + {nivel_extra} + {stat_str.modificador}'
      expect(validateSheet(sheet).ok).toBe(true)
    })

    it('rejects a cycle between formulas', () => {
      const sheet = base()
      const items = sheet.categories[0].sections[0].items
      items.push({ kind: 'field', key: 'ca', label: 'A', type: 'number', formula: '{cb} + 1', editableBy: 'dm' })
      items.push({ kind: 'field', key: 'cb', label: 'B', type: 'number', formula: '{ca} + 1', editableBy: 'dm' })
      expect(validateSheet(sheet).ok).toBe(false)
    })

    it('rejects a formula on a paragraph or boolean-less text field', () => {
      const sheet = base()
      sheet.categories[0].sections[0].items[2] = { kind: 'field', key: 'bio', label: 'Bio', type: 'paragraph', formula: '1', editableBy: 'dm' }
      expect(validateSheet(sheet).ok).toBe(false)
    })

    it('rejects a formula field that the player can edit', () => {
      const sheet = base()
      const field = sheet.categories[0].sections[0].items[3]
      if (field.kind === 'field') field.editableBy = 'player'
      expect(validateSheet(sheet).ok).toBe(false)
    })
  })

  describe('blocks', () => {
    it('rejects a block that lists an item that is not in the section', () => {
      const sheet = base()
      sheet.categories[0].sections[0].blocks[0].items = ['ghost']
      expect(validateSheet(sheet).ok).toBe(false)
    })

    it('rejects a display mode that does not fit the item kind', () => {
      const sheet = base()
      sheet.categories[0].sections[0].blocks[0] = { key: 'b1', mode: 'tile', items: ['stats'] }
      expect(validateSheet(sheet).ok).toBe(false)
    })

    it('rejects an item shown by two blocks', () => {
      const sheet = base()
      sheet.categories[0].sections[0].blocks.push({ key: 'b4', mode: 'plano', items: ['nivel_extra'] })
      expect(validateSheet(sheet).ok).toBe(false)
    })

    it('requires a modal block to name the categories it filters', () => {
      const sheet = base()
      const section = sheet.categories[0].sections[0]
      section.items.push({
        kind: 'table',
        type: 'habilidad',
        key: 'hechizos',
        label: 'Hechizos',
        columns: [{ key: 'nivel_h', label: 'Nivel', type: 'number', editableBy: 'player' }],
        editableBy: 'player',
      })
      section.blocks.push({ key: 'b5', mode: 'modal', items: ['hechizos'] })
      expect(validateSheet(sheet).ok).toBe(false)
      section.blocks[3] = { key: 'b5', mode: 'modal', items: ['hechizos'], filterCategories: ['Nivel 1'] }
      expect(validateSheet(sheet).ok).toBe(true)
    })
  })

  describe('coins (S12, S14)', () => {
    const withCoins = (rows: { key: string; label: string; value: number }[]) => {
      const sheet = base()
      sheet.categories[0].sections[0].items.push({ kind: 'table', type: 'monedas', key: 'dinero', label: 'Dinero', rows })
      return sheet
    }

    it('accepts denominations whose smallest value is 1', () => {
      expect(
        validateSheet(
          withCoins([
            { key: 'oro', label: 'Oro', value: 10000 },
            { key: 'plata', label: 'Plata', value: 100 },
            { key: 'bronce', label: 'Bronce', value: 1 },
          ]),
        ).ok,
      ).toBe(true)
    })

    it('accepts an unconfigured coin table (no denominations yet)', () => {
      expect(validateSheet(withCoins([])).ok).toBe(true)
    })

    it.each([
      ['a smallest value other than 1', [{ key: 'oro', label: 'Oro', value: 10 }]],
      ['a non integer value', [{ key: 'oro', label: 'Oro', value: 1.5 }, { key: 'b', label: 'B', value: 1 }]],
      ['a zero value', [{ key: 'oro', label: 'Oro', value: 0 }, { key: 'b', label: 'B', value: 1 }]],
      ['a negative value', [{ key: 'oro', label: 'Oro', value: -5 }, { key: 'b', label: 'B', value: 1 }]],
      ['a huge value', [{ key: 'oro', label: 'Oro', value: 1e12 }, { key: 'b', label: 'B', value: 1 }]],
      ['a repeated value', [{ key: 'oro', label: 'Oro', value: 5 }, { key: 'plata', label: 'P', value: 5 }, { key: 'b', label: 'B', value: 1 }]],
      ['more than 8 denominations', Array.from({ length: 9 }, (_, i) => ({ key: `m${i}`, label: `M${i}`, value: i === 0 ? 1 : i + 1 }))],
    ])('rejects %s', (_label, rows) => {
      expect(validateSheet(withCoins(rows)).ok).toBe(false)
    })

    it('rejects a second coin table', () => {
      const sheet = withCoins([{ key: 'b', label: 'B', value: 1 }])
      sheet.categories[0].sections[0].items.push({ kind: 'table', type: 'monedas', key: 'dinero2', label: 'Dinero 2', rows: [] })
      expect(validateSheet(sheet).ok).toBe(false)
    })
  })

  describe('roles', () => {
    it('accepts a role bound to an existing field', () => {
      const sheet = base()
      sheet.roles = { hp: 'nivel_extra' }
      expect(validateSheet(sheet).ok).toBe(true)
    })

    it('rejects a role bound to a missing field or an unknown role', () => {
      const sheet = base()
      sheet.roles = { hp: 'ghost' }
      expect(validateSheet(sheet).ok).toBe(false)
      expect((validateSheet({ ...base(), roles: { nonsense: 'nivel_extra' } }) as { ok: boolean }).ok).toBe(false)
    })
  })
})

describe('G2a: text formulas, hidden fields and table references', () => {
  const section = (sheet: Sheet) => sheet.categories[0].sections[0]
  const PATH = 'categories[0].sections[0].items'
  /** The base sheet plus a free table of equipment (row formula column) and the coin table. */
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
  const field = (formula: string, extra: Record<string, unknown> = {}): Item =>
    ({ kind: 'field', key: 'calc', label: 'Calc', type: 'number', formula, editableBy: 'dm', ...extra }) as Item
  const withField = (sheet: Sheet, item: Item): Sheet => {
    section(sheet).items.push(item)
    return sheet
  }
  // items 0-3 are the base, 4 equipo, 5 dinero, 6 the field under test
  const calcPath = `${PATH}[6].formula`

  describe('text formulas', () => {
    it.each(['"x"', '{prof} & ""', 'signo({prof})', '{prof} & "/" & {prof} + 9'])('accepts %s on a short field and keeps it as written', (formula) => {
      const sheet = withField(base(), field(formula, { type: 'short' }))
      const result = validateSheet(sheet)
      expect(result.ok, JSON.stringify(result.ok ? [] : result.errors)).toBe(true)
      if (result.ok) expect(result.sheet.categories[0].sections[0].items[4]).toMatchObject({ type: 'short', formula })
    })

    it('accepts text and table formulas on number fields too (the result type is checked when it is computed)', () => {
      expect(validateSheet(withField(withTables(), field('suma({equipo}, "peso")'))).ok).toBe(true)
      expect(validateSheet(withField(base(), field('"x"'))).ok).toBe(true)
    })

    it('still rejects a formula on a paragraph field, with the path of the formula', () => {
      const sheet = withField(base(), field('"x"', { type: 'paragraph' }))
      expect(errorsOf(sheet)).toEqual([`${PATH}[4].formula`])
    })

    it('still makes a short formula field DM level only', () => {
      const sheet = withField(base(), field('"x"', { type: 'short', editableBy: 'player' }))
      expect(errorsOf(sheet)).toEqual([`${PATH}[4].editableBy`])
    })

    it('accepts braces, a tab and any unicode inside a text literal: they are just text', () => {
      const formula = '"{ghost} } {" & "Ünï ✓ 日本 😀" & "a\tb"'
      expect(errorsOf(withField(base(), field(formula, { type: 'short' })))).toEqual([])
    })

    it.each([['a control character', '\u0007'], ['a line break', '\n'], ['a C1 control character', '\u0085'], ['DEL', '\u007f']])('rejects %s inside a text literal (the database charset)', (_name, char) => {
      expect(errorsOf(withField(base(), field(`"a${char}b"`, { type: 'short' })))).toEqual([`${PATH}[4].formula`])
    })

    it('rejects a text formula that does not parse', () => {
      expect(errorsOf(withField(base(), field('"open', { type: 'short' })))).toEqual([`${PATH}[4].formula`])
    })

    it('rejects a reference that does not exist inside a text formula', () => {
      expect(errorsOf(withField(base(), field('"a" & {ghost}', { type: 'short' })))).toEqual([`${PATH}[4].formula`])
    })
  })

  describe('hidden fields (S21)', () => {
    it('keeps hidden on a formula field, and another formula can read it', () => {
      const sheet = withField(base(), field('{prof} * 2', { hidden: true, key: 'oculto' }))
      section(sheet).items.push(field('{oculto} + 1', { key: 'visible' }))
      const result = validateSheet(sheet)
      expect(result.ok, JSON.stringify(result.ok ? [] : result.errors)).toBe(true)
      if (result.ok) {
        const items = result.sheet.categories[0].sections[0].items
        expect(items[4]).toMatchObject({ key: 'oculto', hidden: true })
        expect(items[5]).not.toHaveProperty('hidden')
      }
    })

    it('rejects hidden on a field with no formula', () => {
      const sheet = base()
      section(sheet).items[2] = { kind: 'field', key: 'nivel_extra', label: 'Sin', type: 'number', editableBy: 'player', hidden: true } as Item
      expect(errorsOf(sheet)).toEqual([`${PATH}[2].hidden`])
    })

    it.each(['yes', 1, null])('rejects hidden = %j (only a boolean)', (hidden) => {
      expect(errorsOf(withField(base(), field('1', { hidden })))).toEqual([`${PATH}[4].hidden`])
    })
  })

  describe('table references (S29)', () => {
    it.each([
      'suma({equipo}, "peso")',
      'promedio({equipo}, "total")',
      'conteo({equipo})',
      'conteo({equipo}, "nombre")',
      'lookup({equipo}, "nombre", "cuerda", "peso", 0)',
      'suma({dinero}, "value")',
      'lookup({dinero}, "key", "oro", "value")',
      'lookup({dinero}, "key", "oro", "label") & ""',
    ])('accepts %s', (formula) => {
      const result = validateSheet(withField(withTables(), field(formula)))
      expect(result.ok, JSON.stringify(result.ok ? [] : result.errors)).toBe(true)
    })

    it.each([
      ['a column the table does not have', 'suma({equipo}, "ghost")'],
      ['a key column the table does not have', 'lookup({equipo}, "ghost", 1, "peso")'],
      ['a result column the table does not have', 'lookup({equipo}, "nombre", "x", "ghost")'],
      ['a coin table column other than key, label, value', 'suma({dinero}, "total")'],
      ['a stat table', 'conteo({stats})'],
      ['a capacidades table', 'conteo({skills})'],
      ['a field', 'suma({prof}, "x")'],
      ['a stat row', 'suma({stat_str}, "x")'],
      ['a table that does not exist', 'suma({ghost}, "peso")'],
    ])('rejects %s', (_name, formula) => {
      expect(errorsOf(withField(withTables(), field(formula)))).toEqual([calcPath])
    })

    it.each(['{equipo} + 1', '{dinero} + 1', '{stats} + 1', '{skills} & "x"'])('rejects the table key used as a plain value: %s', (formula) => {
      expect(errorsOf(withField(withTables(), field(formula)))).toEqual([calcPath])
    })

    it('reads the tables of other sections too', () => {
      const sheet = withTables()
      sheet.categories[0].sections.push({
        key: 'otra', label: 'Otra', blocks: [{ key: 'b', mode: 'tile', items: ['peso_total'] }],
        items: [{ kind: 'field', key: 'peso_total', label: 'Peso', type: 'number', formula: 'suma({equipo}, "peso")', editableBy: 'dm' }],
      })
      expect(validateSheet(sheet).ok).toBe(true)
    })
  })

  describe('row formula columns', () => {
    const equipo = (sheet: Sheet) => {
      const table = section(sheet).items[4]
      if (table.kind !== 'table' || table.type !== 'libre') throw new Error('fixture changed')
      return table
    }

    it('keeps a row formula column whose locals are the columns of its own table', () => {
      const result = validateSheet(withTables())
      expect(result.ok).toBe(true)
      if (result.ok) expect(JSON.stringify(result.sheet)).toContain('"formula":"{peso} * {cantidad}"')
    })

    it('rejects a local that is not a column of the table', () => {
      const sheet = withTables()
      equipo(sheet).columns[3].formula = '{peso} * {ghost}'
      expect(errorsOf(sheet)).toEqual([`${PATH}[4].columns[3].formula`])
    })

    it('lets a row formula column read sheet fields and other tables', () => {
      const sheet = withTables()
      equipo(sheet).columns[3].formula = '{peso} * {cantidad} + {prof} + suma({dinero}, "value")'
      expect(validateSheet(sheet).ok).toBe(true)
    })

    it('rejects a formula on a text column (row formula columns are numbers or flags)', () => {
      const sheet = withTables()
      equipo(sheet).columns[0].formula = '"x"'
      expect(errorsOf(sheet)).toEqual([`${PATH}[4].columns[0].formula`])
    })

    it('accepts a row column that sums a stored column of its own table', () => {
      const sheet = withTables()
      equipo(sheet).columns[3].formula = '{peso} / suma({equipo}, "peso")'
      expect(validateSheet(sheet).ok).toBe(true)
    })

    it('rejects a row column that sums its own column (a cycle)', () => {
      const sheet = withTables()
      equipo(sheet).columns[3].formula = '{peso} + suma({equipo}, "total")'
      expect(errorsOf(sheet)).toEqual(['categories'])
    })

    it('rejects two row columns that read each other', () => {
      const sheet = withTables()
      equipo(sheet).columns[2].formula = '{total} + 1'
      expect(errorsOf(sheet)).toEqual(['categories'])
    })

    it('rejects a field and a table column that depend on each other through a table function', () => {
      const sheet = withField(withTables(), field('suma({equipo}, "total")', { key: 'carga' }))
      equipo(sheet).columns[3].formula = '{peso} + {carga}'
      expect(errorsOf(sheet)).toEqual(['categories'])
    })

    it('rejects a field that reads a column through lookup and is read by that column', () => {
      const sheet = withField(withTables(), field('lookup({equipo}, "nombre", "x", "total", 0)', { key: 'carga' }))
      equipo(sheet).columns[3].formula = '{carga}'
      expect(errorsOf(sheet)).toEqual(['categories'])
    })

    it('does not call it a cycle when the field only sums a stored column', () => {
      const sheet = withField(withTables(), field('suma({equipo}, "peso")', { key: 'carga' }))
      equipo(sheet).columns[3].formula = '{peso} + {carga}'
      expect(validateSheet(sheet).ok).toBe(true)
    })

    it('does not call conteo of the whole table a cycle for a row column (it only counts rows)', () => {
      const sheet = withTables()
      equipo(sheet).columns[3].formula = '{peso} / conteo({equipo})'
      expect(validateSheet(sheet).ok).toBe(true)
    })
  })
})
