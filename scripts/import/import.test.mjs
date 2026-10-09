import { describe, expect, it } from 'vitest'
import { buildImport, formatReport } from './index.mjs'
import { DM_SECRET_TEXT, SECRET_PASSWORD_1, SECRET_PASSWORD_2, SENTINEL_TEXT, makeLegacy } from './fixture.mjs'

/** The fixture with every CHECK-violating quirk repaired, so strict mode accepts it. */
function cleanLegacy() {
  const l = makeLegacy()
  l.pjs[1].nivel = 20
  l.lugares[1].visibilidad = [1, 2]
  delete l.items[0].estado
  l.mapas[1].is_default = false
  l.map_points = l.map_points.filter((p) => p.id !== 4 && p.id !== 6)
  l.map_points.find((p) => p.id === 3).x = 0.9
  l.map_points.find((p) => p.id === 3).y = 0.1
  l.map_points.find((p) => p.id === 5).link_id = 1
  l.player_notes = l.player_notes.filter((n) => n.id === '1_lugares_1')
  l.game_logs = l.game_logs.filter((g) => g.id !== 'b' && g.id !== 'c')
  return l
}

const codes = (report) => report.issues.list.map((i) => i.code)
const lenient = (input = makeLegacy(), opts = {}) => buildImport(input, { mode: 'lenient', ...opts })

describe('strict mode', () => {
  it('aborts on CHECK-violating data and emits no rows', () => {
    const { ok, output, report } = buildImport(makeLegacy())
    expect(ok).toBe(false)
    expect(output).toBeNull()
    expect(report.ok).toBe(false)
    expect(codes(report)).toEqual(
      expect.arrayContaining([
        'nivel_out_of_range',
        'invalid_estado',
        'visibility_unknown_pj',
        'multiple_default_maps',
        'orphan_map_point',
        'coordinate_out_of_range',
        'dangling_map_link',
        'invalid_link_pair',
      ]),
    )
  })

  it('accepts a repaired export and reports no errors', () => {
    const { ok, output, report } = buildImport(cleanLegacy())
    expect(report.issues.list.filter((i) => i.severity === 'error')).toEqual([])
    expect(ok).toBe(true)
    expect(output.tables.pjs).toHaveLength(2)
  })
})

describe('lenient mode', () => {
  const { ok, output, report } = lenient()

  it('imports with fixes and downgrades the problems to warnings', () => {
    expect(ok).toBe(true)
    expect(report.issues.errors).toBe(0)
    expect(report.issues.warnings).toBeGreaterThan(0)
  })

  it('clamps nivel, hides unknown estados and drops unknown visibility ids', () => {
    expect(output.tables.pjs.find((p) => p.id === 2).nivel).toBe(20)
    expect(output.tables.items[0].estado).toBe('borrador')
    expect(output.tables.lugares.find((l) => l.id === 2).visible_to).toEqual([1, 2])
  })

  it('keeps exactly one default map (lowest id) and drops orphan map points', () => {
    expect(output.tables.mapas.map((m) => [m.id, m.is_default])).toEqual([
      [1, true],
      [2, false],
    ])
    expect(output.tables.map_points.map((p) => p.id)).toEqual([1, 2, 3, 5, 6])
  })

  it('clamps coordinates and clears broken link pairs', () => {
    const pts = Object.fromEntries(output.tables.map_points.map((p) => [p.id, p]))
    expect([pts[3].x, pts[3].y]).toEqual([1, 0])
    expect(pts[2]).toMatchObject({ link_type: null, link_id: null })
    expect(pts[5]).toMatchObject({ link_type: null, link_id: null }) // link_id 55 does not exist
    expect(pts[6]).toMatchObject({ link_type: null, link_id: null }) // type without id
    expect(pts[1]).toMatchObject({ link_type: 'lugar', link_id: 1, x: 0.25, y: 0.75 })
  })
})

