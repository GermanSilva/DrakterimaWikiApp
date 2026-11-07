import { describe, expect, it } from 'vitest'
import { presetSheetV2 } from '../migrate/dryRunDnd5eV2.mjs'
import { buildImport } from './index.mjs'
import { runImport } from './load.mjs'
import { formatV2, planV2, sheetIsV2, summariseV2, writeCollectionV2 } from './v2.mjs'
import { SENTINEL_TEXT, makeLegacy } from './fixture.mjs'

const CAMPAIGN = '11111111-2222-4333-8444-555555555555'
const V2 = presetSheetV2()

const legacyPj = (id, extra = {}) => ({ id, nombre: `PJ ${id}`, jugador: 'Texto libre', nivel: 2, data: {}, ...extra })

describe('planV2 (importer writes the v2 shape)', () => {
  it('migrates the characters the importer would write and keeps jugador (the claim CSV needs it)', () => {
    const plan = planV2({
      sheet: V2,
      customFields: [{ key: 'magralita', label: 'Magralita', type: 'text' }],
      pjRows: [legacyPj(1, { data: { skill_arcana: 1, stat_hit_dice: '1d8 (1/2)', spell_slots: { 1: 2 }, hechizos: [{ nombre: 'Luz', nivel: 0, preparado: true }], custom_fields: { magralita: 'x' } } })],
    })
    expect(plan.applied).toBe(true)
    expect(plan.rows[0].jugador).toBe('Texto libre')
    expect(plan.rows[0].data).toMatchObject({ skill_arcana: 'competente', dado_golpe: '1d8', dados_disponibles: 1, magralita: 'x' })
    expect(plan.rows[0].data.hechizos).toBeUndefined()
    expect(plan.actions).toHaveLength(1)
    expect(plan.links).toEqual([{ pj_id: 1, action: { table_key: 'hechizos', category: 'trucos', name: 'Luz', private_to_pj: null }, state: { preparado: true } }])
    expect(plan.sheetChanged).toBe(true)
  })

  it('keeps the legacy shape when the campaign sheet is not the v2 preset', () => {
    expect(planV2({ sheet: { categories: [] }, customFields: [], pjRows: [legacyPj(1)] })).toEqual({ applied: false, reason: 'sheet_not_v2' })
    expect(planV2({ sheet: null, customFields: [], pjRows: [] })).toEqual({ applied: false, reason: 'no_sheet' })
    expect(sheetIsV2(V2)).toBe(true)
  })

  it('links to entries that already exist instead of creating them', () => {
    const plan = planV2({
      sheet: V2,
      customFields: [],
      pjRows: [legacyPj(1, { data: { hechizos: [{ nombre: 'Luz', nivel: 0 }] } })],
      existingActions: [{ category: 'trucos', name: 'Luz', private_to_pj: null }],
    })
    expect(plan.actions).toEqual([])
    expect(plan.links).toHaveLength(1)
  })

  it('summary and text hold counts and codes only', () => {
    const plan = planV2({ sheet: V2, customFields: [], pjRows: [legacyPj(1, { data: { stat_hit_dice: 'texto privado raro', skill_arcana: 9 } })] })
    const summary = summariseV2(plan)
    expect(summary.warnings).toEqual({ hit_dice_unparsed: 1, skill_value_unknown: 1 })
    expect(JSON.stringify(summary) + formatV2(summary)).not.toContain('privado')
    expect(formatV2(summariseV2({ applied: false, reason: 'sheet_not_v2' }))).toContain('legacy shape')
  })
})

describe('the writer', () => {
  it('inserts entries (idempotently) and then their links, with typed parameters', async () => {
    const log = []
    const client = { query: async (text, values) => (log.push({ text, values }), { rows: [], rowCount: 1 }) }
    const plan = planV2({
      sheet: V2,
      customFields: [],
      pjRows: [legacyPj(1, { data: { hechizos: [{ nombre: 'Bola', nivel: 3, descripcion: 'a' }] } }), legacyPj(2, { data: { hechizos: [{ nombre: 'Bola', nivel: 3, descripcion: 'b' }] } })],
    })
    const written = await writeCollectionV2(client, CAMPAIGN, plan)
    expect(written).toEqual({ campaign_actions: 2, pj_action_links: 2 })
    expect(log.map((q) => q.text.split(' ').slice(0, 3).join(' '))).toEqual(['insert into public.campaign_actions', 'insert into public.campaign_actions', 'insert into public.pj_action_links', 'insert into public.pj_action_links'])
    for (const q of log) expect(q.text).toContain('on conflict do nothing')
    expect(log[0].values.slice(1)).toEqual(['hechizos', 'nivel_3', 'Bola', 'a', '{}', 1])
    expect(log[2].values).toEqual([1, CAMPAIGN, '{"preparado":false}', 'hechizos', 'nivel_3', 'Bola', 1])
  })

  it('writes nothing when the plan was not applied', async () => {
    const client = { query: async () => { throw new Error('no query expected') } }
    expect(await writeCollectionV2(client, CAMPAIGN, { applied: false, reason: 'sheet_not_v2' })).toEqual({ campaign_actions: 0, pj_action_links: 0 })
  })
})

