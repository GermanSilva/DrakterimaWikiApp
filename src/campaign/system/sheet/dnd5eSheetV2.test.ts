import { describe, expect, it } from 'vitest'
import { abilityModNum, suggestedProfBonus } from '../../../helpers/pjCalc'
import { calcTotalCP } from '../../../helpers/pjInventory'
import { SKILLS_BY_ABILITY } from '../../../pages/pj/pjConstants'
import { DND5E_SHEET, DND5E_V2_MIGRATION_MAP } from './dnd5eSheet'
import { resolveSheet, type ResolvedItem, type ResolvedSheet } from './resolveSheet'
import { resetCell } from './sheetEditorModel'
import { validateSheet, type Item, type Table } from './sheetModel'

const items = (resolved: ResolvedSheet): ResolvedItem[] => resolved.sections.flatMap((s) => s.blocks.flatMap((b) => b.items))
const find = (resolved: ResolvedSheet, key: string): ResolvedItem => {
  const found = items(resolved).find((i) => i.key === key)
  if (!found) throw new Error(`no item ${key}`)
  return found
}
const tableOf = (key: string): Extract<Table, { type: 'libre' | 'habilidad' | 'capacidades' }> => {
  const found = DND5E_SHEET.categories.flatMap((c) => c.sections.flatMap((s) => s.items)).find((i: Item) => i.key === key)
  if (!found || found.kind !== 'table' || found.type === 'stat' || found.type === 'monedas' || found.type === 'economia') throw new Error(`no table ${key}`)
  return found
}
const bonus = (resolved: ResolvedSheet, table: string, row: string) => {
  const t = find(resolved, table)
  if (t.kind !== 'capacidades') throw new Error('not capacidades')
  return t.rows.find((r) => r.key === row)?.cells[0]
}

/** What the G10c migration does to a stored skill number, through the exported map. */
const SKILL_VALUES = DND5E_V2_MIGRATION_MAP.find((m) => m.oldKey === 'skill_*')?.values ?? {}
const migrateSkills = (pj: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(pj).map(([k, v]) => [k, k.startsWith('skill_') && typeof v === 'number' ? SKILL_VALUES[v] : v]))

const LEVELS = [1, 4, 5, 8, 9, 12, 13, 16, 17, 20]

