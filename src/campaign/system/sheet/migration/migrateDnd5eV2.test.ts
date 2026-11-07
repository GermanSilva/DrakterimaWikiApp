import { describe, expect, it } from 'vitest'
import { DND5E_SHEET } from '../dnd5eSheet'
import { migrateDnd5eV2, type MigrationInput, type MigrationPjInput } from './migrateDnd5eV2'

const pj = (id: number, data: Record<string, unknown>, extra: Partial<MigrationPjInput> = {}): MigrationPjInput => ({
  id,
  nivel: 2,
  owner_display_name: null,
  jugador: '',
  data,
  ...extra,
})

const run = (pjs: MigrationPjInput[], campaign: Partial<MigrationInput['campaign']> = {}) =>
  migrateDnd5eV2({ campaign: { sheet: DND5E_SHEET as unknown as Record<string, unknown>, ...campaign }, pjs })

const dataOf = (data: Record<string, unknown>, extra: Partial<MigrationPjInput> = {}) => run([pj(1, data, extra)]).pjs[0].newData
const codes = (out: ReturnType<typeof run>) => out.report.warnings.map((w) => w.code)

const spell = (nombre: string, nivel: number, extra: Record<string, unknown> = {}) => ({ nombre, nivel, preparado: false, descripcion: 'd', ...extra })

describe('skills (skill_* numbers -> option keys)', () => {
  it('maps 0/1/2 to no/competente/experto and leaves save_* booleans alone', () => {
    const out = run([pj(1, { skill_arcana: 0, skill_history: 1, skill_stealth: 2, save_str: true })])
    expect(out.pjs[0].newData).toEqual({ skill_arcana: 'no', skill_history: 'competente', skill_stealth: 'experto', save_str: true })
    expect(out.report.counts.skills_converted).toBe(3)
    expect(out.report.warnings).toEqual([])
  })

  it('keeps any other value and warns, without printing it', () => {
    const out = run([pj(1, { skill_arcana: 3, skill_history: 'maestro', skill_stealth: 'experto', skill_nature: null })])
    expect(out.pjs[0].newData).toEqual({ skill_arcana: 3, skill_history: 'maestro', skill_stealth: 'experto', skill_nature: null })
    expect(out.report.warnings).toEqual([
      { code: 'skill_value_unknown', pj_id: 1 },
      { code: 'skill_value_unknown', pj_id: 1 },
    ])
  })
})

describe('hit dice', () => {
  it('"XdY (a/b)": die and the dice available, the total is the level', () => {
    expect(dataOf({ stat_hit_dice: '1d8 (2/2)' })).toEqual({ dado_golpe: '1d8', dados_disponibles: 2 })
    expect(dataOf({ stat_hit_dice: '1d10 (1/2)' })).toEqual({ dado_golpe: '1d10', dados_disponibles: 1 })
    expect(dataOf({ stat_hit_dice: '3D6(0/7)' })).toEqual({ dado_golpe: '3d6', dados_disponibles: 0 })
  })

  it('"XdY" alone: dice available = the level', () => {
    expect(dataOf({ stat_hit_dice: '1d8' }, { nivel: 5 })).toEqual({ dado_golpe: '1d8', dados_disponibles: 5 })
  })

  it('drops the key and reports it in removedKeys', () => {
    expect(run([pj(1, { stat_hit_dice: '1d8 (2/2)' })]).pjs[0].removedKeys).toEqual(['stat_hit_dice'])
  })

  it('unparseable text goes whole into dado_golpe and warns', () => {
    const out = run([pj(1, { stat_hit_dice: 'dos dados raros' })])
    expect(out.pjs[0].newData).toEqual({ dado_golpe: 'dos dados raros' })
    expect(codes(out)).toEqual(['hit_dice_unparsed'])
    expect(out.report.counts.hit_dice_unparsed).toBe(1)
  })

  it('an empty text is dropped quietly', () => {
    const out = run([pj(1, { stat_hit_dice: '' })])
    expect(out.pjs[0].newData).toEqual({})
    expect(out.report.warnings).toEqual([])
  })

  it('does not overwrite fields that already exist', () => {
    expect(dataOf({ stat_hit_dice: '1d8 (2/2)', dado_golpe: '1d6', dados_disponibles: 9 })).toEqual({ dado_golpe: '1d6', dados_disponibles: 9 })
  })
})