/** Scripted pg client like load.test.mjs, plus the three v2 reads. */
function fakeClient({ sheet = V2, customFields = [] } = {}) {
  const log = []
  return {
    log,
    async query(text, values = []) {
      const t = typeof text === 'string' ? text : text.text
      log.push({ text: t, values })
      if (/insert into auth\.users/.test(t) || /insert into public\.campaigns/.test(t)) return { rows: [{ id: CAMPAIGN }], rowCount: 1 }
      if (/from public\.campaigns where slug/.test(t)) return { rows: [], rowCount: 0 }
      if (/system_profile -> 'sheet' as sheet/.test(t)) return { rows: [{ sheet, character_custom_fields: customFields }], rowCount: 1 }
      if (/from public\.campaign_actions where campaign_id/.test(t)) return { rows: [], rowCount: 0 }
      if (/from pg_sequences s where/.test(t)) return { rows: [{ last_value: '1', max_id: '1' }], rowCount: 1 }
      if (/select count\(\*\)::int as n/.test(t)) return { rows: [{ n: 0 }], rowCount: 1 }
      if (/insert into public\.campaign_invites/.test(t)) return { rows: [{ code: 'CODE', expires_at: '2030-01-01' }], rowCount: 1 }
      // an upsert of N rows reports N rows written (upsertOwned compares)
      if (/^insert into public\."[a-z_]+"/.test(t) && /on conflict/.test(t)) return { rows: [], rowCount: t.split('), (').length }
      return { rows: [], rowCount: 1 }
    },
  }
}

const importOutput = (extra) => {
  const legacy = makeLegacy()
  legacy.pjs[0] = { ...legacy.pjs[0], ...extra }
  const built = buildImport(JSON.stringify(legacy), { mode: 'lenient', allowPartial: true })
  expect(built.ok).toBe(true)
  return built.output
}
const opts = (output) => ({ output, slug: 'camp', name: 'Camp', dmEmail: 'dm@x.test', dmUserId: 'dm-1', apply: false, inviteDays: 30, forceOverwrite: false })

describe('runImport with the v2 preset', () => {
  it('upserts the characters in the v2 shape, then entries and links, and reports counts', async () => {
    const out = importOutput({ skill_arcana: 2, stat_hit_dice: '1d8 (1/5)', hechizos: [{ id: 1, nombre: 'Bola', nivel: 3, preparado: true }] })
    const client = fakeClient({ customFields: out.campaign.character_custom_fields })
    const res = await runImport(client, opts(out))
    const statements = client.log.map((q) => q.text)
    const pjsInsert = client.log.find((q) => /^insert into public\."pjs"/.test(q.text))
    expect(pjsInsert.values.filter((v) => typeof v === 'string').join('|')).toContain('"skill_arcana":"experto"')
    expect(pjsInsert.values.filter((v) => typeof v === 'string').join('|')).not.toContain('hechizos')
    expect(statements.findIndex((s) => /insert into public\.campaign_actions/.test(s))).toBeGreaterThan(statements.findIndex((s) => /^insert into public\."pjs"/.test(s)))
    expect(statements.findIndex((s) => /insert into public\.pj_action_links/.test(s))).toBeGreaterThan(statements.findIndex((s) => /insert into public\.campaign_actions/.test(s)))
    expect(statements.some((s) => /update public\.campaigns set system_profile/.test(s))).toBe(true)
    expect(res.db.written).toMatchObject({ campaign_actions: 1, pj_action_links: 1 })
    expect(res.db.v2).toMatchObject({ applied: true, sheetChanged: true })
  })

  it('leaves the legacy shape (and writes no entries) when the campaign sheet is not v2', async () => {
    const out = importOutput({ skill_arcana: 2, hechizos: [{ nombre: 'Bola', nivel: 3 }] })
    const client = fakeClient({ sheet: { categories: [] } })
    const res = await runImport(client, opts(out))
    const pjsInsert = client.log.find((q) => /^insert into public\."pjs"/.test(q.text))
    expect(pjsInsert.values.filter((v) => typeof v === 'string').join('|')).toContain('"skill_arcana":2')
    expect(client.log.some((q) => /campaign_actions|pj_action_links/.test(q.text) && /^insert/.test(q.text))).toBe(false)
    expect(res.db.v2).toEqual({ applied: false, reason: 'sheet_not_v2' })
    expect(res.db.written.campaign_actions).toBeUndefined()
  })

  it('never puts row text in the v2 summary', async () => {
    const out = importOutput({ stat_hit_dice: SENTINEL_TEXT, hechizos: [{ nombre: SENTINEL_TEXT, nivel: 3 }] })
    const res = await runImport(fakeClient(), opts(out))
    expect(JSON.stringify(res.db.v2)).not.toContain(SENTINEL_TEXT)
  })
})
