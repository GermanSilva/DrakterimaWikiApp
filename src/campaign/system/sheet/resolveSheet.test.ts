import { describe, expect, it } from 'vitest'
import { abilityMod, abilityModNum, passivePerception, suggestedProfBonus } from '../../../helpers/pjCalc'
import { DND5E_SHEET } from './dnd5eSheet'
import { resolveSheet, type ResolvedItem, type ResolvedSheet } from './resolveSheet'
import type { Sheet } from './sheetModel'

const items = (resolved: ResolvedSheet): ResolvedItem[] => resolved.sections.flatMap((s) => s.blocks.flatMap((b) => b.items))
const item = (resolved: ResolvedSheet, key: string): ResolvedItem => {
  const found = items(resolved).find((i) => i.key === key)
  if (!found) throw new Error(`no item ${key}`)
  return found
}
const cells = (resolved: ResolvedSheet, table: string, row: string) => {
  const t = item(resolved, table)
  if (t.kind !== 'capacidades') throw new Error('not a capacidades table')
  const r = t.rows.find((x) => x.key === row)
  if (!r) throw new Error(`no row ${row}`)
  return Object.fromEntries(r.cells.map((c) => [c.key, c]))
}

// a level 5 character: proficiency bonus 3 (2 + floor((5 - 1) / 4))
const hero = {
  nivel: 5,
  stat_str: 16, stat_dex: 12, stat_con: 14, stat_int: 10, stat_wis: 14, stat_cha: 8,
  skill_athletics: 2, skill_perception: 1, skill_stealth: 0,
  save_str: true, save_dex: false,
}

const custom = (fields: Record<string, unknown>[]): Sheet =>
  ({
    categories: [{ key: 'c', label: 'C', sections: [{ key: 's', label: 'S', items: fields, blocks: [{ key: 'b', mode: 'tile', items: fields.map((f) => f.key as string) }] }] }],
    roles: {},
  }) as Sheet

