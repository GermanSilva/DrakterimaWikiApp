/** H3a: the references valid in a formula's place, who uses a key, and the cycle path of validateSheet (S42 b, e, f). */
import { describe, expect, it } from 'vitest'
import { DND5E_SHEET } from './dnd5eSheet'
import { formulaUsers, referenceScope, type FormulaContext, type ScopeEntry } from './formulaScope'
import { validateSheet, type Item, type Sheet } from './sheetModel'

const items = (): Item[] => [
  { kind: 'field', key: 'nombre_pj', label: 'Apodo', type: 'short', editableBy: 'player' },
  { kind: 'field', key: 'vivo', label: 'Vivo', type: 'boolean', editableBy: 'player' },
  { kind: 'field', key: 'bio', label: 'Biografía', type: 'paragraph', editableBy: 'player' },
  { kind: 'field', key: 'extra', label: 'Extra', type: 'number', editableBy: 'player' },
  { kind: 'field', key: 'prof', label: 'Competencia', type: 'number', formula: '2 + floor(({nivel} - 1) / 4)', editableBy: 'dm' },
  { kind: 'field', key: 'oculto', label: 'Oculto', type: 'number', formula: '{extra} * 2', hidden: true, editableBy: 'dm' },
  {
    kind: 'field',
    key: 'entrenado',
    label: 'Entrenado',
    type: 'options',
    display: 'select',
    editableBy: 'player',
    options: [
      { key: 'no', label: 'No', formula: '0' },
      { key: 'si', label: 'Sí', formula: '{prof}' },
    ],
  },
  { kind: 'field', key: 'iniciativa', label: 'Iniciativa', type: 'number', formula: '{stat_dex.modificador} + {oculto}', editableBy: 'dm' },
  { kind: 'field', key: 'carga', label: 'Carga', type: 'number', calc: { table: 'equipo', column: 'peso', op: 'suma' }, editableBy: 'dm' },
  { kind: 'field', key: 'peso_total', label: 'Peso total', type: 'number', formula: 'suma({equipo}, "peso") + {carga}', editableBy: 'dm' },
  {
    kind: 'table',
    type: 'stat',
    key: 'stats',
    label: 'Atributos',
    rows: [
      { key: 'stat_str', label: 'Fuerza', modifier: 'floor(({valor} - 10) / 2)', editableBy: 'player' },
      { key: 'stat_dex', label: 'Destreza', modifier: 'floor(({valor} - 10) / 2)', editableBy: 'dm' },
    ],
  },
  {
    kind: 'table',
    type: 'capacidades',
    key: 'skills',
    label: 'Habilidades',
    columns: [
      { key: 'bonus', label: 'Bonus', type: 'number', editableBy: 'player' },
      { key: 'total', label: 'Total', type: 'number', formula: '{valor} + {bonus}', editableBy: 'dm' },
    ],
    rows: [{ key: 'atletismo', label: 'Atletismo', stat: 'stat_str', use: 'modificador', editableBy: 'player' }],
  },
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
      {
        key: 'estado',
        label: 'Estado',
        type: 'options',
        display: 'select',
        editableBy: 'player',
        options: [
          { key: 'a', label: 'A', formula: '{peso}' },
          { key: 'b', label: 'B', formula: '{peso} * 2' },
        ],
      },
    ],
  },
  { kind: 'table', type: 'monedas', key: 'dinero', label: 'Dinero', rows: [{ key: 'oro', label: 'Oro', value: 100 }, { key: 'bronce', label: 'Bronce', value: 1 }] },
  { kind: 'table', type: 'economia', key: 'caja', label: 'Caja', editableBy: 'dm' },
]

const sheetOf = (list: Item[] = items()): Sheet => {
  const result = validateSheet({ categories: [{ key: 'c', label: 'C', sections: [{ key: 's', label: 'S', items: list, blocks: [] }] }], roles: {} })
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.sheet
}

const refs = (list: ScopeEntry[]) => list.map((e) => e.ref)
const find = (list: ScopeEntry[], ref: string) => list.find((e) => e.ref === ref)

const FIELD = (key: string): FormulaContext => ({ kind: 'field', key })