describe('spell slots', () => {
  it('builds espacios_conjuro rows sorted by level; absent current = full; zero rows dropped', () => {
    const out = dataOf({ spell_slots: { '2': 2, '1': 3, '3': 0 }, spell_slots_current: { '1': 1 } })
    expect(out).toEqual({
      espacios_conjuro: [
        { id: 1, nivel: 1, disponibles: 1, maximo: 3 },
        { id: 2, nivel: 2, disponibles: 2, maximo: 2 },
      ],
    })
  })

  it('a current of 0 is a spent level, not an absent one', () => {
    expect(dataOf({ spell_slots: { '1': 2 }, spell_slots_current: { '1': 0 } }).espacios_conjuro).toEqual([{ id: 1, nivel: 1, disponibles: 0, maximo: 2 }])
  })

  it('handles the 9-level object', () => {
    const slots = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i + 1), 9 - i]))
    const rows = dataOf({ spell_slots: slots, spell_slots_current: {} }).espacios_conjuro as { nivel: number; maximo: number }[]
    expect(rows.map((r) => [r.nivel, r.maximo])).toEqual(Array.from({ length: 9 }, (_, i) => [i + 1, 9 - i]))
  })

  it('writes nothing when every level is zero, and still drops the old keys', () => {
    const out = run([pj(1, { spell_slots: { '1': 0 }, spell_slots_current: {} })])
    expect(out.pjs[0].newData).toEqual({})
    expect(out.pjs[0].removedKeys).toEqual(['spell_slots', 'spell_slots_current'])
  })

  it('keeps an existing espacios_conjuro and warns', () => {
    const existing = [{ id: 1, nivel: 4, disponibles: 1, maximo: 1 }]
    const out = run([pj(1, { spell_slots: { '1': 2 }, espacios_conjuro: existing })])
    expect(out.pjs[0].newData).toEqual({ espacios_conjuro: existing })
    expect(codes(out)).toEqual(['espacios_conjuro_exists'])
  })

  it('warns about a level or maximum it cannot read and skips it', () => {
    const out = run([pj(1, { spell_slots: { x: 2, '1': 'mucho', '2': 1 } })])
    expect(out.pjs[0].newData).toEqual({ espacios_conjuro: [{ id: 1, nivel: 2, disponibles: 1, maximo: 1 }] })
    expect(codes(out)).toEqual(['slots_invalid', 'slots_invalid'])
  })
})

describe('recursos', () => {
  const rec = (recuperacion: unknown) => (dataOf({ recursos: [{ id: 1, nombre: 'n', actual: 1, maximo: 2, recuperacion, notas: '' }] }).recursos as { recuperacion: unknown }[])[0].recuperacion

  it('maps the text to largo/corto', () => {
    expect(rec('corto')).toBe('corto')
    expect(rec('Descanso corto')).toBe('corto')
    expect(rec(' LARGO ')).toBe('largo')
  })

  it('anything else becomes largo and warns; empty becomes largo quietly', () => {
    const out = run([pj(1, { recursos: [{ nombre: 'a', recuperacion: 'al amanecer' }, { nombre: 'b', recuperacion: '' }, { nombre: 'c' }] })])
    expect((out.pjs[0].newData.recursos as { recuperacion?: string }[]).map((r) => r.recuperacion)).toEqual(['largo', 'largo', undefined])
    expect(codes(out)).toEqual(['recuperacion_unknown'])
  })

  it('keeps the other columns of the row', () => {
    expect(dataOf({ recursos: [{ id: 3, nombre: 'Ki', actual: 1, maximo: 2, recuperacion: 'corto', notas: 'x', extra: true }] }).recursos).toEqual([
      { id: 3, nombre: 'Ki', actual: 1, maximo: 2, recuperacion: 'corto', notas: 'x', extra: true },
    ])
  })
})

