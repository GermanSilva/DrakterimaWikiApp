import { describe, expect, it } from 'vitest'
import { playerValueOk, playerWriteRules, playerWritableKeys } from './sheetAccess'
import type { Sheet } from './sheetModel'

const sheet = (items: Sheet['categories'][number]['sections'][number]['items']): Sheet => ({
  categories: [{ key: 'c', label: 'C', sections: [{ key: 's', label: 'S', items, blocks: [] }] }],
  roles: {},
})

describe('playerWritableKeys', () => {
  it('lists the fields the player may edit and skips the DM ones', () => {
    const result = playerWritableKeys(
      sheet([
        { kind: 'field', key: 'edad', label: 'Edad', type: 'short', editableBy: 'player' },
        { kind: 'field', key: 'xp', label: 'XP', type: 'number', editableBy: 'dm' },
      ]),
    )
    expect(result).toEqual(['edad'])
  })

  it('never lists a formula field, even if it were marked for the player', () => {
    const result = playerWritableKeys(
      sheet([{ kind: 'field', key: 'prof', label: 'P', type: 'number', formula: '1', editableBy: 'player' }]),
    )
    expect(result).toEqual([])
  })

  it('lists a stat row value only when that row is editable by the player (S11)', () => {
    const result = playerWritableKeys(
      sheet([
        {
          kind: 'table',
          type: 'stat',
          key: 'stats',
          label: 'Stats',
          rows: [
            { key: 'stat_str', label: 'FUE', modifier: '0', editableBy: 'player' },
            { key: 'stat_dex', label: 'DES', modifier: '0', editableBy: 'dm' },
          ],
        },
      ]),
    )
    expect(result).toEqual(['stat_str'])
  })

  it('lists a capacidad value and its extra columns only when row AND column allow the player', () => {
    const result = playerWritableKeys(
      sheet([
        {
          kind: 'table',
          type: 'capacidades',
          key: 'skills',
          label: 'Skills',
          columns: [
            { key: 'rank', label: 'Rank', type: 'number', editableBy: 'player' },
            { key: 'note', label: 'Note', type: 'short', editableBy: 'player' },
            { key: 'locked', label: 'Locked', type: 'number', editableBy: 'dm' },
          ],
          rows: [
            { key: 'sk_a', label: 'A', stat: 'x', use: 'valor', editableBy: 'player' },
            { key: 'sk_b', label: 'B', stat: 'x', use: 'valor', editableBy: 'dm' },
          ],
        },
      ]),
    )
    expect(result).toEqual(['sk_a', 'sk_a__note'])
  })

  it('lists a free or skill table by its key only when the table is editable by the player', () => {
    const columns = [{ key: 'nombre', label: 'N', type: 'short' as const, editableBy: 'player' as const }]
    const result = playerWritableKeys(
      sheet([
        { kind: 'table', type: 'libre', key: 'mine', label: 'M', columns, editableBy: 'player' },
        { kind: 'table', type: 'libre', key: 'theirs', label: 'T', columns, editableBy: 'dm' },
        { kind: 'table', type: 'habilidad', key: 'spells', label: 'S', columns, editableBy: 'player' },
      ]),
    )
    expect(result).toEqual(['mine', 'spells'])
  })

  it('never lists the coin table: coins are credited by the server and written by the DM (S12)', () => {
    const result = playerWritableKeys(sheet([{ kind: 'table', type: 'monedas', key: 'dinero', label: 'D', rows: [{ key: 'cp', label: 'C', value: 1 }] }]))
    expect(result).toEqual([])
  })

  it('never lists an economy table: DM only until the SQL guard handles amounts objects (G2c)', () => {
    const result = playerWritableKeys(
      sheet([
        { kind: 'table', type: 'monedas', key: 'dinero', label: 'D', rows: [{ key: 'cp', label: 'C', value: 1 }] },
        { kind: 'table', type: 'economia', key: 'caja', label: 'Caja', editableBy: 'dm' },
      ]),
    )
    expect(result).toEqual([])
  })

  it('still lists a player Habilidad table that declares categories', () => {
    const columns = [{ key: 'nombre', label: 'N', type: 'short' as const, editableBy: 'player' as const }]
    const result = playerWritableKeys(
      sheet([{ kind: 'table', type: 'habilidad', key: 'acciones', label: 'A', columns, editableBy: 'player', categories: [{ key: 'trucos', label: 'Trucos' }] }]),
    )
    expect(result).toEqual(['acciones'])
  })

  it('returns a sorted list without repeats', () => {
    const result = playerWritableKeys(
      sheet([
        { kind: 'field', key: 'b', label: 'B', type: 'short', editableBy: 'player' },
        { kind: 'field', key: 'a', label: 'A', type: 'short', editableBy: 'player' },
      ]),
    )
    expect(result).toEqual(['a', 'b'])
  })
})

