/** G4b: the pure model of the sheet editor: who writes what, the save payload, row and reset operations, unread stamps. */
import { describe, expect, it } from 'vitest'
import { addRow, removeRow, resetCell, setAmount, setCell, setKey, sheetPatch, sheetStamps, writeRules } from './sheetEditorModel'
import { playerWritableKeys } from './sheetAccess'
import { ENTITY, SHEET, type Loose } from './editorFixture'

const patchOf = (draft: Loose, isDM: boolean, entity: Loose = ENTITY) => sheetPatch(SHEET, entity, { ...entity, ...draft }, isDM)

describe('writeRules: who may write which key', () => {
  it('a player gets exactly the keys the database guard derives (playerWritableKeys)', () => {
    expect(Object.keys(writeRules(SHEET, false)).sort()).toEqual(playerWritableKeys(SHEET))
    expect(playerWritableKeys(SHEET)).toEqual(['atl', 'bio', 'diario', 'edad', 'fue', 'inspirado', 'modo', 'postura'])
  })

  it('the DM gets every non-formula place, DM or player owned, including each cell of Capacidades and the tables', () => {
    expect(Object.keys(writeRules(SHEET, true)).sort()).toEqual(
      ['atl', 'atl__nota', 'bio', 'conjuros', 'des', 'diario', 'edad', 'espacios', 'fue', 'inspirado', 'modo', 'postura', 'secreto_dm', 'sig', 'sig__nota', 'suerte'].sort(),
    )
  })

  it('never offers a formula, a calc, a hidden field, a coin or an economy amount through the generic rules', () => {
    const keys = Object.keys(writeRules(SHEET, true))
    for (const key of ['doble_suerte', 'oculto', 'atl__total', 'monedas', 'monedero', 'banco']) expect(keys).not.toContain(key)
  })
})

describe('sheetPatch: the payload of a save', () => {
  it('is empty when nothing changed (also for a DM)', () => {
    expect(patchOf({}, true)).toEqual({ patch: {}, errors: [] })
    expect(patchOf({}, false)).toEqual({ patch: {}, errors: [] })
  })

  it('a DM sends every edited key, identity columns included, and nothing else', () => {
    const { patch, errors } = patchOf({ nombre: 'Ana B', estado: 'secreto', suerte: 7, secreto_dm: 'y', sig: 4, atl__nota: 'm', fue: 15, edad: '31' }, true)
    expect(errors).toEqual([])
    expect(patch).toEqual({ nombre: 'Ana B', estado: 'secreto', suerte: 7, secreto_dm: 'y', sig: 4, atl__nota: 'm', fue: 15, edad: '31' })
  })

  it('a player sends only the keys the guard allows: their DM keys, estado, jugador and the rest are dropped silently', () => {
    const { patch, errors } = patchOf(
      { nombre: 'Ana B', region: 'nezor', imagen_url: 'https://x/y.png', edad: '31', fue: 15, atl: 4, inspirado: true, postura: 'alta',
        suerte: 9, secreto_dm: 'hack', des: 20, sig: 9, atl__nota: 'hack', estado: 'borrador', jugador: 'Otro', monedas: { oro: 99 }, banco: { oro: 99 }, doble_suerte: 1, clase: 'Mago' },
      false,
    )
    expect(errors).toEqual([])
    expect(patch).toEqual({ nombre: 'Ana B', region: 'nezor', imagen_url: 'https://x/y.png', clase: 'Mago', edad: '31', fue: 15, atl: 4, inspirado: true, postura: 'alta' })
  })

  it('never includes jugador, even for a DM (it follows the assignment)', () => {
    expect(patchOf({ jugador: 'Otro' }, true).patch).toEqual({})
  })

  it('reports a value the guard would reject instead of sending it (option not declared, text too long, number out of range)', () => {
    const player = patchOf({ postura: 'bogus', edad: 'x'.repeat(501) }, false)
    expect(player.patch).toEqual({})
    expect(player.errors.map((e) => e.key).sort()).toEqual(['edad', 'postura'])
    const dm = patchOf({ suerte: 11 }, true)
    expect(dm.patch).toEqual({})
    expect(dm.errors).toEqual([{ key: 'suerte', message: expect.any(String) }])
    expect(patchOf({ suerte: null }, true).patch).toEqual({ suerte: null }) // clearing is a value
  })

  it('the DM edits coin and economy amounts per denomination: non-negative integers only', () => {
    expect(patchOf({ monedas: { oro: 7, plata: 2 }, monedas_guardado: { oro: 1 }, banco: { oro: 3 } }, true).patch).toEqual({
      monedas: { oro: 7, plata: 2 }, monedas_guardado: { oro: 1 }, banco: { oro: 3 },
    })
    for (const bad of [-1, 1.5, '3', null, Number.NaN]) {
      const result = patchOf({ monedas: { oro: bad } }, true)
      expect(result.patch).toEqual({})
      expect(result.errors.map((e) => e.key)).toEqual(['monedas'])
    }
    expect(patchOf({ monedas: ['x'] }, true).errors.map((e) => e.key)).toEqual(['monedas'])
  })

  it('a player never sends coin or economy amounts', () => {
    expect(patchOf({ monedas: { oro: 7 }, banco: { oro: 3 } }, false)).toEqual({ patch: {}, errors: [] })
  })

  it('creating (no stored entity) sends only the non-default values', () => {
    const { patch } = sheetPatch(SHEET, {}, { nombre: 'Nuevo', region: 'magral', estado: 'publicado', imagen_url: '', suerte: 0, edad: '', inspirado: false, espacios: [] }, true)
    expect(patch).toEqual({ nombre: 'Nuevo', region: 'magral', estado: 'publicado' })
  })
})