describe('custom fields (S17)', () => {
  const fields = [{ key: 'ancla', label: 'Ancla', type: 'text' }]
  const section = (sheet: Record<string, unknown>) =>
    ((sheet.categories as { key: string; sections: { key: string }[] }[]).flatMap((c) => c.sections).find((s) => s.key === 'campos_campana') ?? null) as
      | { items: { key: string; type: string; label: string }[]; blocks: { items: string[] }[] }
      | null

  it('adds a paragraph field in a campaign section and moves the value', () => {
    const out = run([pj(1, { custom_fields: { ancla: 'Torre' } })], { character_custom_fields: fields })
    expect(section(out.sheet)?.items).toEqual([{ kind: 'field', key: 'ancla', label: 'Ancla', type: 'paragraph', editableBy: 'dm' }])
    expect(section(out.sheet)?.blocks[0].items).toEqual(['ancla'])
    expect(out.pjs[0].newData).toEqual({ ancla: 'Torre' })
    expect(out.pjs[0].removedKeys).toEqual(['custom_fields'])
  })

  it('a key that collides with the sheet becomes campo_<key> and warns', () => {
    const out = run([pj(1, { custom_fields: { idiomas: 'Abisal' }, idiomas: 'Común' })], {
      character_custom_fields: [{ key: 'idiomas', label: 'Idiomas secretos', type: 'text' }],
    })
    expect(section(out.sheet)?.items.map((i) => i.key)).toEqual(['campo_idiomas'])
    expect(out.pjs[0].newData).toEqual({ campo_idiomas: 'Abisal', idiomas: 'Común' })
    expect(codes(out)).toEqual(['custom_field_key_collision'])
  })

  it('the preset has no magralita field: the campaign field of that key lands at data.magralita without a warning', () => {
    const out = run([pj(1, { custom_fields: { magralita: 'Pulso.' } })], { character_custom_fields: [{ key: 'magralita', label: 'Relación', type: 'text' }] })
    expect(section(out.sheet)?.items.map((i) => i.key)).toEqual(['magralita'])
    expect(out.pjs[0].newData).toEqual({ magralita: 'Pulso.' })
    expect(out.report.warnings).toEqual([])
  })

  it('a flat legacy value equal to the custom value is just kept', () => {
    const out = run([pj(1, { magralita: 'Pulso.', custom_fields: { magralita: 'Pulso.' } })], { character_custom_fields: [{ key: 'magralita', label: 'R', type: 'text' }] })
    expect(out.pjs[0].newData).toEqual({ magralita: 'Pulso.' })
    expect(out.report.warnings).toEqual([])
  })

  it('a flat legacy value that is empty gives way to the custom value', () => {
    const out = run([pj(1, { magralita: '', custom_fields: { magralita: 'Pulso.' } })], { character_custom_fields: [{ key: 'magralita', label: 'R', type: 'text' }] })
    expect(out.pjs[0].newData).toEqual({ magralita: 'Pulso.' })
  })

  it('a different flat legacy value is never overwritten: both values survive and it warns', () => {
    const data = { magralita: 'plano', custom_fields: { magralita: 'del campo', otro: 'x' } }
    const first = run([pj(1, data)], { character_custom_fields: [{ key: 'magralita', label: 'R', type: 'text' }] })
    expect(first.pjs[0].newData).toEqual(data)
    expect(codes(first)).toEqual(['custom_field_conflict', 'custom_field_orphan'])
    const only = run([pj(1, { magralita: 'plano', custom_fields: { magralita: 'del campo' } })], { character_custom_fields: [{ key: 'magralita', label: 'R', type: 'text' }] })
    expect(only.pjs[0].changed).toBe(false)
    expect(codes(only)).toEqual(['custom_field_conflict'])
  })

  it('does not touch the input sheet', () => {
    const before = JSON.stringify(DND5E_SHEET)
    run([pj(1, {})], { character_custom_fields: fields })
    expect(JSON.stringify(DND5E_SHEET)).toBe(before)
  })

  it('leaves the sheet alone when there are no custom fields', () => {
    expect(run([pj(1, {})], { character_custom_fields: [] }).sheet).toEqual(DND5E_SHEET)
  })

  it('keeps unknown custom_fields entries and warns', () => {
    const out = run([pj(1, { custom_fields: { ancla: 'T', otro: 'x' } })], { character_custom_fields: fields })
    expect(out.pjs[0].newData).toEqual({ ancla: 'T', custom_fields: { otro: 'x' } })
    expect(codes(out)).toEqual(['custom_field_orphan'])
  })

  it('skips malformed field definitions with a warning', () => {
    const out = run([pj(1, {})], { character_custom_fields: [{ key: 'Mal Key', label: 'x' }, 'x', { key: 'bien', label: 'Bien' }] })
    expect(section(out.sheet)?.items.map((i) => i.key)).toEqual(['bien'])
    expect(codes(out)).toEqual(['custom_field_invalid', 'custom_field_invalid'])
  })
})

