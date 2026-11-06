import { describe, expect, it } from 'vitest'
import { ACTION_SHEET } from './actionsFixture'
import { actionTablesOf, allowedStatePatch, entryColumns, groupByCategory, habilidadTables, stateColumns, stateRules } from './tables'

const [hechizos, rasgos] = habilidadTables(ACTION_SHEET)

describe('Habilidad tables of the sheet', () => {
  it('lists the Habilidad tables in sheet order, none without a sheet', () => {
    expect(habilidadTables(ACTION_SHEET).map((t) => t.key)).toEqual(['hechizos', 'rasgos'])
    expect(habilidadTables(null)).toEqual([])
  })

  it('actionTablesOf reads the stored sheet and ignores an invalid one', () => {
    expect(actionTablesOf({ sheet: undefined })).toEqual([])
    expect(actionTablesOf({ sheet: { categories: 'x' } })).toEqual([])
  })

  it('splits columns by scope: entry columns (without nombre/categoria) vs character state', () => {
    expect(entryColumns(hechizos).map((c) => c.key)).toEqual(['escuela', 'alcance'])
    expect(stateColumns(hechizos).map((c) => c.key)).toEqual(['preparado', 'usos', 'calidad'])
    expect(entryColumns(rasgos).map((c) => c.key)).toEqual(['fuente'])
    expect(stateColumns(rasgos).map((c) => c.key)).toEqual(['cargas'])
  })
})

describe('state write rules (twin of the G6a link state rule)', () => {
  it('the DM may write every character column', () => {
    expect(Object.keys(stateRules(rasgos, true))).toEqual(['cargas'])
    expect(Object.keys(stateRules(hechizos, true))).toEqual(['preparado', 'usos', 'calidad'])
  })

  it('a player writes only on a player-editable table and player-editable columns', () => {
    expect(Object.keys(stateRules(hechizos, false))).toEqual(['preparado', 'usos', 'calidad'])
    expect(stateRules(rasgos, false)).toEqual({})
    expect(stateRules(hechizos, false).calidad).toEqual({ t: 'options', opts: ['baja', 'alta'] })
  })
})

describe('groupByCategory', () => {
  const items = [
    { name: 'a', category: 'nivel1' },
    { name: 'b', category: 'truco' },
    { name: 'c', category: 'zzz' },
  ]
  it('follows the declared order and labels, then Otras for undeclared keys', () => {
    expect(groupByCategory(hechizos, items, (i) => i.category).map((g) => [g.label, g.items.map((i) => i.name)])).toEqual([
      ['Trucos', ['b']],
      ['Nivel 1', ['a']],
      ['Otras', ['c']],
    ])
  })

  it('a table without declared categories groups by free text, alphabetically, blank as Sin categoría', () => {
    const free = [{ n: 1, c: 'Especie' }, { n: 2, c: 'Clase' }, { n: 3, c: '' }]
    expect(groupByCategory(rasgos, free, (i) => i.c).map((g) => g.label)).toEqual(['Clase', 'Especie', 'Sin categoría'])
  })
})

describe('allowedStatePatch', () => {
  it('drops keys the viewer may not write and values the server would refuse, naming them', () => {
    expect(allowedStatePatch(hechizos, false, { preparado: true })).toEqual({ allowed: { preparado: true }, invalid: [] })
    expect(allowedStatePatch(hechizos, false, { preparado: true, escuela: 'x', calidad: 'zzz', usos: 'tres' })).toEqual({ allowed: { preparado: true }, invalid: ['escuela', 'calidad', 'usos'] })
    expect(allowedStatePatch(rasgos, false, { cargas: 2 })).toEqual({ allowed: {}, invalid: ['cargas'] })
    expect(allowedStatePatch(rasgos, true, { cargas: 2 })).toEqual({ allowed: { cargas: 2 }, invalid: [] })
  })

  it('null clears a value for everyone who may write it', () => {
    expect(allowedStatePatch(hechizos, false, { usos: null })).toEqual({ allowed: { usos: null }, invalid: [] })
  })
})
