import { describe, expect, it } from 'vitest'
import { UsageError, parseCliArgs } from './args.mjs'
import { ImportAbort } from './load.mjs'
import { buildAvailabilityInsertMissing, buildReadStateUpsert, buildUpsert } from './sql.mjs'
import { buildSyncReport, dedupeReadState, formatSyncSummary, planSync, referencedEntities, runSync } from './sync.mjs'

const CID = '11111111-2222-4333-8444-555555555555'
const DM = 'dddddddd-2222-4333-8444-555555555555'
const OWNER_1 = 'aaaaaaaa-2222-4333-8444-555555555555'
const SENTINEL = 'SENTINEL-NOTE-TEXT'

const deferred = () => ({
  byPj: {
    1: {
      playerNotes: [
        { entity_type: 'lugares', entity_id: 1, text: SENTINEL, created_at: '2026-01-01T00:00:00.000Z' },
        { entity_type: 'pnjs', entity_id: 1, text: '   ' }, // blank: never synced
        { entity_type: 'lore', entity_id: 9, text: 'gone' }, // entity deleted in the hub
        { entity_type: 'weird', entity_id: 1, text: 'unsupported type' },
      ],
      readState: [
        { entity_type: 'lugares', entity_id: 1, section: 'descripcion', seen_at: '2026-04-02T00:00:00.000Z' },
        { entity_type: 'lore', entity_id: 9, section: '', seen_at: '2026-04-02T00:00:00.000Z' },
      ],
      availability: [
        { tipo: 'personal', fecha: null, fecha_inicio: '2026-02-03', fecha_fin: '2026-02-04', hora_inicio: '10:00', hora_fin: '12:00' },
        { tipo: 'personal', fecha: null, fecha_inicio: '2026-02-03', fecha_fin: '2026-02-04', hora_inicio: '10:00', hora_fin: '12:00' }, // exact duplicate
      ],
    },
    2: { playerNotes: [{ entity_type: 'lore', entity_id: 1, text: 'of an unclaimed pj' }], readState: [], availability: [{ tipo: 'no_disponible', fecha: '2026-02-05' }] },
    77: { playerNotes: [{ entity_type: 'lore', entity_id: 1, text: 'pj deleted in the hub' }], readState: [], availability: [] },
  },
  dm: { readState: [{ entity_type: 'sesiones', entity_id: 1, section: '', seen_at: '2026-04-01T00:00:00.000Z' }, { entity_type: 'sesiones', entity_id: 5, section: '', seen_at: '2026-04-01T00:00:00.000Z' }] },
})
const existing = () => ({ lugares: new Set([1]), pnjs: new Set([1]), lore: new Set([1]), sesiones: new Set([1]) })
const pjs = () => [
  { id: 1, owner_id: OWNER_1, owner_is_member: true },
  { id: 2, owner_id: null },
]