describe('referenceScope', () => {
  const sheet = sheetOf()

  it('lists, for a field, the fields, stat values and modifiers, the capacidades columns that are stored and the tables', () => {
    const list = referenceScope(sheet, FIELD('iniciativa'))
    expect(refs(list)).toEqual([
      'nivel',
      'nombre_pj',
      'vivo',
      'bio',
      'extra',
      'prof',
      'oculto',
      'entrenado',
      'carga',
      'peso_total',
      'stat_str.valor',
      'stat_str.modificador',
      'stat_dex.valor',
      'stat_dex.modificador',
      'atletismo.bonus',
      'equipo',
      'dinero',
    ])
  })

  it('labels them in Spanish from the sheet, with their group and kind', () => {
    const list = referenceScope(sheet, FIELD('iniciativa'))
    expect(find(list, 'nivel')).toEqual({ ref: 'nivel', label: 'Nivel', group: 'campos', kind: 'number' })
    expect(find(list, 'nombre_pj')).toEqual({ ref: 'nombre_pj', label: 'Apodo', group: 'campos', kind: 'text' })
    expect(find(list, 'bio')).toMatchObject({ kind: 'text' })
    expect(find(list, 'vivo')).toMatchObject({ label: 'Vivo', group: 'campos', kind: 'boolean' })
    expect(find(list, 'entrenado')).toMatchObject({ group: 'campos', kind: 'number' })
    expect(find(list, 'stat_str.valor')).toEqual({ ref: 'stat_str.valor', label: 'Fuerza (valor)', group: 'atributos', kind: 'number' })
    expect(find(list, 'stat_dex.modificador')).toEqual({ ref: 'stat_dex.modificador', label: 'Destreza (modificador)', group: 'atributos', kind: 'number' })
    expect(find(list, 'atletismo.bonus')).toEqual({ ref: 'atletismo.bonus', label: 'Atletismo · Bonus', group: 'capacidades', kind: 'number' })
    expect(find(list, 'equipo')).toEqual({ ref: 'equipo', label: 'Equipo', group: 'tablas', kind: 'table', tableOnly: true })
    expect(find(list, 'dinero')).toEqual({ ref: 'dinero', label: 'Dinero', group: 'tablas', kind: 'table', tableOnly: true })
  })

  it('leaves out what a formula cannot read: the field itself, anything that would close a cycle, stat and economy tables, rows as such, computed capacidades columns', () => {
    const list = refs(referenceScope(sheet, FIELD('prof')))
    expect(list).not.toContain('prof')
    expect(list).not.toContain('entrenado') // its option reads prof
    expect(list).not.toContain('stats')
    expect(list).not.toContain('caja')
    expect(list).not.toContain('skills')
    expect(list).not.toContain('stat_str')
    expect(list).not.toContain('atletismo')
    expect(list).not.toContain('atletismo.total')
    expect(list).toContain('oculto')
    expect(refs(referenceScope(sheet, FIELD('oculto')))).not.toContain('iniciativa') // iniciativa reads oculto
  })

  it('does not offer a field to the formulas it depends on, through any number of steps', () => {
    const chain = sheetOf([
      { kind: 'field', key: 'a', label: 'A', type: 'number', formula: '1', editableBy: 'dm' },
      { kind: 'field', key: 'b', label: 'B', type: 'number', formula: '{a}', editableBy: 'dm' },
      { kind: 'field', key: 'c', label: 'C', type: 'number', formula: '{b}', editableBy: 'dm' },
    ])
    expect(refs(referenceScope(chain, FIELD('a')))).toEqual(['nivel'])
    expect(refs(referenceScope(chain, FIELD('b')))).toEqual(['nivel', 'a'])
    expect(refs(referenceScope(chain, FIELD('c')))).toEqual(['nivel', 'a', 'b'])
  })

  it('offers a stat row modifier the value of its own row as a local, and the rest of the sheet', () => {
    const list = referenceScope(sheet, { kind: 'stat', row: 'stat_dex' })
    expect(find(list, 'valor')).toEqual({ ref: 'valor', label: 'Valor', group: 'locales', kind: 'number' })
    expect(refs(list)).toContain('prof')
    expect(refs(list)).not.toContain('stat_dex.modificador')
    expect(refs(list)).not.toContain('iniciativa') // reads this modifier
    expect(refs(list)).toContain('stat_str.modificador')
  })

  it('offers a Libre table column its sibling columns as locals (not itself, nor one that reads it) and the tables for table functions', () => {
    const list = referenceScope(sheet, { kind: 'column', table: 'equipo', column: 'total' })
    expect(list.filter((e) => e.group === 'locales')).toEqual([
      { ref: 'nombre', label: 'Nombre', group: 'locales', kind: 'text' },
      { ref: 'peso', label: 'Peso', group: 'locales', kind: 'number' },
      { ref: 'cantidad', label: 'Cantidad', group: 'locales', kind: 'number' },
      { ref: 'estado', label: 'Estado', group: 'locales', kind: 'number' },
    ])
    expect(find(list, 'dinero')).toMatchObject({ tableOnly: true })
  })

  it('offers a Capacidades column the row valor and modificador and its sibling columns', () => {
    const list = referenceScope(sheet, { kind: 'column', table: 'skills', column: 'total' })
    expect(list.filter((e) => e.group === 'locales').map((e) => e.ref)).toEqual(['bonus', 'valor', 'modificador'])
    expect(find(list, 'valor')).toMatchObject({ label: 'Valor', kind: 'number' })
  })

  it('answers nothing for a context that is not in the sheet', () => {
    expect(referenceScope(sheet, FIELD('nope'))).toEqual([])
    expect(referenceScope(sheet, { kind: 'stat', row: 'nope' })).toEqual([])
    expect(referenceScope(sheet, { kind: 'column', table: 'equipo', column: 'nope' })).toEqual([])
    expect(referenceScope(sheet, { kind: 'column', table: 'nope', column: 'peso' })).toEqual([])
  })

  describe('agrees with validateSheet', () => {
    /** Writes `formula` where the context says (the field and column ones as plain formulas, not options). */
    const withFormula = (context: FormulaContext, formula: string): unknown => {
      const raw = JSON.parse(JSON.stringify(sheet)) as { categories: { sections: { items: Record<string, unknown>[] }[] }[] }
      const list = raw.categories[0].sections[0].items
      if (context.kind === 'field') {
        const field = list.find((i) => i.key === context.key)!
        if (field.type === 'options') (field.options as Record<string, unknown>[])[0].formula = formula
        else field.formula = formula
      } else if (context.kind === 'stat') {
        const stats = list.find((i) => i.type === 'stat')!
        ;(stats.rows as Record<string, unknown>[]).find((r) => r.key === context.row)!.modifier = formula
      } else {
        const table = list.find((i) => i.key === context.table)!
        const column = (table.columns as Record<string, unknown>[]).find((c) => c.key === context.column)!
        if (column.type === 'options') (column.options as Record<string, unknown>[])[0].formula = formula
        else column.formula = formula
      }
      return raw
    }
    const contexts: FormulaContext[] = [
      FIELD('prof'),
      FIELD('iniciativa'),
      FIELD('entrenado'),
      FIELD('peso_total'),
      { kind: 'stat', row: 'stat_str' },
      { kind: 'stat', row: 'stat_dex' },
      { kind: 'column', table: 'skills', column: 'total' },
      { kind: 'column', table: 'equipo', column: 'total' },
      { kind: 'column', table: 'equipo', column: 'estado' },
    ]

    it.each(contexts.map((c) => [JSON.stringify(c), c] as const))('every reference listed for %s is accepted', (_name, context) => {
      const list = referenceScope(sheet, context)
      expect(list.length).toBeGreaterThan(3)
      for (const entry of list) {
        const formula = entry.tableOnly ? `conteo({${entry.ref}})` : `{${entry.ref}}`
        const result = validateSheet(withFormula(context, formula))
        expect(result.ok ? [] : result.errors, `${JSON.stringify(context)} ${formula}`).toEqual([])
      }
    })

    it.each(contexts.map((c) => [JSON.stringify(c), c] as const))('an unknown reference is rejected where %s is', (_name, context) => {
      const result = validateSheet(withFormula(context, '{no_existe_nada}'))
      expect(result.ok).toBe(false)
      expect(!result.ok && result.errors.map((e) => e.message)).toContain('unknown reference {no_existe_nada}')
    })

    it('a table listed as table-only is rejected as a plain value, and a computed capacidades column is not listed', () => {
      const result = validateSheet(withFormula(FIELD('iniciativa'), '{equipo}'))
      expect(!result.ok && result.errors.map((e) => e.message)).toContain('{equipo} is a table, use it inside a table function')
      expect(refs(referenceScope(sheet, FIELD('iniciativa')))).not.toContain('atletismo.total')
      const computed = validateSheet(withFormula(FIELD('iniciativa'), '{atletismo.total}'))
      expect(computed.ok).toBe(false)
    })
  })

  it('works on the D&D preset: its references all validate where the preset puts them', () => {
    const ok = validateSheet(DND5E_SHEET)
    expect(ok.ok).toBe(true)
    const first = DND5E_SHEET.categories[0].sections.flatMap((s) => s.items).find((i) => i.kind === 'field')!
    const list = referenceScope(DND5E_SHEET, FIELD(first.key))
    expect(list.length).toBeGreaterThan(10)
    expect(list.every((e) => e.label !== '' && e.ref !== '')).toBe(true)
  })
})