describe('entity rows', () => {
  const { output } = lenient()

  it('preserves ids and splits promoted columns from data', () => {
    const aria = output.tables.pjs.find((p) => p.id === 1)
    expect(aria).toMatchObject({ id: 1, nombre: 'Aria', clase: 'Mago', region: 'magral', nivel: 5, estado: 'publicado', visible_to: [] })
    expect(aria.monedas).toEqual({ cp: 1, sp: 2, ep: 0, gp: 3, pp: 0 })
    expect(aria.data).toEqual({ stat_hp: 20, hechizos: [{ id: 1, nombre: 'Bola', nivel: 3 }], custom_fields: { magralita: 'Fuerte' } })
    expect(aria).not.toHaveProperty('magralita')
  })

  it('maps visibilidad to visible_to and defaults a missing estado to publicado', () => {
    expect(output.tables.pjs.find((p) => p.id === 2)).toMatchObject({ estado: 'secreto', visible_to: [1] })
    expect(output.tables.sesiones.find((s) => s.id === 2).estado).toBe('publicado')
    expect(output.tables.pjs.find((p) => p.id === 2).data).not.toHaveProperty('custom_fields') // empty magralita
    for (const rows of Object.values(output.tables)) for (const r of rows) expect(r).not.toHaveProperty('visibilidad')
  })

  it("turns '' into null for numero/fecha and carries optional timestamps", () => {
    const [s1, s2] = output.tables.sesiones
    expect(s2).toMatchObject({ numero: null, fecha: null, tipo: 'avance' })
    expect(s1).toMatchObject({ numero: 1, fecha: '2026-01-10', created_at: '2026-01-11T10:00:00.000Z', updated_at: '2026-01-12T10:00:00.000Z' })
    expect(s2).not.toHaveProperty('created_at')
    expect(s1).not.toHaveProperty('createdAt')
  })

  it('keeps DM-private text out of the entity rows and in separate note rows', () => {
    const text = JSON.stringify(output.tables)
    expect(text).not.toContain(DM_SECRET_TEXT)
    expect(text).not.toContain('Es una espía')
    for (const rows of Object.values(output.tables)) for (const r of rows) for (const f of ['notas', 'secreto', 'ganchos']) expect(r.data).not.toHaveProperty(f)
    expect(output.dmNotes).toEqual([
      { entity_type: 'facciones', entity_id: 1, notas: '', secreto: 'Oculto', ganchos: '' },
      { entity_type: 'mapas', entity_id: 1, notas: 'nota mapa', secreto: '', ganchos: '' },
      { entity_type: 'pjs', entity_id: 1, notas: '', secreto: 'Es una espía', ganchos: '' },
      { entity_type: 'pnjs', entity_id: 1, notas: '', secreto: '', ganchos: 'Conoce un secreto [[{2G}Lugar]]' },
      { entity_type: 'sesiones', entity_id: 1, notas: `${DM_SECRET_TEXT} plan [[{2G}Lugar]]`, secreto: '', ganchos: '' },
    ]) // lugares #1 had only empty notes: no row
  })

  it('refuses DM text on a table with no private storage instead of inlining it', () => {
    const l = cleanLegacy()
    l.map_points[0].notas = 'private pin note'
    expect(buildImport(l).ok).toBe(false)
    const res = lenient(l)
    expect(codes(res.report)).toContain('dm_notes_unsupported_table')
    expect(JSON.stringify(res.output)).not.toContain('private pin note')
  })
})

