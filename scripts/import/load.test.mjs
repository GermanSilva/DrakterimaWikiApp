import { describe, expect, it } from 'vitest'
import { ImportAbort, commitOrRollback, runImport } from './load.mjs'

const CAMPAIGN = '11111111-2222-4333-8444-555555555555'
const OTHER = '99999999-2222-4333-8444-555555555555'

/** Minimal scripted `pg` client: records every statement and answers just enough for runImport. No database. */
function fakeClient({ failCommit = false, potOwner = CAMPAIGN, existingCampaign = false, stuckSequence = false } = {}) {
  const log = []
  let advanced = false
  return {
    log,
    async query(text, values = []) {
      log.push({ text, values })
      const t = typeof text === 'string' ? text : text.text
      if (t === 'commit' && failCommit) throw new Error('connection terminated')
      if (/insert into auth\.users/.test(t) || /insert into public\.campaigns/.test(t)) return { rows: [{ id: CAMPAIGN }], rowCount: 1 }
      if (/from public\.campaigns where slug/.test(t)) {
        return { rows: existingCampaign ? [{ id: CAMPAIGN, created_by: 'dm-1', settings: { import: { source: 'legacy-firestore' } } }] : [], rowCount: 0 }
      }
      if (/other_members/.test(t)) return { rows: [{ other_members: 0, owned_characters: 0, campaign_edited: false }], rowCount: 1 }
      if (/setval/.test(t)) {
        advanced = true
        return { rows: [{ value: '7' }], rowCount: 1 }
      }
      if (/from pg_sequences s where/.test(t)) return { rows: [{ last_value: advanced && !stuckSequence ? '7' : '5', max_id: '7' }], rowCount: 1 }
      if (/select count\(\*\)::int as n/.test(t)) return { rows: [{ n: 0 }], rowCount: 1 }
      if (/select campaign_id from public\."?game_pot"?/.test(t)) return { rows: [{ campaign_id: potOwner }], rowCount: 1 }
      if (/insert into public\."game_pot"/.test(t)) return { rows: [], rowCount: 0 } // do nothing: the pot already exists
      return { rows: [], rowCount: 0 }
    },
  }
}

const output = () => ({
  campaign: { system: 'dnd5e', branding: {}, regions: [], character_custom_fields: [] },
  tables: {},
  dmNotes: [],
  gameLogs: [],
  gamePot: null,
  campaignConfig: [],
  disponibilidad: [],
})
const opts = (over = {}) => ({ output: output(), slug: 'camp', name: 'Camp', dmEmail: 'dm@x.test', dmUserId: 'dm-1', apply: false, inviteDays: 30, forceOverwrite: false, ...over })
const texts = (client) => client.log.map((q) => (typeof q.text === 'string' ? q.text : q.text.text))

describe('sequences are never rewound (R1-002 / R4-001 / R3-002)', () => {
  it('a dry run does not touch any sequence and rolls back', async () => {
    const c = fakeClient()
    const res = await runImport(c, opts())
    expect(res.committed).toBe(false)
    expect(texts(c).some((t) => /setval/.test(t))).toBe(false)
    expect(texts(c).at(-1)).toBe('rollback')
    // informational only in a dry run: no `ok` verdict (it would be a tautology)
    expect(res.db.sequences.pjs).toEqual({ maxId: 7, nextValue: 8 })
  })

  it('an apply only advances (forward-only statement) and issues no restore afterwards', async () => {
    const c = fakeClient()
    const res = await runImport(c, opts({ apply: true }))
    expect(res.committed).toBe(true)
    const setvals = texts(c).filter((t) => /setval/.test(t))
    expect(setvals.length).toBeGreaterThan(0)
    for (const t of setvals) expect(t).toContain('greatest(')
    expect(texts(c).at(-1)).toBe('commit')
    expect(res.db.sequences.pjs).toMatchObject({ maxId: 7, ok: true }) // the real check lives in apply
  })

  it('an apply whose sequence is still behind max(id) aborts: the real check lives in apply, not in the dry run', async () => {
    const c = fakeClient({ stuckSequence: true })
    await expect(runImport(c, opts({ apply: true }))).rejects.toMatchObject({ code: 'sequence_behind' })
    expect(texts(c).at(-1)).toBe('rollback')
    // the dry run only reports the numbers: it never raises sequence_behind
    const dry = await runImport(fakeClient({ stuckSequence: true }), opts())
    expect(dry.committed).toBe(false)
  })

  it('a failed apply leaves the sequences alone (no setval after the failure)', async () => {
    const c = fakeClient({ existingCampaign: true })
    c.log.length = 0
    await expect(runImport(c, opts({ apply: true, dmUserId: 'someone-else' }))).rejects.toMatchObject({ code: 'campaign_not_ours' })
    const t = texts(c)
    expect(t.at(-1)).toBe('rollback')
    expect(t.some((x) => /setval/.test(x))).toBe(false)
  })

  it('an unknown COMMIT outcome is reported as such, never rolled back or restored', async () => {
    const c = fakeClient({ failCommit: true })
    const err = await runImport(c, opts({ apply: true })).catch((e) => e)
    expect(err).toBeInstanceOf(ImportAbort)
    expect(err.code).toBe('commit_outcome_unknown')
    expect(err.message).toMatch(/may have been applied/)
    expect(err.message).toMatch(/Sequences were left/)
    const t = texts(c)
    expect(t.at(-1)).toBe('commit')
    expect(t.filter((x) => x === 'rollback')).toHaveLength(0)
    expect(t.slice(t.indexOf('commit') + 1)).toEqual([])
  })

  it('commitOrRollback: rolls back a dry run, commits an apply', async () => {
    const a = fakeClient()
    expect(await commitOrRollback(a, false)).toBe(false)
    expect(texts(a)).toEqual(['rollback'])
    const b = fakeClient()
    expect(await commitOrRollback(b, true)).toBe(true)
    expect(texts(b)).toEqual(['commit'])
  })
})

describe('an upsert with an empty SET list (R2-001 / R3-001)', () => {
  it('--force-overwrite over an export without a pot does not raise id_conflict when the pot is ours', async () => {
    const c = fakeClient({ existingCampaign: true })
    const res = await runImport(c, opts({ forceOverwrite: true }))
    expect(res.committed).toBe(false)
    expect(texts(c).some((t) => /select campaign_id from public\."game_pot"/.test(t))).toBe(true)
  })

  it('still refuses when the row belongs to another campaign', async () => {
    const c = fakeClient({ existingCampaign: true, potOwner: OTHER })
    await expect(runImport(c, opts({ forceOverwrite: true }))).rejects.toMatchObject({ code: 'id_conflict' })
  })
})

describe('game log reporting (R2-002)', () => {
  it('reports the logs skipped as duplicates', async () => {
    const c = fakeClient()
    const out = output()
    out.gameLogs = [
      { actor_type: 'player', character_id: null, game: 'loteria', play_date: '2026-03-01', roll: 3, prize: {}, prize_target: 'player' },
      { actor_type: 'dm', character_id: null, game: 'loteria', play_date: '2026-03-02', roll: 4, prize: {}, prize_target: 'pot' },
    ]
    const res = await runImport(c, opts({ output: out }))
    expect(res.db.written.game_logs).toBe(0) // the fake inserts nothing
    expect(res.db.gameLogsSkipped).toBe(2)
  })
})