describe('resolveSheet: the D&D 5e sheet', () => {
  const resolved = resolveSheet(DND5E_SHEET, hero)

  it('computes every ability modifier from its value', () => {
    const stats = item(resolved, 'tabla_stats')
    expect(stats.kind === 'stat' && stats.rows.map((r) => [r.key, r.value, r.modifier])).toEqual([
      ['stat_str', 16, 3], ['stat_dex', 12, 1], ['stat_con', 14, 2], ['stat_int', 10, 0], ['stat_wis', 14, 2], ['stat_cha', 8, -1],
    ])
  })

  it('suggests the proficiency bonus from the level when none is stored', () => {
    const field = item(resolved, 'stat_proficiency_bonus')
    expect(field).toMatchObject({ kind: 'field', value: 3, text: '+3', error: false })
  })

  it('lets a stored proficiency bonus win over the suggested one', () => {
    const field = item(resolveSheet(DND5E_SHEET, { ...hero, stat_proficiency_bonus: 4 }), 'stat_proficiency_bonus')
    expect(field).toMatchObject({ value: 4, text: '+4' })
  })

  it('ignores a stored proficiency bonus that is not a number', () => {
    const field = item(resolveSheet(DND5E_SHEET, { ...hero, stat_proficiency_bonus: 'high' }), 'stat_proficiency_bonus')
    expect(field).toMatchObject({ value: 3 })
  })

  it('follows the level when the proficiency bonus is derived', () => {
    const at = (nivel: number) => item(resolveSheet(DND5E_SHEET, { ...hero, nivel }), 'stat_proficiency_bonus')
    expect([1, 4, 5, 8, 9, 12, 13, 16, 17, 20].map((n) => (at(n) as { value: number }).value)).toEqual([2, 2, 3, 3, 4, 4, 5, 5, 6, 6])
  })

  it('adds the proficiency bonus once for proficiency and twice for expertise (skills)', () => {
    expect(cells(resolved, 'tabla_habilidades', 'skill_athletics').bono).toMatchObject({ value: 9, text: '+9' }) // 3 + 3 + 3
    expect(cells(resolved, 'tabla_habilidades', 'skill_perception').bono).toMatchObject({ value: 5, text: '+5' }) // 2 + 3
    expect(cells(resolved, 'tabla_habilidades', 'skill_stealth').bono).toMatchObject({ value: 1, text: '+1' }) // dex only
  })

  it('adds the proficiency bonus to a proficient save only', () => {
    expect(cells(resolved, 'tabla_salvaciones', 'save_str').bono).toMatchObject({ value: 6, text: '+6' }) // 3 + 3
    expect(cells(resolved, 'tabla_salvaciones', 'save_dex').bono).toMatchObject({ value: 1, text: '+1' })
  })

  it('shows the stored proficiency level next to the computed bonus', () => {
    expect(cells(resolved, 'tabla_habilidades', 'skill_athletics').competencia).toMatchObject({ value: 2, type: 'number' })
    expect(cells(resolved, 'tabla_salvaciones', 'save_str').competente).toMatchObject({ value: true, type: 'boolean' })
  })

  it('computes the passive perception the way the sheet does today', () => {
    expect(item(resolved, 'percepcion_pasiva')).toMatchObject({ value: 15 }) // 10 + 2 + 3
    expect(item(resolveSheet(DND5E_SHEET, { ...hero, stat_proficiency_bonus: 4 }), 'percepcion_pasiva')).toMatchObject({ value: 16 })
    expect(item(resolveSheet(DND5E_SHEET, { ...hero, skill_perception: 2 }), 'percepcion_pasiva')).toMatchObject({ value: 18 })
    expect(item(resolveSheet(DND5E_SHEET, { ...hero, skill_perception: 0 }), 'percepcion_pasiva')).toMatchObject({ value: 12 })
  })

  it('hides nothing of the stats section and keeps the legacy section keys', () => {
    expect(resolved.sections.map((s) => s.key)).toEqual(
      expect.arrayContaining(['stats', 'habilidades', 'ataques', 'hechizos', 'recursos', 'equipo', 'rasgos', 'narrativa', 'apariencia']),
    )
    expect(resolved.sections.find((s) => s.key === 'stats')?.empty).toBe(false)
  })

  it('reports a stat with no stored value as missing, not as a default', () => {
    const stats = item(resolveSheet(DND5E_SHEET, { ...hero, stat_wis: undefined }), 'tabla_stats')
    const wis = stats.kind === 'stat' ? stats.rows.find((r) => r.key === 'stat_wis') : undefined
    expect(wis).toMatchObject({ value: null, modifier: null })
  })
})