describe('formulaUsers (Lo usan)', () => {
  const sheet = sheetOf()
  const keys = (list: ReturnType<typeof formulaUsers>) => list.map((u) => (u.context.kind === 'field' ? u.context.key : u.context.kind === 'stat' ? u.context.row : `${u.context.table}.${u.context.column}`))

  it('lists who reads a field, with their label and where the formula is', () => {
    const users = formulaUsers(sheet, 'oculto')
    expect(keys(users)).toEqual(['iniciativa'])
    expect(users[0]).toMatchObject({ label: 'Iniciativa', path: 'categories[0].sections[0].items[7].formula', context: { kind: 'field', key: 'iniciativa' } })
  })

  it('counts a reader through an option formula once', () => {
    const users = formulaUsers(sheet, 'prof')
    expect(keys(users)).toEqual(['entrenado'])
    expect(users[0].path).toBe('categories[0].sections[0].items[6].options[1].formula')
  })

  it('takes a stat row for both its valor and its modificador, and names a modifier by its row', () => {
    expect(keys(formulaUsers(sheet, 'stat_dex'))).toEqual(['iniciativa'])
    expect(formulaUsers(sheet, 'stat_str')).toEqual([]) // a Capacidades row links to its stat, it does not read it in a formula
    expect(formulaUsers(sheet, 'nivel').map((u) => u.label)).toEqual(['Competencia'])
  })

  it('takes a table for the table functions that read it and the calculations over it', () => {
    const users = formulaUsers(sheet, 'equipo')
    expect(keys(users)).toEqual(['peso_total', 'carga']) // formulas in sheet order, then the calculations
    expect(users[1]).toMatchObject({ label: 'Carga', path: 'categories[0].sections[0].items[8].calc' })
  })

  it('takes table.column for the table functions naming that column, the calculations over it and the column formulas reading it as a local', () => {
    expect(keys(formulaUsers(sheet, 'equipo.peso'))).toEqual(['peso_total', 'equipo.total', 'equipo.estado', 'carga'])
    expect(formulaUsers(sheet, 'equipo.peso').find((u) => u.context.kind === 'column' && u.context.column === 'total')).toMatchObject({ label: 'Equipo › Total' })
    expect(keys(formulaUsers(sheet, 'equipo.nombre'))).toEqual([])
  })

  it('is empty for a key nobody reads, or one that does not exist', () => {
    expect(formulaUsers(sheet, 'vivo')).toEqual([])
    expect(formulaUsers(sheet, 'nope')).toEqual([])
  })
})

