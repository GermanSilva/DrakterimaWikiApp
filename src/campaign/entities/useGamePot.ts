import { useMemo } from 'react'
import type { GamePot } from '../../data'
import { useCampaignServices } from './campaignServicesContext'
import { useStoreTables, type TableSnapshot } from './tableStore'

export interface UseGamePotResult extends Omit<TableSnapshot<GamePot>, 'items'> {
  /** The campaign pot, or null while loading / before the first prize. */
  pot: GamePot | null
}

/** Realtime coin pot of the campaign (a single row). Players and the DM read it; only the DM writes. */
export function useGamePot(options: { enabled?: boolean } = {}): UseGamePotResult {
  const { store } = useCampaignServices()
  const specs = useMemo(() => [store.gamePotSpec()], [store])
  const { items, ...rest } = useStoreTables(store, specs, options.enabled ?? true)[0]
  return { ...rest, pot: items[0] ?? null }
}