describe('resolveSheet: differential against the calculations the sheet uses today (pjCalc.js)', () => {
  const rank = (resolved: ResolvedSheet, table: string, row: string) => {
    const c = cells(resolved, table, row)
    return c.bono.value
  }

  it('gives the same passive perception for every level, wisdom, proficiency and stored bonus', () => {
    const mismatches: string[] = []
    for (let nivel = 1; nivel <= 20; nivel++) {
      for (let wis = 1; wis <= 30; wis += 1) {
        for (const skill of [0, 1, 2]) {
          for (const stored of [undefined, 2, 3, 4, 5, 6]) {
            const pj = { nivel, stat_wis: wis, skill_perception: skill, stat_proficiency_bonus: stored }
            const expected = passivePerception(pj)
            const got = (item(resolveSheet(DND5E_SHEET, pj), 'percepcion_pasiva') as { value: number }).value
            if (got !== expected) mismatches.push(`nivel ${nivel} wis ${wis} skill ${skill} stored ${stored}: ${got} != ${expected}`)
          }
        }
      }
    }
    expect(mismatches.slice(0, 5)).toEqual([])
  })

  it('gives the same skill and save bonus as the skills section for every ability, level and proficiency', () => {
    const mismatches: string[] = []
    for (let nivel = 1; nivel <= 20; nivel += 1) {
      for (const score of [1, 3, 8, 9, 10, 11, 14, 15, 18, 20, 30]) {
        for (const level of [0, 1, 2]) {
          for (const stored of [undefined, 4]) {
            const prof = stored ?? suggestedProfBonus(nivel)
            const pj = { nivel, stat_dex: score, skill_stealth: level, save_dex: level > 0, stat_proficiency_bonus: stored }
            const resolved = resolveSheet(DND5E_SHEET, pj)
            const skillToday = abilityModNum(score) + (level > 0 ? prof : 0) + (level > 1 ? prof : 0)
            const saveToday = abilityModNum(score) + (level > 0 ? prof : 0)
            if (rank(resolved, 'tabla_habilidades', 'skill_stealth') !== skillToday) mismatches.push(`skill nivel ${nivel} score ${score} level ${level} stored ${stored}`)
            if (rank(resolved, 'tabla_salvaciones', 'save_dex') !== saveToday) mismatches.push(`save nivel ${nivel} score ${score} level ${level} stored ${stored}`)
          }
        }
      }
    }
    expect(mismatches.slice(0, 5)).toEqual([])
  })

  it('shows the same ability modifier as abilityMod for every score', () => {
    for (let score = 1; score <= 30; score++) {
      const stats = item(resolveSheet(DND5E_SHEET, { nivel: 1, stat_str: score }), 'tabla_stats')
      const row = stats.kind === 'stat' ? stats.rows.find((r) => r.key === 'stat_str') : undefined
      expect(row?.modifierText, `score ${score}`).toBe(abilityMod(score))
    }
  })
})