describe('campaign row', () => {
  it('carries identity, canonical and extra regions and the magralita custom field', () => {
    const { campaign } = lenient().output
    expect(campaign).toMatchObject({ slug: 'drakterima', name: 'Leyendas de Drakterima', system: 'dnd5e', branding: {} })
    expect(campaign.regions.slice(0, 5)).toEqual([
      { key: 'magral', label: 'Magral', color: '#7aad82' },
      { key: 'nezor', label: 'Nezor', color: '#c4834a' },
      { key: 'heladas', label: 'Tierras Heladas', color: '#7aaad0' },
      { key: 'islas', label: 'Islas Pétreas', color: '#9090c0' },
      { key: 'otro', label: 'Otro', color: '#9ca3af' },
    ])
    expect(campaign.regions.slice(5)).toEqual([{ key: 'frontera', label: 'frontera', color: '#9ca3af' }])
    expect(campaign.character_custom_fields).toEqual([{ key: 'magralita', label: 'Relación con la Magralita', type: 'text' }])
  })
})

describe('games, config and availability', () => {
  const { output } = lenient()

  it('dedupes player logs per character/day (earliest wins) and nulls unknown characters', () => {
    expect(output.gameLogs).toHaveLength(3)
    expect(output.gameLogs.find((g) => g.roll === 12)).toMatchObject({ actor_type: 'player', character_id: 1, play_date: '2026-03-01', prize: { cp: 5 }, prize_target: 'player' })
    expect(output.gameLogs.find((g) => g.roll === 20)).toBeUndefined()
    expect(output.gameLogs.find((g) => g.roll === 3).character_id).toBeNull()
    expect(output.gameLogs.find((g) => g.roll === 18)).toMatchObject({ actor_type: 'dm', character_id: null, prize_target: 'pot' })
    for (const g of output.gameLogs) expect(g).not.toHaveProperty('id')
  })

  it('rejects logs that violate the actor/target or roll CHECKs', () => {
    const l = cleanLegacy()
    l.game_logs.push({ id: 'x', actorType: 'player', playerId: 1, date: '2026-05-01', roll: 4, prize: {}, prizeTarget: 'pot' })
    l.game_logs.push({ id: 'y', actorType: 'player', playerId: 2, date: '2026-05-01', roll: 21, prize: {}, prizeTarget: 'player' })
    expect(buildImport(l).ok).toBe(false)
    expect(lenient(l).output.gameLogs).toHaveLength(2)
  })

  it('writes the pot and the two config rows without ids', () => {
    expect(output.gamePot).toEqual({ cp: 0, sp: 0, ep: 0, gp: 7, pp: 1 })
    expect(output.campaignConfig).toEqual([
      { key: 'loteria', value: { commonMinRoll: 10, commonPrize: { cp: 5 }, specialPrize: { gp: 5 } }, visibility: 'members' },
      { key: 'session_screen', value: { cards: [{ id: 'c1', tipo: 'stats' }] }, visibility: 'dm' },
    ])
  })

  it('imports only session availability and defers the personal kinds', () => {
    expect(output.disponibilidad).toEqual([
      { id: 1, tipo: 'sesion', fecha_inicio: '2026-02-01', fecha_fin: '2026-02-02', hora_inicio: '18:00', hora_fin: '23:00' },
    ])
    expect(output.deferred.byPj[1].availability).toEqual([
      { tipo: 'personal', fecha: null, fecha_inicio: '2026-02-03', fecha_fin: '2026-02-04', hora_inicio: '10:00', hora_fin: '12:00' },
    ])
    expect(output.deferred.byPj[2].availability).toEqual([
      { tipo: 'no_disponible', fecha: '2026-02-05', fecha_inicio: null, fecha_fin: null, hora_inicio: null, hora_fin: null },
    ])
  })

  it('rejects availability that breaks its CHECKs', () => {
    const l = cleanLegacy()
    l.disponibilidad.push({ id: 9, tipo: 'sesion', fecha_inicio: '2026-02-05', fecha_fin: '2026-02-01', hora_inicio: '18:00', hora_fin: '19:00' })
    expect(buildImport(l).ok).toBe(false)
    expect(lenient(l).output.disponibilidad.map((d) => d.id)).toEqual([1])
  })
})

