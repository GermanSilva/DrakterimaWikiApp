import { describe, expect, it } from 'vitest'
import { SECRET_PASSWORD_1, SENTINEL_TEXT, makeLegacy } from '../import/fixture.mjs'
import { dryRun, formatDryRun, main, presetSheetV2 } from './dryRunDnd5eV2.mjs'

const SECRETS = [SENTINEL_TEXT, SECRET_PASSWORD_1, 'Aria', 'Borin', 'Bola de Fuego', 'Texto de la descripción', 'Ana', 'Fuerte']

function legacyExport() {
  const legacy = makeLegacy()
  Object.assign(legacy.pjs[0], {
    skill_arcana: 1,
    skill_stealth: 2,
    stat_hit_dice: '1d8 (1/2)',
    spell_slots: { 1: 3 },
    hechizos: [
      { nombre: 'Bola de Fuego', nivel: 3, preparado: true, descripcion: 'Texto de la descripción' },
      { nombre: SENTINEL_TEXT, nivel: 1, descripcion: SENTINEL_TEXT },
    ],
    recursos: [{ nombre: 'Ki', recuperacion: 'en una luna llena', actual: 1, maximo: 2 }],
  })
  Object.assign(legacy.pjs[1], { stat_hit_dice: SENTINEL_TEXT, skill_history: 7, hechizos: [{ nombre: 'Bola de Fuego', nivel: 3, descripcion: 'otra' }] })
  return JSON.stringify(legacy)
}

describe('presetSheetV2', () => {
  it('reads the v2 preset literal of the migration', () => {
    expect(JSON.stringify(presetSheetV2())).toContain('"dado_golpe"')
  })
})

describe('dry run over a legacy export', () => {
  it('reports counts and warning codes of the twin', () => {
    const result = dryRun(legacyExport())
    expect(result.ok).toBe(true)
    expect(result.pjs).toBe(2)
    expect(result.summary.counts).toMatchObject({ pjs: 2, pjs_changed: 2, skills_converted: 2, hit_dice_parsed: 1, hit_dice_unparsed: 1, slot_rows: 1, spell_rows: 3, links: 3 })
    expect(result.summary.warnings).toEqual({ hit_dice_unparsed: 1, recuperacion_unknown: 1, skill_value_unknown: 1, custom_field_key_collision: 1 })
    expect(result.warningPjs.hit_dice_unparsed).toEqual([2])
  })

  it('prints counts and codes only: no names, descriptions, free text or passwords', () => {
    const lines = []
    const code = main(['export.json'], { read: legacyExport, out: (l) => lines.push(l), err: (l) => lines.push(l) })
    expect(code).toBe(0)
    const printed = lines.join('\n')
    for (const secret of SECRETS) expect(printed).not.toContain(secret)
    expect(printed).toContain('hit_dice_unparsed: 1 (characters 2)')
    expect(printed).toContain('Characters in the export: 2')
  })

  it('fails with a fixed message when the file cannot be read or parsed', () => {
    const lines = []
    expect(main(['x.json'], { read: () => { throw new Error('secret path') }, out: () => undefined, err: (l) => lines.push(l) })).toBe(1)
    expect(main(['x.json'], { read: () => '{not json', out: () => undefined, err: (l) => lines.push(l) })).toBe(1)
    expect(lines).toEqual(['could not read the export file', 'the export could not be parsed'])
  })

  it('rejects bad arguments', () => {
    const lines = []
    expect(main([], { read: legacyExport, out: () => undefined, err: (l) => lines.push(l) })).toBe(2)
    expect(main(['--x'], { read: legacyExport, out: () => undefined, err: (l) => lines.push(l) })).toBe(2)
    expect(lines[0]).toContain('usage:')
  })

  it('formats an unimportable export without details', () => {
    expect(formatDryRun({ ok: false, problems: 3 })).toEqual(['The export is not importable (3 problem(s)); run the importer dry run for the report.'])
  })
})
