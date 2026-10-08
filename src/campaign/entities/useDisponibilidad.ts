import { useMemo } from 'react'
import type { Disponibilidad } from '../../data'
import { useCampaignServices } from './campaignServicesContext'
import { useStoreTables, type TableSnapshot } from './tableStore'

export interface UseDisponibilidadOptions {
  /** False = do not subscribe. */
  enabled?: boolean
}

/**
 * Realtime list of the campaign's availability rows (id order). All callers share ONE channel; RLS
 * decides what each member receives, nothing is filtered here.
 */
export function useDisponibilidad(options: UseDisponibilidadOptions = {}): TableSnapshot<Disponibilidad> {
  const { store } = useCampaignServices()
  const specs = useMemo(() => [store.disponibilidadSpec()], [store])
  return useStoreTables(store, specs, options.enabled ?? true)[0]
}
