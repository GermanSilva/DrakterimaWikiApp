import { describe, expect, it } from 'vitest'
import { validateSheet } from '../sheet/sheetModel'
import type { Node } from './draft'
import { economyErrors, economyItems, economyProjection, holdsEconomy, mergeEconomy, placementProjection, rewardKey, setRewardByKey } from './economy'

const coins = (extra: Node = {}): Node => ({
  kind: 'table',
  type: 'monedas',
  key: 'bolsa',
  label: 'Bolsa',
  rows: [{ key: 'oro', label: 'Oro', value: 100 }, { key: 'bronce', label: 'Bronce', value: 1 }],
  ...extra,
})
const bank = (extra: Node = {}): Node => ({ kind: 'table', type: 'economia', key: 'banco', label: 'Banco', editableBy: 'dm', ...extra })
const edad: Node = { kind: 'field', key: 'edad', label: 'Edad', type: 'short', editableBy: 'dm' }

const sheet = (equipo: Node[], extra: Node = {}): Node => ({
  categories: [
    {
      key: 'general',
      label: 'General',
      sections: [
        { key: 'perfil', label: 'Perfil', items: [edad], blocks: [] },
        { key: 'equipo', label: 'Equipo', items: equipo, blocks: [{ key: 'dinero', title: 'Dinero', mode: 'plano', items: equipo.map((i) => String(i.key)) }] },
      ],
    },
  ],
  roles: {},
  ...extra,
})
const equipoItems = (s: Node): Node[] => ((s.categories as Node[])[0].sections as Node[])[1].items as Node[]

describe('economy parts of a sheet', () => {
  it('lists coin and economy tables with where they sit, and the reward destination', () => {
    const s = sheet([coins(), bank({ rewardDestination: true })])
    expect(economyItems(s).map((e) => [e.item.key, e.section.key, e.category.key])).toEqual([['bolsa', 'equipo', 'general'], ['banco', 'equipo', 'general']])
    expect(rewardKey(s)).toBe('banco')
    expect(rewardKey(sheet([coins()]))).toBeNull()
  })

  it('setRewardByKey leaves exactly one destination, or none', () => {
    const s = sheet([coins({ rewardDestination: true }), bank()])
    const moved = setRewardByKey(s, 'banco')
    expect(equipoItems(moved).map((i) => i.rewardDestination)).toEqual([undefined, true])
    expect(equipoItems(setRewardByKey(moved, null)).map((i) => i.rewardDestination)).toEqual([undefined, undefined])
  })

  it('the projection ignores placement and the destination but sees denominations, labels and instances', () => {
    const a = sheet([coins({ rewardDestination: true }), bank()])
    const reordered = sheet([bank(), coins()])
    expect(JSON.stringify(economyProjection(a))).toBe(JSON.stringify(economyProjection(sheet([coins(), bank()]))))
    expect(JSON.stringify(economyProjection(a))).not.toBe(JSON.stringify(economyProjection(sheet([coins({ label: 'Otra' }), bank()]))))
    expect(economyProjection(reordered)).toBeTruthy()
  })

  it('the placement projection ignores economy items and what refers to them', () => {
    const withCoins = sheet([coins(), bank()], { card: { pinned: [{ key: 'bolsa' }] } })
    const without = sheet([], { card: { pinned: [] } })
    expect(JSON.stringify(placementProjection(withCoins))).toBe(JSON.stringify(placementProjection(without)))
  })

  it('holdsEconomy tells whether a section or category contains economy tables', () => {
    const s = sheet([coins()])
    const sections = (s.categories as Node[])[0].sections as Node[]
    expect(holdsEconomy(sections[0])).toBe(false)
    expect(holdsEconomy(sections[1])).toBe(true)
    expect(holdsEconomy((s.categories as Node[])[0])).toBe(true)
  })
})