describe('D&D preset v2', () => {
  it('validates and is stable under validation', () => {
    const result = validateSheet(DND5E_SHEET)
    expect(result.ok, JSON.stringify(result.ok ? [] : result.errors)).toBe(true)
    expect(result.ok && result.sheet).toEqual(DND5E_SHEET)
  })

  describe('skills (S20)', () => {
    it('has an options column competencia with one signed formula per option', () => {
      const column = tableOf('tabla_habilidades').columns[0]
      expect(column).toMatchObject({ key: 'competencia', type: 'options', format: 'signed', default: 'no' })
      expect(column.options?.map((o) => [o.key, o.label])).toEqual([['no', 'No competente'], ['competente', 'Competente'], ['experto', 'Experto']])
      expect(column.options?.every((o) => (o.formula ?? '').includes('{modificador}'))).toBe(true)
    })

    it('shows +3, +5 and +7 for a 16 strength at level 1 (no, competente, experto)', () => {
      const at = (competencia: string) => bonus(resolveSheet(DND5E_SHEET, { nivel: 1, stat_str: 16, skill_athletics: competencia }), 'tabla_habilidades', 'skill_athletics')
      expect([at('no')?.text, at('competente')?.text, at('experto')?.text]).toEqual(['+3', '+5', '+7'])
    })

    it('keeps saves as a boolean column with its bonus', () => {
      const saves = tableOf('tabla_salvaciones')
      expect(saves.columns.map((c) => [c.key, c.type])).toEqual([['competente', 'boolean'], ['bono', 'number']])
    })
  })

  describe('parity with today (pjCalc.js) on hand-migrated characters', () => {
    const stats = { stat_str: 10, stat_dex: 10, stat_con: 10, stat_int: 10, stat_wis: 10, stat_cha: 10 }
    const fixtures: Record<string, number | boolean>[] = [
      { nivel: 2, ...stats, stat_str: 16, stat_dex: 14, stat_con: 12, stat_int: 8, stat_wis: 13, stat_hp: 18, stat_hp_current: 11, stat_ac: 15, skill_athletics: 2, skill_perception: 1, skill_stealth: 0, save_str: true },
      { nivel: 9, stat_str: 8, stat_dex: 20, stat_con: 14, stat_int: 15, stat_wis: 7, stat_cha: 18, stat_hp: 70, stat_hp_current: 70, stat_ac: 18, stat_proficiency_bonus: 5, skill_perception: 2, skill_deception: 1, save_dex: true, save_cha: true },
      { nivel: 20, ...stats, stat_wis: 30, skill_perception: 1 },
      { nivel: 1, ...stats },
    ]

    it('gives the same value for every skill, save, passive perception, proficiency bonus, HP and AC', () => {
      const mismatches: string[] = []
      const num = (pj: Record<string, number | boolean>, key: string): number => (pj[key] as number | undefined) as number
      for (const old of fixtures) {
        const resolved = resolveSheet(DND5E_SHEET, migrateSkills(old))
        const prof = (old.stat_proficiency_bonus as number | undefined) ?? suggestedProfBonus(old.nivel as number)
        for (const group of SKILLS_BY_ABILITY) {
          const mod = abilityModNum(num(old, group.key))
          for (const skill of group.skills) {
            const level = (num(old, skill.key) ?? 0) as number
            const today = mod + (level > 0 ? prof : 0) + (level > 1 ? prof : 0)
            const got = bonus(resolved, 'tabla_habilidades', skill.key)?.value
            if (got !== today) mismatches.push(`${skill.key}: ${got} != ${today}`)
          }
          const save = abilityModNum(num(old, group.key)) + (old[group.saveKey] === true ? prof : 0)
          const saves = find(resolved, 'tabla_salvaciones')
          const cells = saves.kind === 'capacidades' ? saves.rows.find((r) => r.key === group.saveKey)?.cells : []
          const gotSave = cells?.find((c) => c.key === 'bono')?.value
          if (gotSave !== save) mismatches.push(`${group.saveKey}: ${gotSave} != ${save}`)
        }
        const wisSkill = (num(old, 'skill_perception') ?? 0) as number
        const passive = 10 + abilityModNum(num(old, 'stat_wis')) + (wisSkill > 0 ? prof : 0) + (wisSkill > 1 ? prof : 0)
        if ((find(resolved, 'percepcion_pasiva') as { value: number }).value !== passive) mismatches.push('percepcion_pasiva')
        if ((find(resolved, 'stat_proficiency_bonus') as { value: number }).value !== prof) mismatches.push('stat_proficiency_bonus')
        for (const key of ['stat_hp', 'stat_hp_current', 'stat_ac'] as const) {
          if ((find(resolved, key) as { value: number | null }).value !== (old[key] ?? null)) mismatches.push(key)
        }
      }
      expect(mismatches).toEqual([])
    })

    it('matches today for every level, score and proficiency level of one skill and the passive perception', () => {
      const mismatches: string[] = []
      for (const nivel of LEVELS) {
        for (const score of [1, 8, 9, 10, 11, 15, 30]) {
          for (const level of [0, 1, 2]) {
            for (const stored of [undefined, 4]) {
              const prof = stored ?? suggestedProfBonus(nivel)
              const pj = migrateSkills({ nivel, stat_wis: score, skill_perception: level, stat_proficiency_bonus: stored })
              const resolved = resolveSheet(DND5E_SHEET, pj)
              const skillToday = abilityModNum(score) + (level > 0 ? prof : 0) + (level > 1 ? prof : 0)
              if (bonus(resolved, 'tabla_habilidades', 'skill_perception')?.value !== skillToday) mismatches.push(`skill ${nivel}/${score}/${level}/${stored}`)
              if ((find(resolved, 'percepcion_pasiva') as { value: number }).value !== 10 + skillToday) mismatches.push(`passive ${nivel}/${score}/${level}/${stored}`)
            }
          }
        }
      }
      expect(mismatches.slice(0, 5)).toEqual([])
    }, 60_000)

    it('counts a missing proficiency as not proficient', () => {
      const resolved = resolveSheet(DND5E_SHEET, { nivel: 5, stat_wis: 14 })
      expect(bonus(resolved, 'tabla_habilidades', 'skill_perception')).toMatchObject({ value: 2, error: false })
      expect(find(resolved, 'percepcion_pasiva')).toMatchObject({ value: 12 })
    })
  })

  describe('hit dice (S24, S39)', () => {
    const dice = (fields: Record<string, unknown>) => find(resolveSheet(DND5E_SHEET, { nivel: 2, ...fields }), 'stat_hit_dice')

    it('is a text formula over the die, the available dice and the level', () => {
      expect(dice({ dado_golpe: '1d8', dados_disponibles: 2 })).toMatchObject({ kind: 'field', type: 'short', text: '1d8 (2/2)', error: false })
      expect(dice({ dado_golpe: '1d8', dados_disponibles: 1 })).toMatchObject({ text: '1d8 (1/2)' })
      expect(find(resolveSheet(DND5E_SHEET, { nivel: 5, dado_golpe: '2d10', dados_disponibles: 0 }), 'stat_hit_dice')).toMatchObject({ text: '2d10 (0/5)' })
    })

    it('stores the die as short text and the available dice as a number of at least 0', () => {
      const all = DND5E_SHEET.categories.flatMap((c) => c.sections.flatMap((s) => s.items))
      expect(all.find((i) => i.key === 'dado_golpe')).toMatchObject({ kind: 'field', type: 'short' })
      expect(all.find((i) => i.key === 'dados_disponibles')).toMatchObject({ kind: 'field', type: 'number', min: 0 })
      expect(all.find((i) => i.key === 'stat_hit_dice')).toMatchObject({ kind: 'field', type: 'short', formula: '{dado_golpe} & " (" & {dados_disponibles} & "/" & {nivel} & ")"' })
    })
  })

  describe('spell slots (S15, S16 A1)', () => {
    it('is a DM table of [nivel, disponibles, maximo] sorted by nivel, with disponibles resettable to maximo', () => {
      const slots = tableOf('espacios_conjuro')
      expect(slots).toMatchObject({ type: 'libre', editableBy: 'dm', sortBy: { column: 'nivel', direction: 'asc' } })
      expect(slots.columns.map((c) => c.key)).toEqual(['nivel', 'disponibles', 'maximo'])
      expect(slots.columns.find((c) => c.key === 'disponibles')?.reset).toEqual({ to: 'column', column: 'maximo' })
    })

    it('lists the rows by level and the reset button refills the row', () => {
      const pj = { nivel: 5, espacios_conjuro: [{ nivel: 3, disponibles: 0, maximo: 2 }, { nivel: 1, disponibles: 1, maximo: 4 }] }
      const rows = find(resolveSheet(DND5E_SHEET, pj), 'espacios_conjuro')
      expect(rows.kind === 'rows' && rows.rows.map((r) => r.nivel)).toEqual([1, 3])
      expect(rows.kind === 'rows' && rows.storedIndex).toEqual([1, 0])
      const after = resetCell(DND5E_SHEET, pj, 'espacios_conjuro', 0, 'disponibles') as typeof pj
      expect(after.espacios_conjuro[0]).toEqual({ nivel: 3, disponibles: 2, maximo: 2 })
      expect(after.espacios_conjuro[1]).toEqual(pj.espacios_conjuro[1])
    })
  })

  describe('spells as a collection-backed Habilidad table (S23, S35-S39)', () => {
    const spells = () => tableOf('hechizos') as Extract<Table, { type: 'habilidad' }>

    it('declares the categories in order', () => {
      expect(spells().categories?.map((c) => [c.key, c.label])).toEqual([
        ['trucos', 'Trucos'],
        ...Array.from({ length: 9 }, (_, i) => [`nivel_${i + 1}`, `Nivel ${i + 1}`]),
        ['rasgos', 'Rasgos y dotes'],
      ])
    })

    it('has entry extras, no descripcion, and preparado as character state', () => {
      const cols = spells().columns
      expect(cols.map((c) => c.key)).toEqual(['nombre', 'categoria', 'escuela', 'tiempo_lanzamiento', 'alcance', 'componentes', 'duracion', 'a_niveles_superiores', 'concentracion', 'ritual', 'preparado'])
      expect(cols.find((c) => c.key === 'a_niveles_superiores')?.type).toBe('paragraph')
      expect(cols.filter((c) => c.type === 'boolean').map((c) => c.key)).toEqual(['concentracion', 'ritual', 'preparado'])
      expect(cols.find((c) => c.key === 'preparado')).toMatchObject({ type: 'boolean', scope: 'character' })
      expect(cols.filter((c) => c.key !== 'preparado').every((c) => (c.scope ?? 'entry') === 'entry')).toBe(true)
    })

    it('filters every category in declared order in the modal block', () => {
      const section = DND5E_SHEET.categories.flatMap((c) => c.sections).find((s) => s.key === 'hechizos')
      expect(section?.blocks.find((b) => b.mode === 'modal')?.filterCategories).toEqual(['trucos', ...Array.from({ length: 9 }, (_, i) => `nivel_${i + 1}`), 'rasgos'])
    })

    it('groups rows by category in declared order, labelled', () => {
      const rows = [
        { id: 1, nombre: 'Bola de fuego', categoria: 'nivel_3' },
        { id: 2, nombre: 'Rayo de escarcha', categoria: 'trucos' },
        { id: 3, nombre: 'Alerta', categoria: 'rasgos' },
        { id: 4, nombre: 'Proyectil mágico', categoria: 'nivel_1' },
        { id: 5, nombre: 'Huérfano', categoria: 'otra' },
      ]
      const resolved = resolveSheet(DND5E_SHEET, { nivel: 5, hechizos: rows })
      const modal = resolved.sections.find((s) => s.key === 'hechizos')?.blocks.find((b) => b.mode === 'modal')
      expect(modal?.groups?.map((g) => [g.key, g.category, g.rows.length])).toEqual([
        ['trucos', 'Trucos', 1],
        ['nivel_1', 'Nivel 1', 1],
        ['nivel_3', 'Nivel 3', 1],
        ['rasgos', 'Rasgos y dotes', 1],
        [undefined, 'Otras', 1],
      ])
    })
  })

  describe('recursos (S16 A12)', () => {
    it('is a Libre table with a resettable actual and a largo/corto options column', () => {
      const t = tableOf('recursos')
      expect(t.type).toBe('libre')
      expect(t.columns.map((c) => c.key)).toEqual(['nombre', 'actual', 'maximo', 'recuperacion', 'notas'])
      expect(t.columns.find((c) => c.key === 'actual')?.reset).toEqual({ to: 'column', column: 'maximo' })
      const recovery = t.columns.find((c) => c.key === 'recuperacion')
      expect(recovery).toMatchObject({ type: 'options' })
      expect(recovery?.options?.map((o) => [o.key, o.label])).toEqual([['largo', 'Descanso largo'], ['corto', 'Descanso corto']])
    })

    it('resolves a stored recuperacion key to its label and refills actual', () => {
      const pj = { nivel: 2, recursos: [{ nombre: 'Furia', actual: 0, maximo: 3, recuperacion: 'corto', notas: '' }] }
      const rows = find(resolveSheet(DND5E_SHEET, pj), 'recursos')
      expect(rows.kind === 'rows' && rows.rows[0].recuperacion).toMatchObject({ text: 'Descanso corto', value: 'corto' })
      expect((resetCell(DND5E_SHEET, pj, 'recursos', 0, 'actual') as typeof pj).recursos[0].actual).toBe(3)
    })
  })

  describe('equipment value (lookup over the coin table)', () => {
    const equipo = [
      { nombre: 'Espada', cantidad: 1, precio: 15, precio_moneda: 'gp', portando: true },
      { nombre: 'Flechas', cantidad: 20, precio: 5, precio_moneda: 'cp' },
      { nombre: 'Poción', cantidad: 3, precio: 2, precio_moneda: 'sp', portando: false },
      { nombre: 'Gema', precio: 7 }, // missing quantity counts 1, missing currency counts gp (like today)
      { nombre: 'Nada' }, // no price
      { nombre: 'Cero', cantidad: 0, precio: 50, precio_moneda: 'pp' },
      { nombre: 'Rubí', cantidad: 2, precio: 1, precio_moneda: 'pp' },
      { nombre: 'Electrum', cantidad: 4, precio: 3, precio_moneda: 'ep' },
    ]

    it('adds a value column per row and a calc field with the total', () => {
      const t = tableOf('equipo')
      expect(t.columns.find((c) => c.key === 'valor')?.formula).toBe('{precio} * {cantidad} * lookup({dinero}, "key", {precio_moneda}, "value", 0)')
      expect(t.columns.find((c) => c.key === 'portando')).toMatchObject({ type: 'boolean', default: true })
      const all = DND5E_SHEET.categories.flatMap((c) => c.sections.flatMap((s) => s.items))
      expect(all.find((i) => i.key === 'valor_inventario')).toMatchObject({ kind: 'field', label: 'Valor del inventario', calc: { table: 'equipo', column: 'valor', op: 'suma' } })
    })

    it('totals the same copper value as today (calcTotalCP) on the fixture', () => {
      const resolved = resolveSheet(DND5E_SHEET, { nivel: 2, equipo })
      expect(find(resolved, 'valor_inventario')).toMatchObject({ value: calcTotalCP(equipo, []), error: false })
      const rows = find(resolved, 'equipo')
      expect(rows.kind === 'rows' && rows.rows.map((r) => r.valor)).toEqual([1500, 100, 60, 700, 0, 0, 2000, 600])
    })

    it('counts a missing portando as carrying', () => {
      expect(tableOf('equipo').columns.find((c) => c.key === 'portando')?.default).toBe(true)
    })

    it('is zero for an empty inventory', () => {
      expect(find(resolveSheet(DND5E_SHEET, { nivel: 2 }), 'valor_inventario')).toMatchObject({ value: 0, error: false })
    })
  })

  describe('migration map for G10c', () => {
    const stored = new Set<string>()
    for (const c of DND5E_SHEET.categories) for (const s of c.sections) for (const item of s.items) {
      stored.add(item.key)
      if (item.kind === 'table' && 'rows' in item) for (const r of item.rows) stored.add(r.key)
    }

    it('names the new key of every entry in the preset', () => {
      for (const m of DND5E_V2_MIGRATION_MAP) {
        const key = m.newKey.split('.')[0]
        if (key.endsWith('*')) continue
        expect(stored.has(key), `${m.oldKey} -> ${m.newKey}`).toBe(true)
      }
    })

    it('covers every key whose shape changed', () => {
      const olds = DND5E_V2_MIGRATION_MAP.map((m) => m.oldKey)
      for (const key of ['skill_*', 'stat_hit_dice', 'spell_slots', 'spell_slots_current', 'hechizos', 'recursos', 'equipo']) expect(olds, key).toContain(key)
    })

    it('maps proficiency numbers to the option keys', () => {
      expect(SKILL_VALUES).toEqual({ 0: 'no', 1: 'competente', 2: 'experto' })
    })
  })
})