describe('jugador (S33)', () => {
  it('is the display name of the owner, or empty when unowned; the legacy text is discarded', () => {
    const out = run([pj(1, {}, { owner_display_name: 'Ana', jugador: 'viejo' }), pj(2, {}, { owner_display_name: null, jugador: 'libre' }), pj(3, {}, { owner_display_name: 'Cleo', jugador: 'Cleo' })])
    expect(out.pjs.map((p) => [p.jugador, p.changed])).toEqual([['Ana', true], ['', true], ['Cleo', false]])
    expect(out.report.counts.jugador_changed).toBe(2)
  })
})

describe('hechizos -> collection entries (S36, S39)', () => {
  const held = (...rows: unknown[][]) => run(rows.map((r, i) => pj(i + 1, { hechizos: r })))

  it('maps nivel to category, descripcion to description and the columns to extras', () => {
    const out = held([
      spell('Luz', 0, { escuela: 'Evoc', casting_time: '1 acción', alcance: 'Toque', componentes: 'V', duracion: '1 h', a_niveles_superiores: 'mas', concentracion: true, ritual: false, descripcion: 'Brilla' }),
      spell('Bola', 3),
      spell('Don', 10),
    ])
    expect(out.actions.map((a) => [a.category, a.name])).toEqual([['nivel_3', 'Bola'], ['rasgos', 'Don'], ['trucos', 'Luz']])
    expect(out.actions.find((a) => a.name === 'Luz')).toEqual({
      table_key: 'hechizos',
      category: 'trucos',
      name: 'Luz',
      description: 'Brilla',
      extras: { escuela: 'Evoc', tiempo_lanzamiento: '1 acción', alcance: 'Toque', componentes: 'V', duracion: '1 h', a_niveles_superiores: 'mas', concentracion: true },
      private_to_pj: null,
    })
  })

  it('removes hechizos from the character data', () => {
    const out = held([spell('Luz', 0)])
    expect(out.pjs[0].newData).toEqual({})
    expect(out.pjs[0].removedKeys).toEqual(['hechizos'])
  })

  it('a spell held by one character is a shared entry; preparado is the link state', () => {
    const out = held([spell('Luz', 0, { preparado: true })])
    expect(out.actions).toHaveLength(1)
    expect(out.actions[0].private_to_pj).toBeNull()
    expect(out.links).toEqual([{ pj_id: 1, action: { table_key: 'hechizos', category: 'trucos', name: 'Luz', private_to_pj: null }, state: { preparado: true } }])
  })

  it('identical content in several characters: one shared entry linked to all, each with its own preparado', () => {
    const out = held([spell('Luz', 0, { preparado: true })], [spell('Luz', 0, { preparado: false })])
    expect(out.actions).toHaveLength(1)
    expect(out.links.map((l) => [l.pj_id, l.state.preparado])).toEqual([[1, true], [2, false]])
    expect(out.report.counts.entries_shared).toBe(1)
  })

  it('different content under the same name: one private entry per holder, keeping the name', () => {
    const out = held([spell('Bola', 3, { descripcion: 'a' })], [spell('Bola', 3, { descripcion: 'b' })], [spell('Bola', 3, { descripcion: 'a' })])
    expect(out.actions.map((a) => [a.name, a.private_to_pj, a.description])).toEqual([['Bola', 1, 'a'], ['Bola', 2, 'b'], ['Bola', 3, 'a']])
    expect(out.links.map((l) => [l.pj_id, l.action.private_to_pj])).toEqual([[1, 1], [2, 2], [3, 3]])
    expect(out.report.counts.entries_private).toBe(3)
  })

  it('groups by lower(trim(name)) but a different spelling counts as different content', () => {
    const out = held([spell(' Bola ', 3)], [spell('bola', 3)])
    expect(out.actions.map((a) => [a.name, a.private_to_pj])).toEqual([['Bola', 1], ['bola', 2]])
  })

  it('the same name in another category is another entry', () => {
    const out = held([spell('Don', 10), spell('Don', 1)])
    expect(out.actions).toHaveLength(2)
  })

  it('the preparado flag does not make content differ', () => {
    const out = held([spell('Luz', 0, { preparado: true })], [spell('Luz', 0, { preparado: false })])
    expect(out.actions).toHaveLength(1)
  })

  it('links to an entry that already exists in the collection instead of creating it', () => {
    const out = run([pj(1, { hechizos: [spell('Luz', 0)] })], { existing_actions: [{ category: 'trucos', name: 'luz', private_to_pj: null }] })
    expect(out.actions).toEqual([])
    expect(out.links).toHaveLength(1)
    expect(out.report.counts.entries_reused).toBe(1)
  })

  it('warns about rows it has to repair or skip, never with text', () => {
    const out = held([spell('', 1), spell('Sin nivel', 99), spell('Doble', 1), spell('doble', 1), 'basura', spell('Largo', 1, { escuela: 'x'.repeat(600), rara: 1 })])
    expect(out.actions.map((a) => [a.category, a.name])).toEqual([['nivel_1', 'Doble'], ['nivel_1', 'Largo'], ['rasgos', 'Sin nivel']])
    expect(new Set(codes(out))).toEqual(new Set(['spell_name_missing', 'spell_nivel_invalid', 'spell_duplicate_in_character', 'spell_row_invalid', 'spell_value_truncated', 'spell_field_dropped']))
    expect((out.actions.find((a) => a.name === 'Largo')?.extras.escuela as string).length).toBe(500)
    expect(JSON.stringify(out.report)).not.toContain('Doble')
  })
})