describe('resolveSheet: fields', () => {
  it('reads plain fields, falls back to the default and marks empty ones', () => {
    const sheet = custom([
      { kind: 'field', key: 'a', label: 'A', type: 'short', editableBy: 'player' },
      { kind: 'field', key: 'b', label: 'B', type: 'short', default: 'none', editableBy: 'player' },
      { kind: 'field', key: 'c', label: 'C', type: 'number', editableBy: 'player' },
    ])
    const resolved = resolveSheet(sheet, { a: 'hola', c: 7 })
    expect(item(resolved, 'a')).toMatchObject({ value: 'hola', text: 'hola', empty: false })
    expect(item(resolved, 'b')).toMatchObject({ value: 'none', empty: false })
    expect(item(resolved, 'c')).toMatchObject({ value: 7, text: '7' })
    expect(item(resolveSheet(sheet, {}), 'a')).toMatchObject({ value: null, empty: true })
  })

  it('treats a value of the wrong type as missing instead of showing it', () => {
    const sheet = custom([{ kind: 'field', key: 'n', label: 'N', type: 'number', editableBy: 'player' }])
    expect(item(resolveSheet(sheet, { n: 'seven' }), 'n')).toMatchObject({ value: null, empty: true })
    expect(item(resolveSheet(sheet, { n: { x: 1 } }), 'n')).toMatchObject({ value: null, empty: true })
  })

  it('formats signed numbers and rounds to two decimals', () => {
    const sheet = custom([
      { kind: 'field', key: 'p', label: 'P', type: 'number', format: 'signed', editableBy: 'player' },
      { kind: 'field', key: 'q', label: 'Q', type: 'number', editableBy: 'player' },
    ])
    expect(item(resolveSheet(sheet, { p: 2, q: 1 / 3 }), 'p')).toMatchObject({ text: '+2' })
    expect(item(resolveSheet(sheet, { p: -1, q: 1 / 3 }), 'p')).toMatchObject({ text: '-1' })
    expect(item(resolveSheet(sheet, { p: 0, q: 1 / 3 }), 'p')).toMatchObject({ text: '+0' })
    expect(item(resolveSheet(sheet, { p: 0, q: 1 / 3 }), 'q')).toMatchObject({ text: '0.33' })
  })

  it('evaluates a formula over other fields and the level', () => {
    const sheet = custom([
      { kind: 'field', key: 'base', label: 'Base', type: 'number', editableBy: 'player' },
      { kind: 'field', key: 'total', label: 'Total', type: 'number', formula: '{base} * 2 + {nivel}', editableBy: 'dm' },
    ])
    expect(item(resolveSheet(sheet, { base: 4, nivel: 3 }), 'total')).toMatchObject({ value: 11, error: false })
  })

  it('shows an error, never throws, when a formula cannot be computed', () => {
    const sheet = custom([
      { kind: 'field', key: 'base', label: 'Base', type: 'number', editableBy: 'player' },
      { kind: 'field', key: 'ratio', label: 'R', type: 'number', formula: '10 / {base}', editableBy: 'dm' },
    ])
    expect(item(resolveSheet(sheet, { base: 0 }), 'ratio')).toMatchObject({ value: null, error: true })
    expect(item(resolveSheet(sheet, {}), 'ratio')).toMatchObject({ value: null, error: true })
  })

  it('survives formulas that reference each other (a cycle), and still resolves the rest', () => {
    const sheet = custom([
      { kind: 'field', key: 'ca', label: 'A', type: 'number', formula: '{cb} + 1', editableBy: 'dm' },
      { kind: 'field', key: 'cb', label: 'B', type: 'number', formula: '{ca} + 1', editableBy: 'dm' },
      { kind: 'field', key: 'ok', label: 'Ok', type: 'number', formula: '1 + 1', editableBy: 'dm' },
    ])
    const resolved = resolveSheet(sheet, {})
    expect(item(resolved, 'ca')).toMatchObject({ value: null, error: true })
    expect(item(resolved, 'cb')).toMatchObject({ value: null, error: true })
    expect(item(resolved, 'ok')).toMatchObject({ value: 2, error: false })
  })

  it('survives a long chain of formulas without overflowing the stack', () => {
    const fields: Record<string, unknown>[] = [{ kind: 'field', key: 'f0', label: 'F0', type: 'number', formula: '1', editableBy: 'dm' }]
    for (let i = 1; i < 300; i++) fields.push({ kind: 'field', key: `f${i}`, label: `F${i}`, type: 'number', formula: `{f${i - 1}} + 1`, editableBy: 'dm' })
    expect(item(resolveSheet(custom(fields), {}), 'f299')).toMatchObject({ value: 300 })
  })
})

