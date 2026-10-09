import { describe, expect, it } from 'vitest'
import { buildInvitesCsv, csvCell, inviteLink } from './files.mjs'
import { buildImport } from './index.mjs'
import { makeLegacy, shiftLegacyIds } from './fixture.mjs'
import { buildReport } from './report.mjs'
import { MAX_PARAMS, buildGameLogInsert, buildUpsert, quoteIdent, restoreSequenceStatement, sequenceStateQuery, setvalStatement } from './sql.mjs'

const CID = '11111111-2222-4333-8444-555555555555'
const SENTINEL = 'SENTINEL-CELL-VALUE'

describe('buildUpsert', () => {
  const rows = [
    { id: 1, campaign_id: CID, nombre: SENTINEL, visible_to: [1, 2], data: { k: SENTINEL }, created_at: '2026-01-01T00:00:00.000Z' },
    { id: 2, campaign_id: CID, nombre: 'b', visible_to: [], data: {} },
  ]
  const [stmt] = buildUpsert({ table: 'pjs', rows, conflictColumns: ['id'], onConflict: 'update', returning: 'id' })

  it('keeps every value out of the SQL text', () => {
    expect(stmt.text).not.toContain(SENTINEL)
    expect(stmt.text).not.toContain(CID)
    expect(JSON.stringify(stmt.values)).toContain(SENTINEL)
    expect(stmt.values).toContain(CID)
  })

  it('binds cells as parameters, casts JSON and arrays, and uses DEFAULT for a column a row lacks', () => {
    expect(stmt.text).toMatch(/\$\d+::jsonb/)
    expect(stmt.text).toMatch(/\$\d+::bigint\[\]/)
    expect(stmt.text).toMatch(/\$\d+::timestamptz/)
    expect(stmt.text).toMatch(/, default\)/) // row 2 has no created_at
    expect(stmt.values).toContain(JSON.stringify({ k: SENTINEL })) // JSON columns are serialised, not interpolated
  })

  it('upserts only rows of the same campaign and never rewrites id, campaign_id or created_at', () => {
    expect(stmt.text).toContain('on conflict ("id") do update set')
    expect(stmt.text).toContain('where "pjs".campaign_id = excluded.campaign_id')
    expect(stmt.text).not.toMatch(/set[^w]*"id" =/)
    expect(stmt.text).not.toMatch(/"campaign_id" = excluded/)
    expect(stmt.text).not.toMatch(/"created_at" = excluded/)
    expect(stmt.text.endsWith('returning "id"')).toBe(true)
  })

  it('supports do-nothing conflicts and composite targets', () => {
    const [s] = buildUpsert({ table: 'campaign_config', rows: [{ campaign_id: CID, key: 'k', value: { a: 1 }, visibility: 'dm' }], conflictColumns: ['campaign_id', 'key'], onConflict: 'nothing' })
    expect(s.text).toContain('on conflict ("campaign_id", "key") do nothing')
  })

  it('chunks big inputs below the bind-parameter limit', () => {
    const many = Array.from({ length: 12000 }, (_, i) => ({ id: i + 1, campaign_id: CID, nombre: 'n', region: 'r', tipo: 't' }))
    const statements = buildUpsert({ table: 'lugares', rows: many, conflictColumns: ['id'], onConflict: 'update' })
    expect(statements.length).toBeGreaterThan(1)
    for (const s of statements) expect(s.values.length).toBeLessThanOrEqual(MAX_PARAMS)
    expect(statements.reduce((n, s) => n + s.rowCount, 0)).toBe(many.length)
  })

  it('rejects unsafe identifiers instead of interpolating them', () => {
    expect(() => quoteIdent('pjs; drop table pjs')).toThrow()
    expect(() => buildUpsert({ table: 'pjs', rows: [{ id: 1, campaign_id: CID, 'nombre"; drop': 'x' }], conflictColumns: ['id'], onConflict: 'update' })).toThrow('unsafe')
    expect(() => buildUpsert({ table: 'pjs"', rows: [{ id: 1, campaign_id: CID }], conflictColumns: ['id'], onConflict: 'update' })).toThrow('unsafe')
  })

  it('returns nothing for no rows', () => {
    expect(buildUpsert({ table: 'pjs', rows: [], conflictColumns: ['id'], onConflict: 'update' })).toEqual([])
  })
})