describe('planSync (pure)', () => {
  const plan = planSync({ deferred: deferred(), pjs: pjs(), existing: existing(), campaignId: CID, dmUserId: DM })

  it('plans only for claimed characters and lists the unclaimed / missing ones', () => {
    expect(plan.claimed.map((c) => c.pjId)).toEqual([1])
    expect(plan.unclaimedPjIds).toEqual([2])
    expect(plan.missingPjIds).toEqual([77])
  })

  it('notes: non-empty text, supported type, existing entity; authored by the owner, shown as that character', () => {
    const [c] = plan.claimed
    expect(c.playerNotes).toEqual([
      { campaign_id: CID, user_id: OWNER_1, entity_type: 'lugares', entity_id: 1, character_id: 1, text: SENTINEL, created_at: '2026-01-01T00:00:00.000Z' },
    ])
    expect(c.skipped).toEqual({ dangling_notes: 2, dangling_read_state: 1 }) // blank dropped silently; deleted entity + unsupported type counted
  })

  it('availability is pinned to THIS campaign and deduplicated', () => {
    const [c] = plan.claimed
    expect(c.availability).toHaveLength(1)
    expect(c.availability[0]).toMatchObject({ user_id: OWNER_1, campaign_id: CID, tipo: 'personal' })
  })

  it('read state: the owner for the character, the campaign creator for the DM viewer', () => {
    expect(plan.claimed[0].readState).toEqual([{ user_id: OWNER_1, campaign_id: CID, entity_type: 'lugares', entity_id: 1, section: 'descripcion', seen_at: '2026-04-02T00:00:00.000Z' }])
    expect(plan.dm.readState).toEqual([{ user_id: DM, campaign_id: CID, entity_type: 'sesiones', entity_id: 1, section: '', seen_at: '2026-04-01T00:00:00.000Z' }])
    expect(plan.dm.skipped.dangling_read_state).toBe(1)
  })

  it('read state: legacy entries that collide after the section normalisation keep ONE row, the newest (R3-001/R4-001)', () => {
    const d = deferred()
    d.byPj[1].readState = [
      { entity_type: 'lugares', entity_id: 1, section: null, seen_at: '2026-04-05T00:00:00.000Z' },
      { entity_type: 'lugares', entity_id: 1, section: '', seen_at: '2026-04-09T00:00:00.000Z' },
      { entity_type: 'lugares', entity_id: 1, section: undefined, seen_at: '2026-04-01T00:00:00.000Z' },
      { entity_type: 'lugares', entity_id: 1, section: 'descripcion', seen_at: '2026-04-02T00:00:00.000Z' },
    ]
    d.dm.readState = [
      { entity_type: 'sesiones', entity_id: 1, section: '', seen_at: '2026-04-01T00:00:00.000Z' },
      { entity_type: 'sesiones', entity_id: 1, section: null, seen_at: '2026-04-03T00:00:00.000Z' },
    ]
    const p = planSync({ deferred: d, pjs: pjs(), existing: existing(), campaignId: CID, dmUserId: DM })
    expect(p.claimed[0].readState.map((r) => [r.section, r.seen_at])).toEqual([
      ['', '2026-04-09T00:00:00.000Z'],
      ['descripcion', '2026-04-02T00:00:00.000Z'],
    ])
    expect(p.dm.readState.map((r) => r.seen_at)).toEqual(['2026-04-03T00:00:00.000Z'])
    // what reaches the database: no two tuples share the conflict key, so ON CONFLICT DO UPDATE never hits a row twice
    for (const rows of [p.claimed[0].readState, p.dm.readState]) {
      const keys = rows.map((r) => `${r.entity_type}|${r.entity_id}|${r.section}`)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it('dedupeReadState keeps the first of equal timestamps and ignores unparseable ones', () => {
    const a = { entity_type: 'lore', entity_id: 1, section: '', seen_at: '2026-04-01T00:00:00.000Z', tag: 'first' }
    const b = { ...a, tag: 'second' }
    const bad = { ...a, seen_at: 'not a date', tag: 'bad' }
    expect(dedupeReadState([a, b]).map((r) => r.tag)).toEqual(['first'])
    expect(dedupeReadState([bad, a]).map((r) => r.tag)).toEqual(['first'])
  })

  it('skips a claimed character whose owner left the campaign', () => {
    const p = planSync({ deferred: deferred(), pjs: [{ id: 1, owner_id: OWNER_1, owner_is_member: false }], existing: existing(), campaignId: CID, dmUserId: DM })
    expect(p.claimed).toEqual([])
    expect(p.detached).toEqual([1])
  })

  it('collects the referenced entities by supported type only', () => {
    const refs = referencedEntities({ ...deferred(), byPj: { 1: { playerNotes: [{ entity_type: 'weird', entity_id: 3 }, { entity_type: 'lore', entity_id: 4 }], readState: [], availability: [] } } })
    expect(Object.keys(refs).sort()).toEqual(['lore', 'sesiones'])
  })
})

describe('SQL builders', () => {
  it('player_notes sync is insert-missing: DO NOTHING on the primary key, values bound', () => {
    const rows = planSync({ deferred: deferred(), pjs: pjs(), existing: existing(), campaignId: CID, dmUserId: DM }).claimed[0].playerNotes
    const [s] = buildUpsert({ table: 'player_notes', rows, conflictColumns: ['user_id', 'campaign_id', 'entity_type', 'entity_id'], onConflict: 'nothing' })
    expect(s.text).toContain('on conflict ("user_id", "campaign_id", "entity_type", "entity_id") do nothing')
    expect(s.text).not.toContain(SENTINEL)
    expect(s.values).toContain(SENTINEL)
    expect(s.text).not.toMatch(/do update/)
  })

  it('read_state only moves seen_at forward and binds every value', () => {
    const [s] = buildReadStateUpsert([{ user_id: OWNER_1, campaign_id: CID, entity_type: 'lugares', entity_id: 1, section: SENTINEL, seen_at: '2026-04-02T00:00:00.000Z' }])
    expect(s.text).toContain('do update set seen_at = excluded.seen_at where public.read_state.seen_at < excluded.seen_at')
    expect(s.text).not.toContain(SENTINEL)
    expect(s.text).not.toContain(OWNER_1)
    expect(s.values).toContain(SENTINEL)
    expect(buildReadStateUpsert([])).toEqual([])
  })

  it('availability is insert-missing: NOT EXISTS over every data column, NULL-safe, never an update', () => {
    const [s] = buildAvailabilityInsertMissing([
      { user_id: OWNER_1, campaign_id: CID, tipo: 'no_disponible', fecha: '2026-02-05', fecha_inicio: null, fecha_fin: null, hora_inicio: null, hora_fin: null },
    ])
    expect(s.text).toContain('where not exists')
    for (const c of ['user_id', 'campaign_id', 'tipo', 'fecha', 'fecha_inicio', 'fecha_fin', 'hora_inicio', 'hora_fin']) expect(s.text).toContain(`a.${c} is not distinct from v.${c}`)
    expect(s.text).not.toMatch(/do update|\bupdate\b/)
    expect(s.text).not.toContain(OWNER_1)
    expect(s.values).toContain(OWNER_1)
  })

  it('the negative check can fail: a plain = comparison in the availability guard is flagged', () => {
    const [s] = buildAvailabilityInsertMissing([{ user_id: OWNER_1, campaign_id: CID, tipo: 'no_disponible', fecha: '2026-02-05' }])
    const guard = /a\.\w+ = v\./
    expect(s.text).not.toMatch(guard)
    expect(s.text.replace('a.tipo is not distinct from v.tipo', 'a.tipo = v.tipo')).toMatch(guard)
  })
})

describe('arguments', () => {
  const base = ['--sync-claims', '--input', 'export.json', '--slug', 'mi-campana']
  it('needs only --input and --slug', () => {
    expect(parseCliArgs(base)).toMatchObject({ syncClaims: true, input: 'export.json', slug: 'mi-campana', apply: false, dmEmail: null, appOrigin: null, mode: 'strict' })
    expect(parseCliArgs([...base, '--apply', '--lenient'])).toMatchObject({ apply: true, mode: 'lenient' })
  })

  it.each([
    [['--sync-claims', '--input', 'f.json'], /--slug/],
    [['--sync-claims', '--slug', 'abc'], /--input/],
    [[...base, '--dm-email', 'a@b.test'], /--dm-email does not apply/],
    [[...base, '--app-origin', 'https://x.test'], /--app-origin does not apply/],
    [[...base, '--invite-days', '5'], /does not apply/],
    [[...base, '--force-overwrite'], /does not apply/],
    [[...base, '--name', 'X'], /does not apply/],
  ])('rejects %j', (argv, message) => {
    expect(() => parseCliArgs(argv)).toThrow(UsageError)
    expect(() => parseCliArgs(argv)).toThrow(message)
  })

  it('a normal import still requires --dm-email and --app-origin', () => {
    expect(() => parseCliArgs(['--input', 'f.json'])).toThrow(/--dm-email/)
    expect(parseCliArgs(['--input', 'f.json', '--dm-email', 'a@b.test', '--app-origin', 'https://x.test']).syncClaims).toBe(false)
  })
})

/** Scripted pg client for runSync: no database. */
function fakeClient({ campaign = { id: CID, created_by: DM, settings: { import: { source: 'legacy-firestore' } } }, failCommit = false, rowCounts = {} } = {}) {
  const log = []
  return {
    log,
    async query(text, values = []) {
      const t = typeof text === 'string' ? text : text.text
      log.push({ t, values })
      if (t === 'commit' && failCommit) throw new Error('connection terminated')
      if (/from public\.campaigns where slug/.test(t)) return { rows: campaign ? [campaign] : [], rowCount: campaign ? 1 : 0 }
      if (/from public\.pjs p where/.test(t)) {
        return { rows: [{ id: '1', nombre: 'Aria', jugador: 'Ana', owner_id: OWNER_1, owner_is_member: true }, { id: '2', nombre: 'Borin', jugador: 'Beto', owner_id: null, owner_is_member: false }], rowCount: 2 }
      }
      if (/select id from public\./.test(t)) return { rows: [{ id: '1' }], rowCount: 1 }
      if (/from public\.campaign_invites/.test(t)) return { rows: [{ total: 1, live: 1 }], rowCount: 1 }
      if (/insert into/.test(t)) {
        const table = /insert into public\."?(\w+)/.exec(t)?.[1]
        return { rows: [], rowCount: rowCounts[table] ?? 1 }
      }
      return { rows: [], rowCount: 0 }
    },
  }
}
const output = () => ({ deferred: deferred(), tables: { pjs: [{ id: 1 }, { id: 2 }] } })
const texts = (c) => c.log.map((q) => q.t)

describe('runSync (scripted client)', () => {
  it('a dry run executes the writes and ROLLS BACK; counts and the unclaimed list come back', async () => {
    const c = fakeClient()
    const res = await runSync(c, { output: output(), slug: 'camp', apply: false })
    expect(res.committed).toBe(false)
    expect(texts(c).at(-1)).toBe('rollback')
    expect(texts(c)).not.toContain('commit')
    expect(texts(c).some((t) => /insert into public\."player_notes"/.test(t))).toBe(true)
    expect(res.db.perPj[1].playerNotes.planned).toBe(1)
    expect(res.db.unclaimed).toEqual([{ pjId: 2, nombre: 'Borin', jugador: 'Beto', hubOnly: false, invite: 'live' }])
  })

  it('apply commits', async () => {
    const c = fakeClient()
    const res = await runSync(c, { output: output(), slug: 'camp', apply: true })
    expect(res.committed).toBe(true)
    expect(texts(c).at(-1)).toBe('commit')
  })

  it('refuses a campaign that does not exist or was not created by the importer, and rolls back', async () => {
    const missing = fakeClient({ campaign: null })
    await expect(runSync(missing, { output: output(), slug: 'camp', apply: true })).rejects.toMatchObject({ code: 'campaign_not_found' })
    expect(texts(missing).at(-1)).toBe('rollback')
    const foreign = fakeClient({ campaign: { id: CID, created_by: DM, settings: {} } })
    await expect(runSync(foreign, { output: output(), slug: 'camp', apply: true })).rejects.toBeInstanceOf(ImportAbort)
    await expect(runSync(fakeClient({ campaign: { id: CID, created_by: DM, settings: {} } }), { output: output(), slug: 'camp', apply: true })).rejects.toMatchObject({ code: 'campaign_not_ours' })
  })

  it('an unknown COMMIT outcome is reported as such and is not rolled back', async () => {
    const c = fakeClient({ failCommit: true })
    const err = await runSync(c, { output: output(), slug: 'camp', apply: true }).catch((e) => e)
    expect(err.code).toBe('commit_outcome_unknown')
    expect(texts(c)).not.toContain('rollback')
  })

  it('never puts note text or ids of users in the console summary or the report', async () => {
    const c = fakeClient()
    const res = await runSync(c, { output: output(), slug: 'camp', apply: false })
    const summary = formatSyncSummary(res.db, false).join('\n')
    expect(summary).toContain('PJ 1:')
    expect(summary).toContain('PJ 2 (invite live)')
    for (const leak of [SENTINEL, OWNER_1, 'Borin', 'Beto']) expect(summary).not.toContain(leak)
    const report = JSON.stringify(buildSyncReport({ importReport: { ok: true }, args: { apply: false }, target: { remote: false, host: '127.0.0.1' }, result: res }))
    for (const leak of [SENTINEL, OWNER_1]) expect(report).not.toContain(leak)
  })

  it('accounting per character: alreadyPresent = planned - inserted, for notes and availability (R3-003)', async () => {
    const out = output()
    out.deferred.byPj[1].playerNotes = [{ entity_type: 'lugares', entity_id: 1, text: 'a' }, { entity_type: 'pnjs', entity_id: 1, text: 'b' }, { entity_type: 'lore', entity_id: 1, text: 'c' }]
    out.deferred.byPj[1].availability = [
      { tipo: 'personal', fecha_inicio: '2026-02-03', fecha_fin: '2026-02-04' },
      { tipo: 'no_disponible', fecha: '2026-02-05' },
    ]
    const res = await runSync(fakeClient({ rowCounts: { player_notes: 1, player_availability: 0 } }), { output: out, slug: 'camp', apply: false })
    const pj = res.db.perPj[1]
    expect(pj.playerNotes).toEqual({ planned: 3, written: 1, alreadyPresent: 2 })
    expect(pj.availability).toEqual({ planned: 2, written: 0, alreadyPresent: 2 })
    expect(res.db.totals).toMatchObject({ player_notes: 1, player_availability: 0 })
  })

  it('unclaimed list comes from the plan; a character the export never had is flagged hubOnly and not reported as skipped data (R2-001)', async () => {
    const out = output()
    out.tables.pjs = [{ id: 1 }] // character 2 exists only in the hub
    const res = await runSync(fakeClient(), { output: out, slug: 'camp', apply: false })
    expect(res.db.unclaimed).toEqual([{ pjId: 2, nombre: 'Borin', jugador: 'Beto', hubOnly: true, invite: 'live' }])
    expect(formatSyncSummary(res.db, false).join('\n')).not.toContain('Still unclaimed')
  })
})

describe('--redact-names (R1-001)', () => {
  const base = ['--sync-claims', '--input', 'export.json', '--slug', 'mi-campana']
  it('parses, defaults off, and is refused outside --sync-claims', () => {
    expect(parseCliArgs(base).redactNames).toBe(false)
    expect(parseCliArgs([...base, '--redact-names']).redactNames).toBe(true)
    expect(() => parseCliArgs(['--input', 'f.json', '--dm-email', 'a@b.test', '--app-origin', 'https://x.test', '--redact-names'])).toThrow(/only applies to --sync-claims/)
  })

  it('the report file lists names by default and omits jugador/nombre when redacted', async () => {
    const res = await runSync(fakeClient(), { output: output(), slug: 'camp', apply: false })
    const make = (redactNames) => JSON.stringify(buildSyncReport({ importReport: { ok: true }, args: { apply: false, redactNames }, target: { remote: false, host: '127.0.0.1' }, result: res }))
    expect(make(false)).toContain('Borin')
    const redacted = make(true)
    for (const name of ['Borin', 'Beto', 'nombre', 'jugador']) expect(redacted).not.toContain(name)
    expect(JSON.parse(redacted).sync.unclaimed).toEqual([{ pjId: 2, hubOnly: false, invite: 'live' }])
  })
})
