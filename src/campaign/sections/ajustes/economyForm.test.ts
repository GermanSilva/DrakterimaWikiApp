import { describe, expect, it } from 'vitest'
import type { Node } from '../../system/builder/draft'
import { addDenomination, addInstance, coinSummary, defaultSection, denominations, equivalence, moveDenomination, renameDenomination, renameInstance, sectionChoices, setDenominationKey, setDenominationValue } from './economyForm'

const SHEET: Node = {
  categories: [
    {
      key: 'general',
      label: 'General',
      sections: [
        { key: 'perfil', label: 'Perfil', items: [], blocks: [] },
        {
          key: 'equipo',
          label: 'Equipo',
          items: [{ kind: 'table', type: 'monedas', key: 'bolsa', label: 'Bolsa', rows: [{ key: 'oro', label: 'oro', value: 100 }, { key: 'plata', label: 'plata', value: 10 }, { key: 'bronce', label: 'bronce', value: 1 }] }],
          blocks: [],
        },
      ],
    },
  ],
  roles: {},
}
const NO_COINS: Node = { categories: [{ key: 'g', label: 'G', sections: [{ key: 's', label: 'S', items: [], blocks: [] }] }], roles: {} }

describe('denominations draft', () => {
  it('summarises the equivalences from the values, largest first', () => {
    expect(coinSummary(denominations(SHEET))).toBe('1 oro = 10 plata = 100 bronce')
    expect(coinSummary([{ key: 'a', label: 'A', value: 1 }, { key: 'b', label: 'B', value: 3 }])).toBe('1 B = 3 A')
    expect(coinSummary([{ key: 'a', label: 'A', value: 1 }, { key: 'b', label: 'B', value: 30 }, { key: 'c', label: 'C', value: 7 }])).toBe('1 B = 4.29 C = 30 A')
    expect(coinSummary([{ key: 'a', label: 'A', value: 1 }])).toBeNull()
    expect(coinSummary([{ key: 'a', label: 'A', value: 'x' }, { key: 'b', label: 'B', value: 2 }])).toBeNull()
  })

  it('shows what each denomination is worth in the base one', () => {
    const rows = denominations(SHEET)
    expect(rows.map((r) => equivalence(rows, r))).toEqual(['100 bronce', '10 bronce', '1 bronce'])
    expect(equivalence(rows, { key: 'x', value: 'y' })).toBe('—')
  })

  it('adds a denomination worth ten times the largest, whose key follows the name until saved', () => {
    const next = addDenomination(SHEET)
    const added = denominations(next)[3]
    expect(added).toMatchObject({ _new: true, label: 'Nueva moneda', value: 1000 })
    const renamed = renameDenomination(next, 3, 'Platino')
    expect(denominations(renamed)[3]).toMatchObject({ label: 'Platino', key: 'platino' })
    expect(denominations(setDenominationKey(renamed, 3, 'plat'))[3].key).toBe('plat')
    // a saved key does not follow its name
    expect(denominations(renameDenomination(SHEET, 0, 'Corona'))[0]).toMatchObject({ label: 'Corona', key: 'oro' })
  })

  it('keeps a non-numeric value as typed so the validator can report it', () => {
    expect(denominations(setDenominationValue(SHEET, 1, '25'))[1].value).toBe(25)
    expect(denominations(setDenominationValue(SHEET, 1, '2,5'))[1].value).toBe('2,5')
  })

  it('moves a denomination and leaves the rest alone', () => {
    expect(denominations(moveDenomination(SHEET, 0, 1)).map((r) => r.key)).toEqual(['plata', 'oro', 'bronce'])
    expect(denominations(moveDenomination(SHEET, 0, -1)).map((r) => r.key)).toEqual(['oro', 'plata', 'bronce'])
  })
})

describe('instances draft', () => {
  it('lists the sections as "Categoría › Sección" and defaults to the one holding the coin table', () => {
    expect(sectionChoices(SHEET).map((c) => c.where)).toEqual(['General › Perfil', 'General › Equipo'])
    expect(defaultSection(SHEET)).toBe('equipo')
    expect(defaultSection(NO_COINS)).toBe('s')
  })

  it('creates an economy table in the chosen section, with a key from the name that avoids the used ones', () => {
    const next = addInstance(SHEET, 'Banco del gremio', 'perfil')
    const items = ((next.categories as Node[])[0].sections as Node[])[0].items as Node[]
    expect(items).toEqual([{ _new: true, kind: 'table', type: 'economia', key: 'banco_del_gremio', label: 'Banco del gremio', editableBy: 'dm' }])
    const again = addInstance(next, 'Banco del gremio', 'perfil')
    expect((((again.categories as Node[])[0].sections as Node[])[0].items as Node[]).map((i) => i.key)).toEqual(['banco_del_gremio', 'banco_del_gremio_2'])
  })

  it('the first instance of a sheet without coins is its coin table', () => {
    const next = addInstance(NO_COINS, 'Monedero', 's')
    expect((((next.categories as Node[])[0].sections as Node[])[0].items as Node[])[0]).toMatchObject({ type: 'monedas', key: 'monedero', rows: [] })
  })

  it('renames an instance while new, keeping the saved key fixed', () => {
    const next = addInstance(SHEET, 'Caja', 'equipo')
    const path = ['categories', 0, 'sections', 1, 'items', 1] as const
    expect(((renameInstance(next, path, 'Caja fuerte').categories as Node[])[0].sections as Node[])[1].items).toMatchObject([{ key: 'bolsa' }, { key: 'caja_fuerte', label: 'Caja fuerte' }])
    const saved = renameInstance(SHEET, ['categories', 0, 'sections', 1, 'items', 0], 'Monedero')
    expect((((saved.categories as Node[])[0].sections as Node[])[1].items as Node[])[0]).toMatchObject({ key: 'bolsa', label: 'Monedero' })
  })
})