describe('buildGameLogInsert', () => {
  const [stmt] = buildGameLogInsert(
    [{ actor_type: 'player', character_id: 3, game: SENTINEL, play_date: '2026-03-01', roll: 12, prize: { cp: 5 }, prize_target: 'player' }],
    CID,
  )
  it('is parameterised and dedupes against existing rows', () => {
    expect(stmt.text).not.toContain(SENTINEL)
    expect(stmt.values).toContain(SENTINEL)
    expect(stmt.values[0]).toBe(CID)
    expect(stmt.text).toContain('where not exists')
    expect(stmt.text).toContain('on conflict do nothing')
    expect(stmt.text).toContain('coalesce(v.created_at, now())')
  })
})

describe('sequences', () => {
  it('advances past the highest id, never backwards, and resets an untouched empty table to 1 (not called)', () => {
    expect(setvalStatement('pjs', { max_id: '12', last_value: null }).values).toEqual(['public.pjs', 12])
    expect(setvalStatement('pjs', { max_id: '12', last_value: '40' }).values).toEqual(['public.pjs', 40])
    expect(setvalStatement('pjs', { max_id: null, last_value: null }).text).toContain('1, false')
  })

  it('restores the previous position', () => {
    expect(restoreSequenceStatement('pjs', { last_value: null }).text).toContain('1, false')
    expect(restoreSequenceStatement('pjs', { last_value: '7' }).values).toEqual(['public.pjs', '7'])
  })

  it('only accepts table names that look like identifiers', () => {
    expect(() => sequenceStateQuery('pjs; select 1')).toThrow()
    expect(sequenceStateQuery('pjs').values).toEqual(['public.pjs'])
  })
})

describe('CSV', () => {
  it('quotes and neutralises formulas', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"')
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('+1')).toBe("'+1")
    expect(csvCell(null)).toBe('')
  })

  it('writes the documented columns with an invite link', () => {
    const csv = buildInvitesCsv(
      [{ pjId: 7, nombre: 'Aria', jugador: 'Ana, la', code: 'abc123', expiresAt: new Date('2027-01-01T00:00:00.000Z'), status: 'created' }],
      'https://app.example.test',
    )
    expect(csv.split('\n')[0]).toBe('pj_id,nombre,jugador,code,link,expires_at,status')
    expect(csv.split('\n')[1]).toBe('7,Aria,"Ana, la",abc123,https://app.example.test/invite/abc123,2027-01-01T00:00:00.000Z,created')
    expect(inviteLink('https://x.test', 'a/b')).toBe('https://x.test/invite/a%2Fb')
  })
})

describe('report.idRange', () => {
  it('handles ids in the hundreds of thousands without spreading them', () => {
    const legacy = makeLegacy()
    const { report } = buildImport(legacy, { mode: 'lenient' })
    expect(report.idRanges.pjs).toMatchObject({ count: 2, min: 1, max: 2, nextSequenceValue: 3 })

    const big = Array.from({ length: 300000 }, (_, i) => ({ id: i + 1 }))
    const output = { tables: { pjs: big }, dmNotes: [], gameLogs: [], gamePot: null, campaignConfig: [], disponibilidad: [], deferred: { byPj: {}, dm: { readState: [] } }, dropped: {}, estadoDefaulted: {}, campaign: { slug: 's', regions: [] }, extraRegions: 0 }
    const rebuilt = () =>
      buildReport({
        legacy: { counts: {} },
        output: { ...output, tables: { ...output.tables, pjs: big.map((r) => ({ ...r, estado: 'publicado', visible_to: [] })) } },
        wikiLinks: {},
        collector: { mode: 'strict', issues: [], errors: () => [] },
      })
    expect(rebuilt().idRanges.pjs).toMatchObject({ count: 300000, min: 1, max: 300000, nextSequenceValue: 300001 })
  })
})

describe('shiftLegacyIds', () => {
  it('moves own ids, references and wiki-link ids together', () => {
    const shifted = shiftLegacyIds(makeLegacy(), 1000)
    expect(shifted.pjs.map((p) => p.id)).toEqual([1001, 1002])
    expect(shifted.map_points[0]).toMatchObject({ id: 1001, map_id: 1001, link_id: 1001 })
    expect(shifted.map_points[1].link_id).toBe('')
    expect(shifted.lugares[1].visibilidad).toEqual([1001, 1002, 1077])
    expect(shifted.sesiones[0].resumen).toContain('[[{1001P}Aria]]')
    expect(shifted.player_notes[0]).toMatchObject({ pj_id: 1001, entity_id: 1001 })
    expect(shifted.game_logs[0].playerId).toBe(1001)
    expect(shifted.read_state[0].viewerId).toBe('dm')
  })
})