describe('rows: ids, zero rows (S16 A1)', () => {
  it('drops the rows of a Libre table that are entirely empty or zero, keeping stored ids', () => {
    const rows = [
      { id: 1, nivel: 3, total: 3, gastados: 1 },
      { id: 2, nivel: 0, total: 0, gastados: 0 },
      { id: 3, nivel: '', total: null, nota: '' },
      { id: 4 },
      { id: 5, nivel: 0, total: 0, gastados: 0, nota: 'a mano' },
    ]
    expect(patchOf({ espacios: rows }, true).patch).toEqual({ espacios: [rows[0], rows[4]] })
  })

  it('ignores formula columns when judging a row and counts any text, even a space, as content', () => {
    const rows = [{ id: 1, texto: '', horas: 0 }, { id: 2, texto: '', horas: 0, doble: 5 }, { id: 3, texto: ' ', horas: 0 }]
    // diario is a player table: `doble` is a formula column, not a stored cell, so row 2 is as blank as row 1
    expect(patchOf({ diario: rows }, false)).toEqual({ patch: { diario: [rows[2]] }, errors: [] })
  })

  it('an added empty row is not a change: nothing is sent', () => {
    expect(patchOf({ espacios: [...(ENTITY.espacios as Loose[]), { id: 2 }] }, true)).toEqual({ patch: {}, errors: [] })
  })

  it('does not touch a stored zero row of a table nobody edited', () => {
    const stored = { ...ENTITY, espacios: [{ id: 1, nivel: 0, total: 0, gastados: 0 }] }
    expect(sheetPatch(SHEET, stored, { ...stored, suerte: 4 }, true).patch).toEqual({ suerte: 4 })
  })

  it('Habilidad rows are never dropped', () => {
    const rows = [{ id: 1, nombre: '', categoria: '', mana: 0 }]
    expect(patchOf({ conjuros: rows }, true).patch).toEqual({ conjuros: rows })
  })

  it('gives an id to rows that lack one, unique among the table, and keeps the stored ones', () => {
    const rows = [{ id: 7, nivel: 1, total: 1 }, { nivel: 2, total: 2 }, { id: 'a', nivel: 3, total: 3 }, { nivel: 4, total: 4 }]
    const sent = patchOf({ espacios: rows }, true).patch.espacios as Loose[]
    expect(sent.map((r) => r.nivel)).toEqual([1, 2, 3, 4])
    expect(sent[0].id).toBe(7)
    expect(sent[2].id).toBe('a')
    expect(new Set(sent.map((r) => String(r.id))).size).toBe(4)
  })

  it('a player table is judged like the guard: unknown cells are rejected', () => {
    const result = patchOf({ diario: [{ id: 1, texto: 'x', oculto: 1 }] }, false)
    expect(result.patch).toEqual({})
    expect(result.errors.map((e) => e.key)).toEqual(['diario'])
  })
})