describe('validateSheet names the cycle path', () => {
  const cycleOf = (raw: unknown) => {
    const result = validateSheet(raw)
    if (result.ok) throw new Error('expected an error')
    return result.errors.find((e) => e.message.startsWith('formulas reference each other in a cycle'))
  }
  const sheetWith = (list: unknown[]) => ({ categories: [{ key: 'c', label: 'C', sections: [{ key: 's', label: 'S', items: list, blocks: [] }] }], roles: {} })

  it('carries the keys in order, the first repeated at the end, with their labels', () => {
    const error = cycleOf(
      sheetWith([
        { kind: 'field', key: 'pasiva', label: 'Percepción pasiva', type: 'number', formula: '{ini} + 1', editableBy: 'dm' },
        { kind: 'field', key: 'ini', label: 'Iniciativa', type: 'number', formula: '{pasiva} + 1', editableBy: 'dm' },
      ]),
    )
    expect(error).toEqual({
      path: 'categories',
      message: 'formulas reference each other in a cycle: pasiva -> ini -> pasiva',
      cycle: [
        { key: 'pasiva', label: 'Percepción pasiva' },
        { key: 'ini', label: 'Iniciativa' },
        { key: 'pasiva', label: 'Percepción pasiva' },
      ],
    })
  })

  it('names a field that reads itself', () => {
    const error = cycleOf(sheetWith([{ kind: 'field', key: 'x', label: 'X', type: 'number', formula: '{x}', editableBy: 'dm' }]))
    expect(error?.cycle?.map((n) => n.key)).toEqual(['x', 'x'])
  })

  it('labels stat modifiers and table columns', () => {
    const error = cycleOf(
      sheetWith([
        { kind: 'table', type: 'stat', key: 'st', label: 'Atributos', rows: [{ key: 'fue', label: 'Fuerza', modifier: 'suma({eq}, "t")', editableBy: 'dm' }], },
        {
          kind: 'table',
          type: 'libre',
          key: 'eq',
          label: 'Equipo',
          editableBy: 'dm',
          columns: [{ key: 't', label: 'Total', type: 'number', formula: '{fue.modificador}', editableBy: 'dm' }],
        },
      ]),
    )
    expect(error?.cycle).toEqual([
      { key: 'fue.modificador', label: 'Fuerza (modificador)' },
      { key: 'col:eq.t', label: 'Equipo › Total' },
      { key: 'fue.modificador', label: 'Fuerza (modificador)' },
    ])
    expect(error?.message).toBe('formulas reference each other in a cycle: fue.modificador -> col:eq.t -> fue.modificador')
  })

  it('keeps the other errors as they were (no cycle field)', () => {
    const result = validateSheet(sheetWith([{ kind: 'field', key: 'x', label: 'X', type: 'number', formula: '{nope}', editableBy: 'dm' }]))
    expect(result).toEqual({ ok: false, errors: [{ path: 'categories[0].sections[0].items[0].formula', message: 'unknown reference {nope}' }] })
  })
})
