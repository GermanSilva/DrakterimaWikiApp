import { describe, expect, it } from 'vitest'
import { assertNoDmNotes, extractDmNotes, fromRow, splitFlat, toInsertRow, withoutDmNotes } from './mappers'

const pnjRow = {
  id: 7,
  campaign_id: 'camp-1',
  created_by: 'u1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  nombre: 'Aldric',
  region: 'magral',
  relacion: 'aliado',
  imagen_url: '',
  estado: 'publicado',
  data: { rol: 'herrero', descripcion: 'Forja espadas' },
}

describe('fromRow', () => {
  it('spreads data keys next to promoted columns and keeps campaign_id', () => {
    expect(fromRow('pnjs', pnjRow)).toEqual({
      id: 7,
      campaign_id: 'camp-1',
      created_by: 'u1',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
      nombre: 'Aldric',
      region: 'magral',
      relacion: 'aliado',
      imagen_url: '',
      estado: 'publicado',
      rol: 'herrero',
      descripcion: 'Forja espadas',
    })
  })

  it('lets a promoted column win over a data key with the same name', () => {
    expect(fromRow('pnjs', { ...pnjRow, data: { nombre: 'stale' } }).nombre).toBe('Aldric')
  })

  it('never exposes visible_to, even if a row carried it', () => {
    expect(fromRow('pnjs', { ...pnjRow, visible_to: [1, 2], data: { visible_to: [3] } })).not.toHaveProperty('visible_to')
  })

  it('strips reserved keys and DM-private fields from legacy data', () => {
    const flat = fromRow('pnjs', {
      ...pnjRow,
      data: { rol: 'r', visible_to: [1], visibilidad: [2], notas: 'x', secreto: 'y', ganchos: 'z', id: 99, campaign_id: 'other' },
    })
    for (const k of ['visible_to', 'visibilidad', 'notas', 'secreto', 'ganchos']) expect(flat).not.toHaveProperty(k)
    expect(flat).toMatchObject({ rol: 'r', id: 7, campaign_id: 'camp-1' })
  })

  it('skips absent columns and tolerates missing data (partial realtime payloads)', () => {
    expect(fromRow('pnjs', { id: 1, campaign_id: 'c', nombre: 'x' })).toEqual({ id: 1, campaign_id: 'c', nombre: 'x' })
  })

  it('maps a null session date to the UI empty string', () => {
    expect(fromRow('sesiones', { id: 1, campaign_id: 'c', fecha: null, data: {} }).fecha).toBe('')
  })

  it('keeps pj coins as columns', () => {
    const flat = fromRow('pjs', { id: 1, campaign_id: 'c', monedas: { gp: 5 }, monedas_guardado: { pp: 1 }, data: { stat_hp: 9 } })
    expect(flat).toMatchObject({ monedas: { gp: 5 }, monedas_guardado: { pp: 1 }, stat_hp: 9 })
  })
})

describe('splitFlat / toInsertRow', () => {
  it('routes promoted columns, data keys and DM notes to different places', () => {
    const { columns, data, dmNotes } = splitFlat('pnjs', {
      nombre: 'Aldric',
      rol: 'herrero',
      secreto: 'es un espia',
      notas: 'n',
    })
    expect(columns).toEqual({ nombre: 'Aldric' })
    expect(data).toEqual({ rol: 'herrero' })
    expect(dmNotes).toEqual({ secreto: 'es un espia', notas: 'n' })
  })

  it('drops id, campaign_id, server-managed fields and any visibility key', () => {
    const { columns, data } = splitFlat('lugares', {
      id: 1,
      campaign_id: 'x',
      created_at: 'a',
      updated_at: 'b',
      created_by: 'c',
      visible_to: [1],
      visibilidad: [2],
      nombre: 'Puerto',
    })
    expect(columns).toEqual({ nombre: 'Puerto' })
    expect(data).toEqual({})
  })

  it('skips undefined values but keeps null (to clear a data key)', () => {
    const { columns, data } = splitFlat('pnjs', { nombre: undefined, rol: null })
    expect(columns).toEqual({})
    expect(data).toEqual({ rol: null })
  })

  it('stores an empty session date as null', () => {
    expect(splitFlat('sesiones', { fecha: '' }).columns).toEqual({ fecha: null })
  })

  it('toInsertRow sets the campaign and never sends id or visible_to', () => {
    const row = toInsertRow('pnjs', 'camp-9', { id: 5, nombre: 'Z', rol: 'r', visible_to: [1] })
    expect(row).toEqual({ nombre: 'Z', data: { rol: 'r' }, campaign_id: 'camp-9' })
    expect(JSON.stringify(row)).not.toContain('visible_to')
  })

  it('toInsertRow rejects DM-private fields instead of dropping them', () => {
    expect(() => toInsertRow('pnjs', 'c', { nombre: 'Z', secreto: 's' })).toThrow(/entity_dm_notes/)
    expect(() => assertNoDmNotes({ ganchos: '' })).toThrow()
    expect(() => assertNoDmNotes({ nombre: 'ok' })).not.toThrow()
  })

  it('coerces the empty string to null only for nullable promoted columns', () => {
    expect(splitFlat('map_points', { link_type: '', link_id: '', nombre: '' }).columns).toEqual({
      link_type: null,
      link_id: null,
      nombre: '',
    })
    expect(splitFlat('sesiones', { numero: '', fecha: '', titulo: '' }).columns).toEqual({
      numero: null,
      fecha: null,
      titulo: '',
    })
    expect(splitFlat('pjs', { owner_id: '' }).columns).toEqual({ owner_id: null })
  })

  it('round-trips a flat entity through a row (modulo server-managed fields)', () => {
    const flat = fromRow('pnjs', pnjRow)
    const row = toInsertRow('pnjs', flat.campaign_id, flat)
    expect(fromRow('pnjs', { ...row, id: flat.id })).toMatchObject({
      nombre: 'Aldric',
      region: 'magral',
      rol: 'herrero',
      descripcion: 'Forja espadas',
      campaign_id: 'camp-1',
    })
  })
})

describe('withoutDmNotes', () => {
  it('removes the DM-private keys only', () => {
    expect(withoutDmNotes({ nombre: 'x', notas: 'a', secreto: 'b' })).toEqual({ nombre: 'x' })
  })
})

describe('extractDmNotes', () => {
  it('returns only the DM-private keys that were provided', () => {
    expect(extractDmNotes({ nombre: 'x', notas: 'a', ganchos: 'g' })).toEqual({ notas: 'a', ganchos: 'g' })
    expect(extractDmNotes({ nombre: 'x' })).toEqual({})
  })
})