describe('mergeEconomy', () => {
  it('builder save: placement from the draft, economy from the latest stored sheet', () => {
    const base = sheet([coins(), bank()])
    // the DM reordered the section in the builder (draft) and added a field
    const draft = sheet([bank(), coins()])
    ;(draft.categories as Node[])[0].sections = [{ key: 'perfil', label: 'Perfil', items: [edad, { ...edad, key: 'otro', label: 'Otro' }], blocks: [] }, ((draft.categories as Node[])[0].sections as Node[])[1]]
    // meanwhile Sistema renamed a coin, added a denomination and moved the destination
    const latest = sheet([coins({ label: 'Monedero', rows: [{ key: 'oro', label: 'Oro', value: 100 }, { key: 'plata', label: 'Plata', value: 10 }, { key: 'bronce', label: 'Bronce', value: 1 }], rewardDestination: true }), bank()])
    const { sheet: out, blocked } = mergeEconomy({ placement: draft, economy: latest, base, latest })
    expect(blocked).toBeNull()
    expect(equipoItems(out).map((i) => i.key)).toEqual(['banco', 'bolsa']) // the draft's order
    const bolsa = equipoItems(out)[1]
    expect(bolsa.label).toBe('Monedero')
    expect((bolsa.rows as Node[]).map((r) => r.key)).toEqual(['oro', 'plata', 'bronce'])
    expect(bolsa.rewardDestination).toBe(true)
    expect((((out.categories as Node[])[0].sections as Node[])[0].items as Node[]).map((i) => i.key)).toEqual(['edad', 'otro']) // the builder's field survives
    expect(validateSheet(out).ok).toBe(true)
  })

  it('builder save: an instance created meanwhile in Sistema is placed in its section; one deleted meanwhile is dropped with its references', () => {
    const base = sheet([coins(), bank()], { card: { pinned: [{ key: 'banco' }] } })
    const draft = JSON.parse(JSON.stringify(base)) as Node
    const created = bank({ key: 'gremio', label: 'Gremio' })
    const latest = sheet([coins(), created])
    const { sheet: out } = mergeEconomy({ placement: draft, economy: latest, base, latest })
    expect(equipoItems(out).map((i) => i.key)).toEqual(['bolsa', 'gremio'])
    expect((out.card as Node).pinned).toEqual([])
    expect(((((out.categories as Node[])[0].sections as Node[])[1].blocks as Node[])[0].items as string[])).toEqual(['bolsa'])
  })

  it('Sistema save: economy from the draft, placement and destination from the latest stored sheet', () => {
    const base = sheet([coins({ rewardDestination: true }), bank()])
    // meanwhile the builder reordered and Juegos moved the destination
    const latest = sheet([bank({ rewardDestination: true }), coins()])
    const draft = JSON.parse(JSON.stringify(base)) as Node
    ;((equipoItems(draft)[0].rows as Node[])[0] as Node).label = 'Corona'
    equipoItems(draft).push({ _new: true, kind: 'table', type: 'economia', key: 'caja', label: 'Caja', editableBy: 'dm' })
    const { sheet: out, blocked } = mergeEconomy({ placement: latest, economy: draft, base, latest })
    expect(blocked).toBeNull()
    expect(equipoItems(out).map((i) => i.key)).toEqual(['banco', 'bolsa', 'caja'])
    expect(equipoItems(out).map((i) => i.rewardDestination)).toEqual([true, undefined, undefined])
    expect(((equipoItems(out)[1].rows as Node[])[0] as Node).label).toBe('Corona')
    expect(JSON.stringify(out)).not.toContain('_new')
  })

  it('Sistema save: refuses to delete an instance that became the destination meanwhile', () => {
    const base = sheet([coins({ rewardDestination: true }), bank()])
    const draft = sheet([coins()]) // banco deleted in the draft
    const latest = sheet([coins(), bank({ rewardDestination: true })])
    const { blocked } = mergeEconomy({ placement: latest, economy: draft, base, latest })
    expect(blocked).toMatch(/destino de recompensa/)
  })

  it('takes the discarded entries of the economy from its owner and keeps the rest of the placement owner', () => {
    const entry = (key: string, type: string) => ({ item: { kind: 'table', type, key, label: key }, section: 'equipo', at: '2026-11-11T00:00:00.000Z' })
    const field = { item: { kind: 'field', key: 'viejo', label: 'Viejo', type: 'short', editableBy: 'dm' }, section: 'perfil', at: '2026-11-01T00:00:00.000Z' }
    const draft = sheet([coins()], { discarded: [field] })
    const latest = sheet([coins()], { discarded: [entry('banco', 'economia')] })
    const { sheet: out } = mergeEconomy({ placement: draft, economy: latest, base: draft, latest })
    expect((out.discarded as Node[]).map((e) => (e.item as Node).key)).toEqual(['viejo', 'banco'])
  })

  it('returns the placement untouched when nothing economic differs', () => {
    const s = sheet([coins({ rewardDestination: true }), bank()])
    const { sheet: out } = mergeEconomy({ placement: s, economy: s, base: s, latest: s })
    expect(JSON.stringify(out)).toBe(JSON.stringify(s))
  })
})

describe('economyErrors', () => {
  it('keeps the validation errors that belong to coin and economy tables', () => {
    const bad = sheet([coins({ rows: [{ key: 'oro', label: 'Oro', value: 5 }, { key: 'plata', label: 'Plata', value: 5 }] }), { ...edad, label: '' }])
    const result = validateSheet(bad)
    expect(result.ok).toBe(false)
    if (result.ok) return
    const mine = economyErrors(bad, result.errors)
    expect(mine.length).toBeGreaterThan(0)
    expect(mine.length).toBeLessThan(result.errors.length)
    expect(mine.every((e) => e.path.includes('items[0]'))).toBe(true)
  })
})