describe('resolveSheet: tables', () => {
  const tables: Sheet = {
    categories: [
      {
        key: 'c',
        label: 'C',
        sections: [
          {
            key: 's',
            label: 'S',
            items: [
              {
                kind: 'table', type: 'libre', key: 'ataques', label: 'Ataques', editableBy: 'dm',
                columns: [{ key: 'nombre', label: 'Nombre', type: 'short', editableBy: 'dm' }],
              },
              {
                kind: 'table', type: 'habilidad', key: 'hechizos', label: 'Hechizos', editableBy: 'dm',
                columns: [
                  { key: 'nombre', label: 'Nombre', type: 'short', editableBy: 'dm' },
                  { key: 'categoria', label: 'Categoría', type: 'short', editableBy: 'dm' },
                ],
              },
              {
                kind: 'table', type: 'monedas', key: 'dinero', label: 'Dinero',
                rows: [{ key: 'cp', label: 'Cobre', value: 1 }, { key: 'sp', label: 'Plata', value: 10 }, { key: 'gp', label: 'Oro', value: 100 }],
              },
            ],
            blocks: [
              { key: 'b1', mode: 'plano', items: ['ataques'] },
              { key: 'b2', mode: 'modal', items: ['hechizos'], filterCategories: ['Truco', 'Nivel 1'] },
              { key: 'b3', mode: 'plano', items: ['dinero'] },
            ],
          },
        ],
      },
    ],
    roles: {},
  }

  it('passes character rows through and tolerates a missing or invalid list', () => {
    expect(item(resolveSheet(tables, { ataques: [{ id: 1, nombre: 'Espada' }] }), 'ataques')).toMatchObject({ kind: 'rows', rows: [{ id: 1, nombre: 'Espada' }], empty: false })
    expect(item(resolveSheet(tables, {}), 'ataques')).toMatchObject({ rows: [], empty: true })
    expect(item(resolveSheet(tables, { ataques: 'x' }), 'ataques')).toMatchObject({ rows: [], empty: true })
    expect(item(resolveSheet(tables, { ataques: [1, null, { nombre: 'ok' }] }), 'ataques')).toMatchObject({ rows: [{ nombre: 'ok' }] })
  })

  it('groups a modal block by the categories it names, in that order, and leaves the others out', () => {
    const rows = [
      { nombre: 'Rayo', categoria: 'Nivel 1' },
      { nombre: 'Luz', categoria: 'Truco' },
      { nombre: 'Bola de fuego', categoria: 'Nivel 3' },
      { nombre: 'Sin categoría' },
    ]
    const block = resolveSheet(tables, { hechizos: rows }).sections[0].blocks.find((b) => b.key === 'b2')
    expect(block?.groups?.map((g) => [g.category, g.rows.map((r) => r.nombre)])).toEqual([['Truco', ['Luz']], ['Nivel 1', ['Rayo']]])
  })

  it('lists coins by value, only those held, and totals them in the base unit', () => {
    const coins = item(resolveSheet(tables, { monedas: { gp: 2, cp: 5, sp: 0 }, monedas_guardado: { sp: 3 } }), 'dinero')
    expect(coins).toMatchObject({
      kind: 'coins',
      carried: [{ key: 'gp', amount: 2 }, { key: 'cp', amount: 5 }],
      stored: [{ key: 'sp', amount: 3 }],
      carriedTotal: 205,
      storedTotal: 30,
      empty: false,
    })
  })

  it('ignores coin amounts that are not whole non negative numbers', () => {
    const coins = item(resolveSheet(tables, { monedas: { gp: -1, sp: 1.5, cp: 'x' } }), 'dinero')
    expect(coins).toMatchObject({ carried: [], carriedTotal: 0, empty: true })
  })

  it('reports an unconfigured coin table as empty', () => {
    const none: Sheet = { categories: [{ key: 'c', label: 'C', sections: [{ key: 's', label: 'S', items: [{ kind: 'table', type: 'monedas', key: 'dinero', label: 'D', rows: [] }], blocks: [{ key: 'b', mode: 'plano', items: ['dinero'] }] }] }], roles: {} }
    expect(item(resolveSheet(none, { monedas: { gp: 3 } }), 'dinero')).toMatchObject({ denominations: [], carried: [], empty: true })
  })
})

describe('resolveSheet: sections', () => {
  it('marks a section empty when none of its blocks has anything to show', () => {
    const sheet = custom([{ kind: 'field', key: 'a', label: 'A', type: 'short', editableBy: 'player' }])
    expect(resolveSheet(sheet, {}).sections[0].empty).toBe(true)
    expect(resolveSheet(sheet, { a: 'x' }).sections[0].empty).toBe(false)
  })

  it('keeps the category label on each section so the editor can group them', () => {
    expect(resolveSheet(DND5E_SHEET, hero).sections.find((s) => s.key === 'stats')?.category).toBe('Mecánicas')
  })

  it('resolves a malformed character without throwing', () => {
    expect(() => resolveSheet(DND5E_SHEET, {})).not.toThrow()
    expect(() => resolveSheet(DND5E_SHEET, { nivel: 'x', stat_str: NaN, monedas: 5, ataques: { a: 1 } })).not.toThrow()
  })
})
