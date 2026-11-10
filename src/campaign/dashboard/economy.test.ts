import { describe, expect, it } from 'vitest'
import type { FlatEntity } from '../../data'
import { parseSystemProfile } from '../system/systemProfile'
import { economySummary, formatEconomy } from './economy'

const pj = (over: Record<string, unknown> = {}): FlatEntity => ({ id: 1, campaign_id: 'c1', created_at: '', updated_at: '', estado: 'publicado', ...over })

const rows = [
  { key: 'pp', label: 'Platino', value: 1000 },
  { key: 'gp', label: 'Oro', value: 100 },
  { key: 'cp', label: 'Cobre', value: 1 },
]
const sheet = (destination: 'monedas' | 'economia') => ({
  categories: [{
    key: 'cat',
    sections: [{
      key: 'sec',
      items: [
        { kind: 'table', type: 'monedas', key: 'monedas', label: 'Monedas', rows, ...(destination === 'monedas' ? { rewardDestination: true } : {}) },
        { kind: 'table', type: 'economia', key: 'bolsa', label: 'Bolsa', editableBy: 'dm', ...(destination === 'economia' ? { rewardDestination: true } : {}) },
      ],
    }],
  }],
})
const system = (overrides: Record<string, unknown> = {}) => parseSystemProfile({ version: 1, ...overrides })

describe('economySummary', () => {
  it('legacy: sums monedas and monedas_guardado at the D&D rates, in the largest configured unit', () => {
    const s = economySummary(pj({ monedas: { pp: 1, gp: 2, ep: 0, sp: 0, cp: 50 }, monedas_guardado: { gp: 10 } }), system())
    expect(s).toEqual({ total: 2.25, unit: 'platino', onHand: 1.25, saved: 1 })
  })
  it('legacy: only the denominations the system keeps count; hidden when currency is disabled', () => {
    const profile = system({ currency: { enabled: true, denominations: [{ key: 'gp', label: 'oro' }, { key: 'cp', label: 'cobre' }] } })
    expect(economySummary(pj({ monedas: { pp: 5, gp: 3, cp: 50 } }), profile)).toEqual({ total: 3.5, unit: 'oro', onHand: 3.5, saved: 0 })
    expect(economySummary(pj({ monedas: { gp: 3 } }), system({ currency: { enabled: false, denominations: [] } }))).toBeNull()
  })
  it('monedas sheet: sheet equivalences over monedas + monedas_guardado, labelled by the largest row', () => {
    const s = economySummary(pj({ monedas: { pp: 1, gp: 5, cp: 25 }, monedas_guardado: { gp: 10, cp: 5 } }), system({ sheet: sheet('monedas') }))
    expect(s?.unit).toBe('Platino')
    expect(s?.onHand).toBeCloseTo(1.525)
    expect(s?.saved).toBeCloseTo(1.005)
    expect(s?.total).toBeCloseTo(2.53)
  })
  it('economia sheet: amounts under pj[key], nothing saved', () => {
    const s = economySummary(pj({ bolsa: { pp: 2, gp: 5 } }), system({ sheet: sheet('economia') }))
    expect(s).toEqual({ total: 2.5, unit: 'Platino', onHand: 2.5, saved: null })
  })
  it('hidden when the sheet has no reward destination', () => {
    const none = { categories: [{ key: 'c', sections: [{ key: 's', items: [{ kind: 'table', type: 'monedas', key: 'monedas', label: 'M', rows }] }] }] }
    expect(economySummary(pj({ monedas: { gp: 1 } }), system({ sheet: none }))).toBeNull()
  })
  it('tolerates garbage amounts', () => {
    expect(economySummary(pj({ monedas: 'x', monedas_guardado: null }), system())).toEqual({ total: 0, unit: 'platino', onHand: 0, saved: 0 })
  })
})

describe('formatEconomy', () => {
  it('uses es-AR with up to two decimals', () => {
    expect(formatEconomy(158.2857)).toBe('158,29')
    expect(formatEconomy(32)).toBe('32')
    expect(formatEconomy(1234.5)).toBe('1234,5')
  })
})
