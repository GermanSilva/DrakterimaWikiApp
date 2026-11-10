import type { DmNotesRow, PlayerNote } from '../../data'
import { useCampaign } from '../CampaignContext'
import { useCampaignMembers } from '../entities/useCampaignMembers'
import { useCampaignServices } from '../entities/campaignServicesContext'
import { useDisponibilidad } from '../entities/useDisponibilidad'
import { useEntities } from '../entities/useEntities'
import { useLoad, type LoadState } from '../entities/useLoad'
import { usePlayerAvailability } from '../entities/usePlayerAvailability'

export type SourceStatus = 'loading' | 'error' | 'ready'

interface Part {
  loading: boolean
  error: unknown
}

/** One status for several sources: any error wins, then any loading. */
export function statusOf(...parts: Part[]): SourceStatus {
  if (parts.some((p) => p.error)) return 'error'
  return parts.some((p) => p.loading) ? 'loading' : 'ready'
}

interface Loaded<T> extends Part {
  data: T[]
}

const loaded = <T>(state: LoadState<T[]>): Loaded<T> => ({ data: state.data ?? [], loading: state.status === 'loading', error: state.error })

/** Everything the panel reads, each source subscribed once (the entity tables share their realtime channels). */
export function useDashboardSources() {
  const { isDM } = useCampaign()
  const { layer, campaignId } = useCampaignServices()
  const tables = {
    sesiones: useEntities('sesiones'),
    pjs: useEntities('pjs'),
    pnjs: useEntities('pnjs'),
    lugares: useEntities('lugares'),
    facciones: useEntities('facciones'),
    lore: useEntities('lore'),
    items: useEntities('items'),
  }
  const slots = useDisponibilidad()
  const availability = usePlayerAvailability()
  const members = useCampaignMembers()
  // players receive only their own notes, the DM everyone's (RLS)
  const notes = useLoad<PlayerNote[]>(() => layer.playerNotes.list(campaignId), `player-notes:${campaignId}`)
  // the DM's private hooks: never requested for a player
  const hooks = useLoad<DmNotesRow[]>(isDM ? () => layer.dmNotes.list(campaignId) : null, `dm-hooks:${campaignId}`)
  return { tables, slots, availability, members: loaded(members), notes: loaded(notes), hooks: loaded(hooks) }
}

export type DashboardSources = ReturnType<typeof useDashboardSources>
