import { describe, expect, it } from 'vitest'
import { playerWritableKeys } from './sheetAccess'
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