const opts = (...keys: string[]) => keys.map((key) => ({ key, label: key.toUpperCase() }))

describe('playerWriteRules / playerValueOk (twin of _sheet_value_ok, S20)', () => {
  const optionsSheet = sheet([
    { kind: 'field', key: 'grado', label: 'G', type: 'options', display: 'select', options: opts('no', 'comp', 'exp'), editableBy: 'player' },
    { kind: 'field', key: 'cerrado', label: 'C', type: 'options', display: 'select', options: opts('a', 'b'), editableBy: 'dm' },
    { kind: 'field', key: 'luck', label: 'L', type: 'number', min: 0, max: 10, editableBy: 'player' },
    { kind: 'table', type: 'stat', key: 'attrs', label: 'A', rows: [{ key: 'str', label: 'S', modifier: '0', editableBy: 'dm' }] },
    {
      kind: 'table',
      type: 'capacidades',
      key: 'skills',
      label: 'Sk',
      columns: [
        { key: 'prof', label: 'P', type: 'options', display: 'select', options: opts('n', 'c', 'e'), editableBy: 'player' },
        { key: 'tipo', label: 'T', type: 'options', display: 'select', options: opts('fisica', 'mental'), editableBy: 'player' },
        { key: 'bloq', label: 'B', type: 'options', display: 'select', options: opts('x', 'y'), editableBy: 'dm' },
      ],
      rows: [
        { key: 'sk_a', label: 'A', stat: 'str', use: 'modificador', editableBy: 'player' },
        { key: 'sk_b', label: 'B', stat: 'str', use: 'modificador', editableBy: 'dm' },
      ],
    },
    {
      kind: 'table',
      type: 'libre',
      key: 'inv',
      label: 'I',
      editableBy: 'player',
      columns: [
        { key: 'nombre', label: 'N', type: 'short', editableBy: 'player' },
        { key: 'tier', label: 'T', type: 'options', display: 'select', options: opts('bajo', 'alto'), editableBy: 'player' },
        { key: 'total', label: 'Tot', type: 'number', formula: '1', editableBy: 'player' },
      ],
    },
  ])
  const rules = playerWriteRules(optionsSheet)
  const ok = (key: string, value: unknown) => playerValueOk(value, rules[key])

  it('lists the same keys as playerWritableKeys', () => {
    expect(Object.keys(rules).sort()).toEqual(playerWritableKeys(optionsSheet))
    expect(Object.keys(rules).sort()).toEqual(['grado', 'inv', 'luck', 'sk_a', 'sk_a__tipo'])
  })

  it('accepts only a declared option key in an options field, and null clears', () => {
    expect(ok('grado', 'comp')).toBe(true)
    expect(ok('grado', null)).toBe(true)
    for (const bad of ['master', 'COMP', '', 'Comp', 1, true, ['comp'], { comp: 1 }]) expect(ok('grado', bad)).toBe(false)
  })

  it('judges a Capacidades cell by the options of ITS column (first column at data[row], the others at data[row__col])', () => {
    expect(ok('sk_a', 'c')).toBe(true)
    expect(ok('sk_a', 'mental')).toBe(false)
    expect(ok('sk_a__tipo', 'mental')).toBe(true)
    expect(ok('sk_a__tipo', 'c')).toBe(false)
    expect(ok('sk_a__tipo', 2)).toBe(false)
  })

  it('never opens a DM row, a DM column or a DM field', () => {
    for (const key of ['cerrado', 'sk_b', 'sk_a__bloq', 'sk_b__tipo']) expect(rules[key]).toBeUndefined()
  })

  it('judges the options column of an open Libre table, skipping formula columns', () => {
    expect(ok('inv', [{ id: 1, nombre: 'rope', tier: 'alto' }, { id: 2, tier: null }])).toBe(true)
    expect(ok('inv', [{ id: 1, tier: 'medio' }])).toBe(false)
    expect(ok('inv', [{ id: 1, tier: 1 }])).toBe(false)
    expect(ok('inv', [{ id: 1, total: 5 }])).toBe(false)
    expect(ok('inv', [{ id: 1, evil: 1 }])).toBe(false)
    expect(ok('inv', { a: 1 })).toBe(false)
  })

  it('keeps judging the other types as the database does', () => {
    expect(ok('luck', 5)).toBe(true)
    expect(ok('luck', 11)).toBe(false)
    expect(ok('luck', '5')).toBe(false)
  })

  it('treats a rule without declared keys as closed', () => {
    expect(playerValueOk('x', { t: 'options' })).toBe(false)
    expect(playerValueOk('x', { t: 'options', opts: [] })).toBe(false)
  })
})
