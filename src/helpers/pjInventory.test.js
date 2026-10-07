import { describe, expect, it } from 'vitest'
import { calcTotalCP, formatTotalCP } from './pjInventory'

describe('calcTotalCP', () => {
  it('converts every currency at the D&D 5e rates and multiplies by the quantity', () => {
    expect(calcTotalCP([{ precio: 1, precio_moneda: 'pp' }], [])).toBe(1000)
    expect(calcTotalCP([{ precio: 3, cantidad: 2, precio_moneda: 'gp' }], [])).toBe(600)
    expect(calcTotalCP([{ precio: 1, precio_moneda: 'ep' }], [])).toBe(50)
    expect(calcTotalCP([{ precio: 7, precio_moneda: 'sp' }], [])).toBe(70)
    expect(calcTotalCP([{ precio: 9, precio_moneda: 'cp' }], [])).toBe(9)
  })

  it('adds weapons to equipment, defaults to gp and to quantity 1, and ignores free or unpriced items', () => {
    expect(calcTotalCP([{ precio: 2 }, { nombre: 'sin precio' }, { precio: 0, precio_moneda: 'pp' }], [{ precio: 1, precio_moneda: 'sp' }])).toBe(210)
    expect(calcTotalCP([{ precio: 5 }, { precio: 5, cantidad: 'x' }, { precio: 5, cantidad: null }], [])).toBe(1500) // missing / invalid quantity counts as 1
    expect(calcTotalCP([{ precio: 5, cantidad: 0 }], [])).toBe(0) // an explicit 0 really is 0
    expect(calcTotalCP([{ precio: 4, precio_moneda: 'zz' }], [])).toBe(400) // unknown currency: gp
  })

  it('truncates fractional prices and quantities (whole numbers, like the form) instead of rounding', () => {
    expect(calcTotalCP([{ precio: '2.9', precio_moneda: 'gp' }], [])).toBe(200)
    expect(calcTotalCP([{ precio: 3, cantidad: '2.9', precio_moneda: 'cp' }], [])).toBe(6)
  })
})

describe('calcTotalCP never goes negative', () => {
  it('negative prices and quantities count as 0', () => {
    expect(calcTotalCP([{ precio: -5, precio_moneda: 'gp' }], [])).toBe(0)
    expect(calcTotalCP([{ precio: 5, cantidad: -3, precio_moneda: 'gp' }], [])).toBe(0)
    expect(calcTotalCP([{ precio: -5 }, { precio: 2, precio_moneda: 'cp' }], [{ precio: -1 }])).toBe(2)
  })
})

describe('formatTotalCP', () => {
  it('is null for zero and splits copper into platino / oro / plata / bronce, skipping empty denominations', () => {
    expect(formatTotalCP(0)).toBeNull()
    expect(formatTotalCP(-50)).toBeNull()
    expect(formatTotalCP(NaN)).toBeNull()
    expect(formatTotalCP(1)).toBe('1 bronce')
    expect(formatTotalCP(1234)).toBe('1 platino 2 oro 3 plata 4 bronce')
    expect(formatTotalCP(1000)).toBe('1 platino')
    expect(formatTotalCP(50)).toBe('5 plata') // electrum has no line of its own
    expect(formatTotalCP(5000)).toBe('5 platino')
  })
})
