/** G2c: action category groups and economy items (resolveSheet). */
import { describe, expect, it } from 'vitest'
import { resolveSheet, type ResolvedBlock, type ResolvedItem } from './resolveSheet'
import type { Sheet } from './sheetModel'

type Loose = Record<string, unknown>

const acciones = (extra: Loose = {}): Loose => ({
  kind: 'table',
  type: 'habilidad',
  key: 'acciones',
  label: 'Acciones',
  editableBy: 'dm',
  columns: [
    { key: 'nombre', label: 'Nombre', type: 'short', editableBy: 'dm' },
    { key: 'categoria', label: 'Categoría', type: 'short', editableBy: 'dm' },
  ],
  categories: [
    { key: 'trucos', label: 'Trucos' },
    { key: 'nivel_1', label: 'Nivel 1' },
    { key: 'dotes', label: 'Dotes' },
  ],
  ...extra,
})
const dinero = (extra: Loose = {}): Loose => ({
  kind: 'table',
  type: 'monedas',
  key: 'dinero',
  label: 'Dinero',
  rows: [{ key: 'bronce', label: 'Bronce', value: 1 }, { key: 'oro', label: 'Oro', value: 100 }, { key: 'plata', label: 'Plata', value: 10 }],
  ...extra,
})
const caja = (extra: Loose = {}): Loose => ({ kind: 'table', type: 'economia', key: 'caja', label: 'Caja', editableBy: 'dm', ...extra })

const sheetOf = (items: Loose[], blocks: Loose[]): Sheet =>
  ({ categories: [{ key: 'c', label: 'C', sections: [{ key: 's', label: 'S', items, blocks }] }], roles: {} }) as unknown as Sheet
const modalBlock = (resolvedSheet: Sheet, pj: Loose): ResolvedBlock => resolveSheet(resolvedSheet, pj).sections[0].blocks[0]
const row = (nombre: string, categoria?: unknown): Loose => ({ nombre, ...(categoria !== undefined ? { categoria } : {}) })
const names = (rows: Loose[]) => rows.map((r) => r.nombre)

describe('action category groups (S23)', () => {
  const block = (filter: string[]) => ({ key: 'b', mode: 'modal', items: ['acciones'], filterCategories: filter })
  const pj = {
    acciones: [row('Dote A', 'dotes'), row('Luz', 'trucos'), row('Rayo', 'nivel_1'), row('Chispa', 'trucos'), row('Perdida', 'Nivel 1'), row('Sin', undefined), row('Vacia', ''), row('Numero', 3)],
  }

  it('groups by declared key, titled by the declared label, in the declared order whatever the block lists first', () => {
    const resolved = modalBlock(sheetOf([acciones()], [block(['dotes', 'nivel_1', 'trucos'])]), pj)
    expect(resolved.groups?.map((g) => [g.key, g.category, names(g.rows)])).toEqual([
      ['trucos', 'Trucos', ['Luz', 'Chispa']],
      ['nivel_1', 'Nivel 1', ['Rayo']],
      ['dotes', 'Dotes', ['Dote A']],
      [undefined, 'Otras', ['Perdida', 'Sin', 'Vacia', 'Numero']],
    ])
    expect(resolved.empty).toBe(false)
  })

  it('shows only the categories the block names, still followed by Otras', () => {
    const resolved = modalBlock(sheetOf([acciones()], [block(['nivel_1'])]), pj)
    expect(resolved.groups?.map((g) => g.category)).toEqual(['Nivel 1', 'Otras'])
  })

  it('matches the key, not the label: a row that carries the label goes to Otras', () => {
    const resolved = modalBlock(sheetOf([acciones()], [block(['trucos'])]), { acciones: [row('Etiqueta', 'Trucos')] })
    expect(resolved.groups?.map((g) => [g.category, names(g.rows)])).toEqual([['Otras', ['Etiqueta']]])
  })

  it('has no Otras group and skips groups without rows when every row has a declared category', () => {
    const resolved = modalBlock(sheetOf([acciones()], [block(['trucos', 'nivel_1', 'dotes'])]), { acciones: [row('Luz', 'trucos')] })
    expect(resolved.groups?.map((g) => g.category)).toEqual(['Trucos'])
  })

  it('is empty when the table has no rows or the data is not a list', () => {
    expect(modalBlock(sheetOf([acciones()], [block(['trucos'])]), {})).toMatchObject({ groups: [], empty: true })
    expect(modalBlock(sheetOf([acciones()], [block(['trucos'])]), { acciones: 'x' })).toMatchObject({ groups: [], empty: true })
  })

  it('is empty when the only rows belong to a declared category the block does not name', () => {
    expect(modalBlock(sheetOf([acciones()], [block(['trucos'])]), { acciones: [row('Dote A', 'dotes')] })).toMatchObject({ groups: [], empty: true })
  })

  it('keeps the previous behaviour for a table without categories: free text matched in the order the block names it, no Otras', () => {
    const plain = acciones({ categories: undefined })
    const resolved = modalBlock(sheetOf([plain], [block(['Nivel 1', 'Trucos'])]), { acciones: [row('Luz', 'Trucos'), row('Rayo', 'Nivel 1'), row('Otra', 'Dotes')] })
    expect(resolved.groups).toEqual([
      { category: 'Nivel 1', rows: [row('Rayo', 'Nivel 1')] },
      { category: 'Trucos', rows: [row('Luz', 'Trucos')] },
    ])
    expect(resolved.groups?.every((g) => !('key' in g))).toBe(true)
  })
})