describe('deferred-until-claim data', () => {
  const { output } = lenient()

  it('buckets player notes by character, skipping empty, dangling and unknown-owner notes', () => {
    expect(output.deferred.byPj[1].playerNotes).toEqual([{ entity_type: 'lugares', entity_id: 1, text: 'Nota de Aria' }])
    expect(output.deferred.byPj[2]?.playerNotes ?? []).toEqual([])
  })

  it('sends read_state of the DM to the DM bucket and of players to their character', () => {
    expect(output.deferred.dm.readState).toEqual([{ entity_type: 'sesiones', entity_id: 1, section: '', seen_at: '2026-04-01T00:00:00.000Z' }])
    expect(output.deferred.byPj[1].readState).toEqual([{ entity_type: 'lugares', entity_id: 1, section: 'descripcion', seen_at: '2026-04-02T00:00:00.000Z' }])
  })
})

describe('secrets', () => {
  it('never emits player_password / player_must_change anywhere', () => {
    const res = lenient()
    const everything = JSON.stringify({ output: res.output, text: formatReport(res.report), issues: res.report.issues, idRanges: res.report.idRanges, wiki: res.report.wikiLinks })
    expect(everything).not.toContain(SECRET_PASSWORD_1)
    expect(everything).not.toContain(SECRET_PASSWORD_2)
    expect(JSON.stringify(res.output)).not.toContain('player_password')
    expect(JSON.stringify(res.output)).not.toContain('player_must_change')
    expect(JSON.stringify(res.report)).not.toContain(SECRET_PASSWORD_1)
  })

  it('does not echo input text when the JSON is invalid', () => {
    expect(() => buildImport(`{"pjs":[{"player_password":"${SECRET_PASSWORD_1}"`)).toThrow(/not valid JSON/)
    try {
      buildImport(`{"pjs":[{"player_password":"${SECRET_PASSWORD_1}"`)
    } catch (e) {
      expect(String(e.message)).not.toContain(SECRET_PASSWORD_1)
    }
  })
})

describe('input validation', () => {
  it('fails on non-numeric and duplicate ids in either mode', () => {
    const l = cleanLegacy()
    l.pnjs.push({ id: 'abc', nombre: 'X' }, { id: 1, nombre: 'Dup' }, { id: 1.5, nombre: 'Frac' }, { nombre: 'NoId' })
    for (const mode of ['strict', 'lenient']) {
      const { ok, report } = buildImport(l, { mode })
      expect(ok).toBe(false)
      expect(report.issues.byCode.invalid_id).toBe(3)
      expect(report.issues.byCode.duplicate_id).toBe(1)
    }
  })

  it('accepts digit-string ids and normalises them to numbers', () => {
    const l = cleanLegacy()
    l.lore[0].id = '1'
    expect(buildImport(l).output.tables.lore[0].id).toBe(1)
  })

  it('flags an articles-only export unless allowPartial is set', () => {
    const l = cleanLegacy()
    for (const k of ['mapas', 'map_points', 'homebrew_rules', 'disponibilidad', 'game_logs', 'game_pot', 'game_config', 'read_state', 'login_logs']) delete l[k]
    const strict = buildImport(l)
    expect(strict.ok).toBe(false)
    expect(strict.report.issues.list.filter((i) => i.code === 'partial_export_missing_collection').map((i) => i.table)).toEqual(
      expect.arrayContaining(['mapas', 'map_points', 'homebrew_rules', 'disponibilidad', 'game_logs', 'game_pot', 'game_config']),
    )
    const partial = buildImport(l, { allowPartial: true })
    expect(partial.ok).toBe(true)
    expect(partial.output.gamePot).toBeNull()
    expect(partial.output.campaignConfig).toEqual([])
    expect(partial.report.allowPartial).toBe(true)
    expect(partial.report.issues.warnings).toBeGreaterThan(0)
  })

  it('tolerates missing optional keys on documents', () => {
    const l = cleanLegacy()
    l.pjs = [{ id: 7 }]
    l.player_notes = []
    l.read_state = []
    l.lugares = l.lugares.map((x) => ({ id: x.id }))
    l.sesiones = l.sesiones.map((x) => ({ id: x.id }))
    const { ok, output } = buildImport(l)
    expect(ok).toBe(true)
    expect(output.tables.pjs[0]).toEqual({ id: 7, estado: 'publicado', visible_to: [], data: {} })
  })
})