describe('operations on the draft', () => {
  it('setKey and setCell are immutable and address the stored row', () => {
    const draft: Loose = { ...ENTITY }
    const next = setCell(draft, 'espacios', 0, 'gastados', 2)
    expect((next.espacios as Loose[])[0]).toMatchObject({ id: 1, gastados: 2 })
    expect((draft.espacios as Loose[])[0].gastados).toBe(1)
    expect(setKey(draft, 'suerte', 9).suerte).toBe(9)
    expect(draft.suerte).toBe(3)
    expect(setAmount(draft, 'monedas', 'oro', 8).monedas).toEqual({ oro: 8, plata: 0 })
    expect(setCell(draft, 'espacios', 5, 'nivel', 1)).toBe(draft) // no such row: nothing changes
  })

  it('addRow appends a row with a unique id, removeRow removes by stored index', () => {
    const draft: Loose = { espacios: [{ id: 4, nivel: 1 }, { id: 'x' }, { nivel: 2 }] }
    const added = addRow(draft, 'espacios')
    const rows = added.espacios as Loose[]
    expect(rows).toHaveLength(4)
    expect(rows[3]).toEqual({ id: 5 })
    expect((addRow({}, 'espacios').espacios as Loose[])[0]).toEqual({ id: 1 })
    expect((addRow({ espacios: [{ id: '2' }] }, 'espacios').espacios as Loose[])[1].id).toBe(3)
    expect(removeRow(added, 'espacios', 1).espacios).toEqual([{ id: 4, nivel: 1 }, { nivel: 2 }, { id: 5 }])
  })

  it('resetCell sets zero, the value of another column of the same row, or the fixed value', () => {
    const draft: Loose = { espacios: [{ id: 1, nivel: 3, total: 9, gastados: 4 }], diario: [{ id: 1, horas: 5 }], conjuros: [{ id: 1, mana: 1 }] }
    expect((resetCell(SHEET, draft, 'espacios', 0, 'gastados').espacios as Loose[])[0].gastados).toBe(9)
    expect((resetCell(SHEET, draft, 'diario', 0, 'horas').diario as Loose[])[0].horas).toBe(0)
    expect((resetCell(SHEET, draft, 'conjuros', 0, 'mana').conjuros as Loose[])[0].mana).toBe(9)
    // a column with no reset, or an unknown row, leaves the draft alone
    expect(resetCell(SHEET, draft, 'espacios', 0, 'total')).toBe(draft)
    expect(resetCell(SHEET, draft, 'espacios', 3, 'gastados')).toBe(draft)
  })

  it('reset to another column counts a missing value as 0', () => {
    const draft: Loose = { espacios: [{ id: 1, gastados: 4 }] }
    expect((resetCell(SHEET, draft, 'espacios', 0, 'gastados').espacios as Loose[])[0].gastados).toBe(0)
  })
})

describe('sheetStamps: the unread dot is per sheet section (S13, C4)', () => {
  const NOW = new Date('2026-11-05T12:00:00Z')
  it('stamps the sections that own the changed keys, identity as "general"', () => {
    const { sections, stamps } = sheetStamps(SHEET, { nombre: 'x', edad: '1', atl__nota: 'n', espacios: [], monedas: {}, banco: {} }, NOW)
    expect([...sections].sort()).toEqual(['dinero', 'general', 'perfil', 'recursos', 'stats'])
    expect(stamps).toEqual(Object.fromEntries(sections.map((s) => [s, '2026-11-05T12:00:00.000Z'])))
  })

  it('leaves out what is not a change of content', () => {
    expect(sheetStamps(SHEET, { sections_updated: { a: 'b' } }, NOW)).toEqual({ sections: [], stamps: {} })
    expect(sheetStamps(SHEET, {}, NOW)).toEqual({ sections: [], stamps: {} })
  })

  it('a key of no section counts as "general"', () => {
    expect(sheetStamps(SHEET, { estado: 'secreto' }, NOW).sections).toEqual(['general'])
  })
})

describe('sheetPatch: clase, raza and nivel (G10a)', () => {
  const stored = { ...ENTITY, clase: 'Paladín', raza: 'Humano', nivel: 3 }
  const patch = (draft: Loose, isDM: boolean) => sheetPatch(SHEET, stored, { ...stored, ...draft }, isDM)

  it('sends nothing for them when untouched', () => {
    expect(patch({}, true)).toEqual({ patch: {}, errors: [] })
    expect(patch({}, false)).toEqual({ patch: {}, errors: [] })
  })

  it('the DM sends the ones that changed, nivel as a whole number (empty or invalid counts as 1, like today)', () => {
    expect(patch({ clase: 'Pícaro', raza: 'Elfo', nivel: '7' }, true).patch).toEqual({ clase: 'Pícaro', raza: 'Elfo', nivel: 7 })
    expect(patch({ nivel: '' }, true).patch).toEqual({ nivel: 1 })
    expect(patch({ nivel: '3' }, true).patch).toEqual({})
  })

  it('a character with no stored nivel is level 1: showing 1 is not an edit', () => {
    expect(sheetPatch(SHEET, ENTITY, { ...ENTITY, nivel: 1 }, true).patch).toEqual({})
  })

  it('a player sends clase and raza, never nivel (the guard would reject it)', () => {
    expect(patch({ clase: 'Mago', raza: 'Enano', nivel: 9 }, false).patch).toEqual({ clase: 'Mago', raza: 'Enano' })
  })
})
