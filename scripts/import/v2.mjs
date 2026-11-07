// D&D 5e preset v2 shape for imported characters (G10c, S9, S17, S36, S39). The importer reads the legacy flat shape; when the
// target campaign carries the v2 preset sheet (every new campaign does) the characters are written the way
// supabase/migrations/20261107120000_dnd5e_v2_data.sql leaves migrated ones: skills as option keys, hit dice and spell slots as the
// new fields, recursos recuperacion as largo/corto, campaign custom fields as paragraph fields of the sheet, spells as collection
// entries + links (S39). Pure planning here (no IO besides the three statements of the writer); counts and codes only in the report.
//
// `jugador` is deliberately left as the legacy text: the claim-invite CSV needs it, and assigning the character to its player
// (pjs.owner_id) replaces it with the display name (pjs_enforce_jugador, S33).
import { migrateDnd5eV2 } from '../../src/campaign/system/sheet/migration/migrateDnd5eV2.ts'

const itemKeys = (sheet) =>
  (Array.isArray(sheet?.categories) ? sheet.categories : []).flatMap((c) =>
    (Array.isArray(c?.sections) ? c.sections : []).flatMap((s) => (Array.isArray(s?.items) ? s.items.map((i) => i?.key) : [])),
  )

/** The v2 preset is recognised by the fields v1 does not have. Anything else keeps the legacy shape. */
export function sheetIsV2(sheet) {
  const keys = new Set(itemKeys(sheet))
  return keys.has('dado_golpe') && keys.has('dados_disponibles') && keys.has('espacios_conjuro') && keys.has('hechizos')
}

/**
 * @param {{ sheet: object|null|undefined, customFields: unknown, pjRows: object[], existingActions?: object[] }} input
 * @returns {{ applied: false, reason: string } | { applied: true, rows: object[], sheet: object, sheetChanged: boolean, actions: object[], links: object[], report: object }}
 */
export function planV2({ sheet, customFields, pjRows, existingActions = [] }) {
  if (!sheet || typeof sheet !== 'object') return { applied: false, reason: 'no_sheet' }
  if (!sheetIsV2(sheet)) return { applied: false, reason: 'sheet_not_v2' }
  const out = migrateDnd5eV2({
    campaign: { sheet, character_custom_fields: customFields, existing_actions: existingActions },
    pjs: pjRows.map((r) => ({ id: Number(r.id), nivel: typeof r.nivel === 'number' ? r.nivel : null, owner_display_name: null, jugador: r.jugador ?? '', data: r.data ?? {} })),
  })
  const byId = new Map(out.pjs.map((p) => [p.id, p]))
  const rows = pjRows.map((r) => ({ ...r, data: byId.get(Number(r.id))?.newData ?? r.data }))
  const sheetChanged = JSON.stringify(out.sheet) !== JSON.stringify(sheet)
  return { applied: true, rows, sheet: out.sheet, sheetChanged, actions: out.actions, links: out.links, report: out.report }
}

/** Counts and warning codes (with how many times each): nothing that comes from the data. */
export function summariseV2(plan) {
  if (!plan.applied) return { applied: false, reason: plan.reason }
  const warnings = {}
  for (const w of plan.report.warnings) warnings[w.code] = (warnings[w.code] ?? 0) + 1
  return { applied: true, sheetChanged: plan.sheetChanged, counts: plan.report.counts, warnings }
}

export function formatV2(summary) {
  if (!summary?.applied) return summary ? `dnd5e v2 data: not applied (${summary.reason}); characters keep the legacy shape` : null
  const c = summary.counts
  const warn = Object.entries(summary.warnings).map(([code, n]) => `${code}=${n}`).join(' ')
  return `dnd5e v2 data: ${c.pjs_changed}/${c.pjs} characters migrated, ${c.entries_shared} shared + ${c.entries_private} private entries, ${c.links} links${warn ? `; warnings: ${warn}` : ''}`
}

const ACTION_SQL =
  'insert into public.campaign_actions (campaign_id, table_key, category, name, description, extras, private_to_pj) ' +
  'values ($1::uuid, $2, $3, $4, $5, $6::jsonb, $7::bigint) on conflict do nothing'

const LINK_SQL =
  'insert into public.pj_action_links (pj_id, action_id, campaign_id, state) ' +
  'select $1::bigint, a.id, $2::uuid, $3::jsonb from public.campaign_actions a ' +
  'where a.campaign_id = $2::uuid and a.table_key = $4 and a.category = $5 and lower(btrim(a.name)) = lower($6) and coalesce(a.private_to_pj, 0) = $7::bigint ' +
  'on conflict do nothing'

/** What the writer needs from the database before the characters are written: the stored sheet and the entries that exist. */
export async function readV2Context(client, campaignId) {
  const sheet = (await client.query('select system_profile -> \'sheet\' as sheet, character_custom_fields from public.campaigns where id = $1', [campaignId])).rows[0]
  if (!sheet?.sheet || !sheetIsV2(sheet.sheet)) return { sheet: sheet?.sheet ?? null, customFields: sheet?.character_custom_fields ?? [], existingActions: [] }
  const existing = (await client.query("select category, name, private_to_pj from public.campaign_actions where campaign_id = $1 and table_key = 'hechizos'", [campaignId])).rows
  return { sheet: sheet.sheet, customFields: sheet.character_custom_fields ?? [], existingActions: existing }
}

export async function writeSheetV2(client, campaignId, plan) {
  if (!plan.applied || !plan.sheetChanged) return
  await client.query("update public.campaigns set system_profile = jsonb_set(system_profile, '{sheet}', $1::jsonb) where id = $2::uuid", [JSON.stringify(plan.sheet), campaignId])
}

/** Entries then links, after the characters exist. Returns the rows written. */
export async function writeCollectionV2(client, campaignId, plan) {
  const written = { campaign_actions: 0, pj_action_links: 0 }
  if (!plan.applied) return written
  for (const a of plan.actions) {
    const res = await client.query(ACTION_SQL, [campaignId, a.table_key, a.category, a.name, a.description, JSON.stringify(a.extras), a.private_to_pj])
    written.campaign_actions += res.rowCount
  }
  for (const l of plan.links) {
    const res = await client.query(LINK_SQL, [l.pj_id, campaignId, JSON.stringify(l.state), l.action.table_key, l.action.category, l.action.name, l.action.private_to_pj ?? 0])
    written.pj_action_links += res.rowCount
  }
  return written
}