describe('wiki links', () => {
  it('audits links per letter without rewriting any text', () => {
    const l = makeLegacy()
    const before = JSON.stringify(l.sesiones[0].resumen)
    const { output, report } = lenient(l)
    expect(report.wikiLinks).toMatchObject({
      total: 7,
      resolved: 6,
      dangling: 1,
      noLetter: 1,
      unknownLetters: { Z: 1 },
      byLetter: {
        P: { total: 1, resolved: 1, dangling: 0 },
        N: { total: 1, resolved: 0, dangling: 1 },
        G: { total: 2, resolved: 2, dangling: 0 },
        F: { total: 1, resolved: 1, dangling: 0 },
        L: { total: 1, resolved: 1, dangling: 0 },
        H: { total: 1, resolved: 1, dangling: 0 },
      },
    })
    expect(JSON.stringify(output.tables.sesiones[0].data.resumen)).toBe(before)
  })
})

describe('report', () => {
  const { report, output } = lenient()
  const text = formatReport(report)

  it('compares legacy counts with output counts per table', () => {
    expect(report.counts.in).toMatchObject({ sesiones: 2, pjs: 2, map_points: 6, game_logs: 4, player_notes: 4, login_logs: 1 })
    expect(report.counts.out).toMatchObject({ sesiones: 2, pjs: 2, map_points: 5, entity_dm_notes: 5, game_logs: 3, game_pot: 1, campaign_config: 2, disponibilidad: 1 })
    expect(text).toContain('map_points: 6 -> 5')
  })

  it('counts dropped fields and the dropped login_logs collection', () => {
    expect(report.dropped).toEqual({ player_password: 2, player_must_change: 2, login_logs: 1 })
  })

  it('summarises estado, secrets, deferred data and id ranges', () => {
    expect(report.estadoDistribution.pjs).toEqual({ publicado: 1, secreto: 1, borrador: 0 })
    expect(report.estadoDistribution.items).toEqual({ publicado: 0, secreto: 0, borrador: 1 })
    expect(report.secretCounts.lugares).toEqual({ secreto: 1, withVisibleTo: 1, withDmNotes: 0 })
    expect(report.secretCounts.pjs).toEqual({ secreto: 1, withVisibleTo: 1, withDmNotes: 1 })
    expect(report.deferred).toEqual({ characters: 2, playerNotes: 1, readStatePlayers: 1, readStateDm: 1, availability: 2 })
    expect(report.idRanges.pjs).toEqual({ count: 2, min: 1, max: 2, nextSequenceValue: 3 })
    expect(report.idRanges.map_points).toEqual({ count: 5, min: 1, max: 6, nextSequenceValue: 7 })
    expect(report.idRanges.homebrew_rules.nextSequenceValue).toBe(2)
    expect(output.tables.map_points.at(-1).id).toBe(6)
  })

  it('lists issues as codes and locations only, with no row text or secrets', () => {
    expect(report.issues.byCode.dangling_map_link).toBe(1)
    for (const i of report.issues.list) expect(Object.keys(i).every((k) => ['severity', 'code', 'table', 'id', 'field', 'count'].includes(k))).toBe(true)
    const blob = `${text}\n${JSON.stringify(report)}`
    for (const forbidden of [SENTINEL_TEXT, DM_SECRET_TEXT, SECRET_PASSWORD_1, SECRET_PASSWORD_2, 'Es una espía', 'Aria', 'Tabernero', 'Nota de Aria']) {
      expect(blob).not.toContain(forbidden)
    }
  })
})