describe('economy items (S28)', () => {
  const items = [acciones(), dinero(), caja()]
  const blocks = [{ key: 'b', mode: 'plano', items: ['dinero', 'caja'] }]
  const economy = (pj: Loose, extra: Loose[] = items): Extract<ResolvedItem, { kind: 'economy' }> => {
    const found = resolveSheet(sheetOf(extra, blocks), pj).sections[0].blocks[0].items.find((i) => i.key === 'caja')
    if (found?.kind !== 'economy') throw new Error('not an economy item')
    return found
  }

  it('lists the denominations by value descending, the amounts above zero, the total in base units and the empty flag', () => {
    expect(economy({ caja: { bronce: 5, oro: 2, plata: 0 } })).toEqual({
      kind: 'economy',
      key: 'caja',
      label: 'Caja',
      denominations: [{ key: 'oro', label: 'Oro', value: 100 }, { key: 'plata', label: 'Plata', value: 10 }, { key: 'bronce', label: 'Bronce', value: 1 }],
      amounts: [{ key: 'oro', label: 'Oro', amount: 2 }, { key: 'bronce', label: 'Bronce', amount: 5 }],
      total: 205,
      empty: false,
    })
  })

  it('is empty with no amounts, with an unknown or malformed stored value', () => {
    for (const stored of [undefined, null, 'x', [], [{ oro: 1 }], {}, { oro: 0 }]) {
      expect(economy({ caja: stored })).toMatchObject({ amounts: [], total: 0, empty: true })
    }
  })

  it('ignores amounts of unknown denominations and amounts that are not non-negative integers', () => {
    const resolved = economy({ caja: { oro: 1.5, plata: -3, bronce: '4', ghost: 9, constructor: 2, plata2: 1 } })
    expect(resolved).toMatchObject({ amounts: [], total: 0, empty: true })
    expect(economy({ caja: { ghost: 9, oro: 1 } })).toMatchObject({ amounts: [{ key: 'oro', label: 'Oro', amount: 1 }], total: 100 })
  })

  it('keeps instances apart: each reads its own key, and the coins item keeps its own keys', () => {
    const two = [acciones(), dinero(), caja(), caja({ key: 'banco', label: 'Banco' })]
    const resolved = resolveSheet(sheetOf(two, [{ key: 'b', mode: 'plano', items: ['dinero', 'caja', 'banco'] }]), {
      monedas: { oro: 1 },
      caja: { bronce: 7 },
      banco: { plata: 3 },
    }).sections[0].blocks[0].items
    expect(resolved.map((i) => [i.key, i.kind === 'economy' ? i.total : i.kind === 'coins' ? i.carriedTotal : null])).toEqual([['dinero', 100], ['caja', 7], ['banco', 30]])
  })

  it('resolves with no denominations when the sheet has no coin table (an invalid sheet never breaks the resolver)', () => {
    expect(economy({ caja: { oro: 1 } }, [acciones(), caja()])).toMatchObject({ denominations: [], amounts: [], total: 0, empty: true })
  })

  it('exposes rewardDestination only when it is true, on coins and on economy items', () => {
    const resolved = (extraCoins: Loose, extraCaja: Loose) =>
      resolveSheet(sheetOf([acciones(), dinero(extraCoins), caja(extraCaja)], blocks), {}).sections[0].blocks[0].items
    const [coins, eco] = resolved({ rewardDestination: true }, {})
    expect(coins).toMatchObject({ kind: 'coins', rewardDestination: true })
    expect('rewardDestination' in eco).toBe(false)
    const [coins2, eco2] = resolved({}, { rewardDestination: true })
    expect('rewardDestination' in coins2).toBe(false)
    expect(eco2).toMatchObject({ kind: 'economy', rewardDestination: true })
    const [coins3, eco3] = resolved({ rewardDestination: false }, { rewardDestination: false })
    expect('rewardDestination' in coins3 || 'rewardDestination' in eco3).toBe(false)
  })

  it('does not change the coins item of a sheet without economy tables', () => {
    const coins = resolveSheet(sheetOf([dinero()], [{ key: 'b', mode: 'plano', items: ['dinero'] }]), { monedas: { oro: 1, bronce: 2 }, monedas_guardado: { plata: 4 } }).sections[0].blocks[0].items[0]
    expect(coins).toEqual({
      kind: 'coins',
      key: 'dinero',
      label: 'Dinero',
      denominations: [{ key: 'oro', label: 'Oro', value: 100 }, { key: 'plata', label: 'Plata', value: 10 }, { key: 'bronce', label: 'Bronce', value: 1 }],
      carried: [{ key: 'oro', label: 'Oro', amount: 1 }, { key: 'bronce', label: 'Bronce', amount: 2 }],
      stored: [{ key: 'plata', label: 'Plata', amount: 4 }],
      carriedTotal: 102,
      storedTotal: 40,
      empty: false,
    })
  })

  it('makes a section of only empty economy tables empty', () => {
    const resolved = resolveSheet(sheetOf([dinero(), caja()], blocks), {})
    expect(resolved.sections[0].empty).toBe(true)
    expect(resolveSheet(sheetOf([dinero(), caja()], blocks), { caja: { oro: 1 } }).sections[0].empty).toBe(false)
  })
})
