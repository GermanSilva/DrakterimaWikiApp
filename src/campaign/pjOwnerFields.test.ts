import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { OWNER_COLUMNS, OWNER_DATA_KEYS, OWNER_META_COLUMNS, STAMPABLE_SECTIONS, isOwnerEditable, pickOwnerPatch } from './pjOwnerFields'

const MIGRATIONS = resolve(__dirname, '../../supabase/migrations')

/** Every migration, in apply order (the timestamp prefix sorts). */
const migrations = () =>
  readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(resolve(MIGRATIONS, name), 'utf8') }))

const GUARD_DEFINITION = /create (?:or replace )?function public\.guard_pj_player_update/

/** The body of the LATEST definition of guard_pj_player_update (what the database actually runs). */
function latestGuard(): { name: string; body: string } {
  const defining = migrations().filter((m) => GUARD_DEFINITION.test(m.sql))
  if (defining.length === 0) throw new Error('no migration defines guard_pj_player_update')
  const last = defining[defining.length - 1]
  const start = last.sql.search(GUARD_DEFINITION)
  const next = last.sql.slice(start + 1).search(/create (?:or replace )?function /)
  return { name: last.name, body: next < 0 ? last.sql.slice(start) : last.sql.slice(start, start + 1 + next) }
}

/** The string list assigned to `<name> constant text[] := array[...]` in the latest guard. */
function guardList(name: 'allowed_columns' | 'allowed_data_keys' | 'stampable_sections'): string[] {
  const match = new RegExp(String.raw`${name} constant text\[\] := array\[([^\]]*)\]`).exec(latestGuard().body)
  if (!match) throw new Error(`${name} not found in the latest guard_pj_player_update`)
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
}

describe('owner-editable fields mirror guard_pj_player_update', () => {
  it('the allowed columns are the identity columns plus data / sections_updated / updated_at', () => {
    const sqlColumns = guardList('allowed_columns').filter((c) => c !== 'data' && c !== 'updated_at')
    expect([...OWNER_COLUMNS, ...OWNER_META_COLUMNS].sort()).toEqual(sqlColumns.sort())
  })

  it('the allowed data keys are exactly the ones of the migration', () => {
    expect([...OWNER_DATA_KEYS].sort()).toEqual(guardList('allowed_data_keys').sort())
  })
})

describe('latest guard_pj_player_update (all migrations scanned)', () => {
  it('is bound to pjs by the trigger, and the latest definition is the hardened one', () => {
    expect(migrations().some((m) => /create trigger pjs_guard_player_update[\s\S]*?on public\.pjs[\s\S]*?execute function public\.guard_pj_player_update/.test(m.sql))).toBe(true)
    const { name, body } = latestGuard()
    // the newest migration that defines the guard (found by scanning, no filename pinned) carries every hardening rule
    for (const needle of [
      'pg_column_size',
      "jsonb_typeof(cf) <> 'object'",
      'sections_updated must be a JSON object',
      'the dm section stamp cannot be changed',
      'stamp_ts > now()',
      'sections_updated contains an invalid date',
    ]) {
      expect(body, `${name} lacks "${needle}"`).toContain(needle)
    }
    // and no later migration drops the function or the trigger
    const later = migrations().filter((m) => m.name > name)
    expect(later.some((m) => /drop (function|trigger)[^;]*(guard_pj_player_update|pjs_guard_player_update)/i.test(m.sql))).toBe(false)
  })

  it('the stampable sections are exactly the sections of the client (SECTION_FIELDS minus dm, plus general)', () => {
    expect([...guardList('stampable_sections')].sort()).toEqual([...STAMPABLE_SECTIONS].sort())
    expect(STAMPABLE_SECTIONS).not.toContain('dm')
    expect(STAMPABLE_SECTIONS).toContain('general')
  })
})

describe('pickOwnerPatch', () => {
  it('keeps identity keys and drops everything else, including level, coins, state, ownership and DM data', () => {
    const hostile = {
      nombre: 'X',
      clase: 'Y',
      custom_fields: { a: 'b' },
      sections_updated: { general: 't' },
      nivel: 20,
      experiencia: 999,
      monedas: { gp: 1e9 },
      monedas_guardado: { gp: 1 },
      estado: 'publicado',
      owner_id: 'u',
      visible_to: [1],
      visibilidad: [1],
      notas: 'dm',
      secreto: 'dm',
      ganchos: 'dm',
      stat_hp: 999,
      hechizos: [],
      id: 5,
      campaign_id: 'other',
    }
    expect(Object.keys(pickOwnerPatch(hostile)).sort()).toEqual(['clase', 'custom_fields', 'nombre', 'sections_updated'])
  })

  it('isOwnerEditable is an own-key allowlist (prototype names are not editable)', () => {
    expect(isOwnerEditable('nombre')).toBe(true)
    for (const key of ['nivel', 'constructor', 'toString', '__proto__', 'hasOwnProperty', '']) expect(isOwnerEditable(key)).toBe(false)
  })
})
