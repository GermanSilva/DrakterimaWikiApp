import { useMemo } from 'react'
import type { Disponibilidad, DisponibilidadInput } from '../../data'
import { useToast } from '../toastContext'
import { useCampaignServices } from './campaignServicesContext'
import { describeDataError } from './errorMessages'

export interface DisponibilidadActions {
  /** Resolves to the saved slot, or `null` after a toast. Never throws. */
  create(input: DisponibilidadInput): Promise<Disponibilidad | null>
  update(id: number, patch: DisponibilidadInput): Promise<Disponibilidad | null>
  /** Resolves true when deleted (or false after a toast). */
  remove(id: number): Promise<boolean>
}

/** DM-only writes of the campaign's session slots (the realtime list follows on its own). */
export function useDisponibilidadActions(): DisponibilidadActions {
  const { layer, campaignId } = useCampaignServices()
  const { showToast } = useToast()
  return useMemo<DisponibilidadActions>(() => {
    const fail = (e: unknown) => {
      console.error(e)
      showToast(describeDataError(e), 'error')
    }
    return {
      async create(input) {
        try {
          return await layer.disponibilidad.create(campaignId, input)
        } catch (e) {
          fail(e)
          return null
        }
      },
      async update(id, patch) {
        try {
          return await layer.disponibilidad.update(id, patch)
        } catch (e) {
          fail(e)
          return null
        }
      },
      async remove(id) {
        try {
          await layer.disponibilidad.remove(id)
          return true
        } catch (e) {
          fail(e)
          return false
        }
      },
    }
  }, [layer, campaignId, showToast])
}
