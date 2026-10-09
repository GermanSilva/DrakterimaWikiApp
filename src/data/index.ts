import { createCampaignRepository } from './campaignRepository'
import type { EntityTable, WikiIndexTable } from './columns'
import { createConfigRepository } from './configRepository'
import { createDisponibilidadRepository } from './disponibilidadRepository'
import { createDmNotesRepository } from './dmNotesRepository'
import { createEntityRepository, type EntityRepository } from './entityRepository'
import { createGamesRepository } from './gamesRepository'
import { createPlayerAvailabilityRepository } from './playerAvailabilityRepository'
import { createPlayerNotesRepository } from './playerNotesRepository'
import { createPresenceRepository } from './presenceRepository'
import { createProfileRepository } from './profileRepository'
import { createReadStateRepository } from './readStateRepository'
import { saveEntityWithDmNotes, type SaveEntityTarget } from './saveEntityWithDmNotes'
import { getSupabase } from './supabaseClient'
import type { Db } from './types'
import { createVisibilityRepository } from './visibilityRepository'
import { createWikiIndexRepository, type WikiIndexRepository } from './wikiIndexRepository'

export * from './columns'
export * from './errors'
export * from './mappers'
export * from './realtime'
export * from './supabaseClient'
export * from './types'
export * from './useCampaignTable'
export * from './campaignRepository'
export * from './configRepository'
export * from './disponibilidadRepository'
export * from './dmNotesRepository'
export * from './entityRepository'
export * from './gamesRepository'
export * from './playerAvailabilityRepository'
export * from './playerNotesRepository'
export * from './presenceRepository'
export * from './profileRepository'
export * from './readStateRepository'
export * from './visibilityRepository'
export * from './saveEntityWithDmNotes'
export * from './wikiIndexRepository'

/** Every repository bound to one client (defaults to the shared one). */
export function createDataLayer(client: Db = getSupabase()) {
  const entityRepos = new Map<EntityTable, EntityRepository>()
  const wikiIndexRepos = new Map<WikiIndexTable, WikiIndexRepository>()
  const dmNotes = createDmNotesRepository(client)
  const entity = (table: EntityTable): EntityRepository => {
    let repo = entityRepos.get(table)
    if (!repo) {
      repo = createEntityRepository(client, table)
      entityRepos.set(table, repo)
    }
    return repo
  }
  const wikiIndex = (table: WikiIndexTable): WikiIndexRepository => {
    let repo = wikiIndexRepos.get(table)
    if (!repo) {
      repo = createWikiIndexRepository(client, table)
      wikiIndexRepos.set(table, repo)
    }
    return repo
  }
  return {
    client,
    entity,
    /** Lightweight id/title/image/estado listing of a wiki table (links, tooltips, picker). */
    wikiIndex,
    /** DM forms: entity row + DM-private fields (notas/secreto/ganchos), see saveEntityWithDmNotes. */
    saveEntityWithDmNotes: (table: EntityTable, target: SaveEntityTarget, flat: Record<string, unknown>) =>
      saveEntityWithDmNotes(entity(table), dmNotes, target, flat),
    campaigns: createCampaignRepository(client),
    profiles: createProfileRepository(client),
    visibility: createVisibilityRepository(client),
    dmNotes,
    playerNotes: createPlayerNotesRepository(client),
    readState: createReadStateRepository(client),
    disponibilidad: createDisponibilidadRepository(client),
    playerAvailability: createPlayerAvailabilityRepository(client),
    config: createConfigRepository(client),
    games: createGamesRepository(client),
    presence: createPresenceRepository(client),
  }
}

export type DataLayer = ReturnType<typeof createDataLayer>
