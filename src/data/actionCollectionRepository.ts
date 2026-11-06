import { ACTION_COLUMNS, ACTION_LINK_COLUMNS, ACTION_WRITE_COLUMNS, join } from './columns'
import { ConflictError, DataError, unwrap, unwrapWrite } from './errors'
import { fromTable } from './loose'
import { pagedList } from './pagedList'
import type { Db } from './types'
import { throwZeroRows } from './zeroRows'

/** One entry of the shared action collection of a campaign (S35, S36). */
export interface CampaignAction {
  id: number
  campaign_id: string
  /** Key of the Habilidad table of the campaign sheet the entry belongs to. */
  table_key: string
  /** A key of that table's categories when it declares them, free text otherwise. */
  category: string
  name: string
  description: string
  /** Values of the entry-scope columns of the table, keyed by column key. */
  extras: Record<string, unknown>
  /** The only character that may link the entry (null = shared). */
  private_to_pj: number | null
  /** Session function (S22); its content is validated by the session feature. */
  function: unknown
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ActionInput {
  table_key: string
  category: string
  name: string
  description?: string
  extras?: Record<string, unknown>
  private_to_pj?: number | null
  function?: unknown
}
export type ActionPatch = Partial<ActionInput>

/** A character linking an entry; `state` holds the character-scope column values of that character only. */
export interface PjActionLink {
  pj_id: number
  action_id: number
  campaign_id: string
  state: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface LinkedAction {
  action: CampaignAction
  link: PjActionLink
}

export interface LinkStateOptions {
  /** The link the caller edited: ONLY its `updated_at` is used, as the optimistic version (ConflictError when stale). */
  base?: Pick<PjActionLink, 'updated_at'>
}

const ACTION_SELECT = join(ACTION_COLUMNS)
const LINK_SELECT = join(ACTION_LINK_COLUMNS)
const WRITABLE = new Set<string>(ACTION_WRITE_COLUMNS)
const MAX_GUARDED_ATTEMPTS = 3
const IN_CHUNK = 200

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const invalid = (message: string) => new DataError('validation', message)

/** Validates the writable keys of an entry payload; nothing the server would silently ignore is accepted. */
function checkPayload(payload: Record<string, unknown>, requireAll: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue
    if (!WRITABLE.has(key)) throw invalid(`campaign_actions: ${key} cannot be written`)
    out[key] = value
  }
  if ('name' in out) {
    if (typeof out.name !== 'string' || out.name.trim() === '') throw invalid('campaign_actions: name is required')
    out.name = out.name.trim()
  } else if (requireAll) throw invalid('campaign_actions: name is required')
  if ('table_key' in out && (typeof out.table_key !== 'string' || out.table_key === '')) throw invalid('campaign_actions: table_key is required')
  if (requireAll && !('table_key' in out)) throw invalid('campaign_actions: table_key is required')
  if ('extras' in out && !isPlainObject(out.extras)) throw invalid('campaign_actions: extras must be an object')
  if (Object.keys(out).length === 0) throw invalid('campaign_actions: nothing to update')
  return out
}

/**
 * The shared action collection of a campaign (S35-S37): entries (`campaign_actions`, DM content) and the links of characters
 * to them with their own state (`pj_action_links`). RLS decides what each caller sees: the DM everything, a player the entries
 * linked to their characters plus those private to them. Only the DM creates, edits, links and removes; a player can only call
 * `updateLinkState` (character-scope columns of a player-editable table). Failures are DataErrors; the server's stable reasons
 * (action_not_in_sheet, invalid_action_category, invalid_action_extras, action_private_to_other_character, invalid_link_state:
 * kind 'validation'; link_state_not_writable: kind 'permission') arrive in `reason`.
 */
export function createActionCollectionRepository(client: Db) {
  async function readLink(pjId: number, actionId: number, columns: string): Promise<Record<string, unknown> | null> {
    return unwrap<Record<string, unknown> | null>(
      await fromTable(client, 'pj_action_links').select(columns).eq('pj_id', pjId).eq('action_id', actionId).maybeSingle(),
    )
  }

  return {
    /** What the caller may see: every entry for the DM; for a player the entries linked to their characters and their private ones. */
    listActions(campaignId: string): Promise<CampaignAction[]> {
      return pagedList<CampaignAction>(
        () => fromTable(client, 'campaign_actions').select(ACTION_SELECT).eq('campaign_id', campaignId).order('id', { ascending: true }),
        'campaign_actions',
      )
    },

    /** Every link of the campaign the caller may see (the DM: all; a player: those of their characters). */
    listLinks(campaignId: string): Promise<PjActionLink[]> {
      return pagedList<PjActionLink>(
        () =>
          fromTable(client, 'pj_action_links')
            .select(LINK_SELECT)
            .eq('campaign_id', campaignId)
            .order('pj_id', { ascending: true })
            .order('action_id', { ascending: true }),
        'pj_action_links',
      )
    },

    /**
     * The entries one character links, with that character's state, sorted by table, category and name. A link whose entry
     * cannot be read is skipped (nothing to draw).
     */
    async listLinkedActions(pjId: number): Promise<LinkedAction[]> {
      const links = await pagedList<PjActionLink>(
        () => fromTable(client, 'pj_action_links').select(LINK_SELECT).eq('pj_id', pjId).order('action_id', { ascending: true }),
        'pj_action_links',
      )
      if (links.length === 0) return []
      const actions: CampaignAction[] = []
      // the ids travel in the URL: chunk them so a character with many links never exceeds its length limit
      for (let from = 0; from < links.length; from += IN_CHUNK) {
        const ids = links.slice(from, from + IN_CHUNK).map((l) => l.action_id)
        actions.push(
          ...(await pagedList<CampaignAction>(
            () => fromTable(client, 'campaign_actions').select(ACTION_SELECT).in('id', ids).order('id', { ascending: true }),
            'campaign_actions',
          )),
        )
      }
      const byId = new Map(actions.map((a) => [a.id, a]))
      return links
        .flatMap((link) => {
          const action = byId.get(link.action_id)
          return action ? [{ action, link }] : []
        })
        .sort(
          (a, b) =>
            a.action.table_key.localeCompare(b.action.table_key) ||
            a.action.category.localeCompare(b.action.category) ||
            a.action.name.localeCompare(b.action.name) ||
            a.action.id - b.action.id,
        )
    },

    /** DM only. */
    async createAction(campaignId: string, input: ActionInput): Promise<CampaignAction> {
      const payload = checkPayload({ ...input }, true)
      const row = {
        campaign_id: campaignId,
        table_key: payload.table_key,
        category: payload.category ?? '',
        name: payload.name,
        description: payload.description ?? '',
        extras: payload.extras ?? {},
        private_to_pj: payload.private_to_pj ?? null,
        function: payload.function ?? null,
      }
      return unwrapWrite<CampaignAction>(await fromTable(client, 'campaign_actions').insert(row).select(ACTION_SELECT).single())
    },

    /** DM only. Sends only the provided columns; `null` clears `function` and `private_to_pj`. */
    async updateAction(id: number, patch: ActionPatch): Promise<CampaignAction> {
      const columns = checkPayload({ ...patch }, false)
      const row = unwrap<CampaignAction | null>(
        await fromTable(client, 'campaign_actions').update(columns).eq('id', id).select(ACTION_SELECT).maybeSingle(),
      )
      return row ?? throwZeroRows(client, 'campaign_actions', { id }, `campaign_actions/${id}`)
    },

    /** DM only. Its links go with it. */
    async removeAction(id: number): Promise<void> {
      const rows = unwrap<unknown[]>(await fromTable(client, 'campaign_actions').delete().eq('id', id).select('id'))
      if (rows.length === 0) await throwZeroRows(client, 'campaign_actions', { id }, `campaign_actions/${id}`)
    },

    /** DM only. The character and the entry must belong to the campaign (foreign keys); a private entry only links to its character. */
    async link(campaignId: string, pjId: number, actionId: number, state: Record<string, unknown> = {}): Promise<PjActionLink> {
      return unwrapWrite<PjActionLink>(
        await fromTable(client, 'pj_action_links')
          .insert({ campaign_id: campaignId, pj_id: pjId, action_id: actionId, state })
          .select(LINK_SELECT)
          .single(),
      )
    },

    /** DM only. */
    async unlink(pjId: number, actionId: number): Promise<void> {
      const rows = unwrap<unknown[]>(
        await fromTable(client, 'pj_action_links').delete().eq('pj_id', pjId).eq('action_id', actionId).select('pj_id'),
      )
      if (rows.length === 0) await throwZeroRows(client, 'pj_action_links', { pj_id: pjId, action_id: actionId }, `pj_action_links/${pjId}/${actionId}`)
    },

    /**
     * Writes keys of a link's state (DM, or the owner of the character on a player-editable table). The state can only be replaced as
     * a whole, so the CURRENT server state is read, the patch is shallow-merged onto it and written guarded by `updated_at`: a
     * concurrent edit is a retry (no `base`) or a ConflictError (with `base`), never a silent loss. A key set to `null` clears the
     * value; `undefined` keys are ignored.
     */
    async updateLinkState(pjId: number, actionId: number, patch: Record<string, unknown>, options: LinkStateOptions = {}): Promise<PjActionLink> {
      if (!isPlainObject(patch)) throw invalid('pj_action_links: the state patch must be an object')
      const changes = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined))
      if (Object.keys(changes).length === 0) throw invalid('pj_action_links: nothing to update')
      const callerVersion = typeof options.base?.updated_at === 'string' ? options.base.updated_at : null
      const what = `pj_action_links/${pjId}/${actionId}`

      for (let attempt = 0; attempt < MAX_GUARDED_ATTEMPTS; attempt++) {
        const server = await readLink(pjId, actionId, 'updated_at, state')
        if (!server) throw new DataError('not_found', `${what}: not found (missing or not visible)`)
        const version = server.updated_at as string
        const guard = attempt === 0 && callerVersion ? callerVersion : version
        if (guard !== version) throw new ConflictError()

        const stored = isPlainObject(server.state) ? server.state : {}
        const row = unwrap<PjActionLink | null>(
          await fromTable(client, 'pj_action_links')
            .update({ state: { ...stored, ...changes } })
            .eq('pj_id', pjId)
            .eq('action_id', actionId)
            .eq('updated_at', guard)
            .select(LINK_SELECT)
            .maybeSingle(),
        )
        if (row) return row

        const after = await readLink(pjId, actionId, 'updated_at')
        if (!after) throw new DataError('not_found', `${what}: not found (missing or not visible)`)
        if (after.updated_at === guard) throw new DataError('permission', `${what}: update affected no rows (not permitted)`)
        if (callerVersion) throw new ConflictError()
      }
      throw new ConflictError()
    },
  }
}

export type ActionCollectionRepository = ReturnType<typeof createActionCollectionRepository>