describe('idempotency and untouched data', () => {
  const legacy = () => [
    pj(1, { skill_arcana: 2, stat_hit_dice: '1d8 (1/2)', spell_slots: { '1': 2 }, hechizos: [spell('Luz', 0)], recursos: [{ nombre: 'a', recuperacion: 'x' }], custom_fields: { ancla: 'T' }, stat_hp: 4 }, { owner_display_name: 'Ana', jugador: 'viejo' }),
  ]
  const campaign = { character_custom_fields: [{ key: 'ancla', label: 'Ancla', type: 'text' }] }

  it('running again on migrated data changes nothing', () => {
    const first = run(legacy(), campaign)
    const again = migrateDnd5eV2({
      campaign: { sheet: first.sheet, ...campaign },
      pjs: first.pjs.map((p) => ({ id: p.id, nivel: 2, owner_display_name: 'Ana', jugador: p.jugador, data: p.newData })),
    })
    expect(again.pjs.map((p) => p.changed)).toEqual([false])
    expect(again.pjs[0].newData).toEqual(first.pjs[0].newData)
    expect(again.pjs[0].removedKeys).toEqual([])
    expect(again.actions).toEqual([])
    expect(again.links).toEqual([])
    expect(again.sheet).toEqual(first.sheet)
    expect(again.report.counts.pjs_changed).toBe(0)
  })

  it('leaves unrelated keys, tables and values exactly as they were', () => {
    const data = { stat_hp: 4, equipo: [{ nombre: 'Soga', cantidad: 1 }], idiomas: 'Común', save_str: true }
    const out = run([pj(1, data)])
    expect(out.pjs[0]).toEqual({ id: 1, newData: data, removedKeys: [], jugador: '', changed: false })
  })

  it('does not mutate its input', () => {
    const input = legacy()
    const before = JSON.stringify(input)
    run(input, campaign)
    expect(JSON.stringify(input)).toBe(before)
  })
})

describe('masked report', () => {
  it('holds counts and codes only: no names, descriptions or free text', () => {
    const out = run([pj(1, { stat_hit_dice: 'texto secreto raro', hechizos: [spell('Nombre Secreto', 1, { descripcion: 'Descripción secreta' })], custom_fields: { ancla: 'valor secreto' } }, { owner_display_name: 'Persona Secreta' })], {
      character_custom_fields: [{ key: 'ancla', label: 'Etiqueta secreta', type: 'text' }],
    })
    const printed = JSON.stringify(out.report)
    for (const secret of ['secret', 'Secret', 'Persona']) expect(printed).not.toContain(secret)
    expect(Object.keys(out.report)).toEqual(['counts', 'warnings'])
    for (const w of out.report.warnings) expect(Object.keys(w).sort()).toEqual(['code', 'pj_id'])
  })
})
