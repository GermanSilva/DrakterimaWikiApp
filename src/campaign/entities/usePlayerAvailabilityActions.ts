import { useCallback, useMemo } from 'react'
import { type PlayerAvailability, type PlayerAvailabilityInput } from '../../data'
import { useToast } from '../toastContext'
import { useCampaignServices } from './campaignServicesContext'
import { describeDataError } from './errorMessages'

export interface PlayerAvailabilityActions {
  /** Resolves to the saved row, or `null` after a toast. Never throws. */
  create(input: PlayerAvailabilityInput): Promise<PlayerAvailability | null>
  update(id: number, patch: PlayerAvailabilityInput): Promise<PlayerAvailability | null>
  /** Resolves true when deleted (or false after a toast). */
  remove(id: number): Promise<boolean>
}

/**
 * Writes the CALLER's own availability. After every successful write the shared list is re-listed in
 * place, so a row that moved out of this campaign's list (re-pinned elsewhere) disappears even though
 * realtime does not report it to everyone.
 */
export function usePlayerAvailabilityActions(): PlayerAvailabilityActions {
  const { layer, store } = useCampaignServices()
  const toast = useToast()
  const reconcile = useCallback(() => store.get<PlayerAvailability>('pavail').refresh(), [store])
  const fail = useCallback(
    (e: unknown) => {
      console.error(e)
      toast.showToast(describeDataError(e), 'error')
    },
    [toast],
  )

  return useMemo<PlayerAvailabilityActions>(
    () => ({
      async create(input) {
        try {
          const row = await layer.playerAvailability.create(input)
          reconcile()
          return row
        } catch (e) {
          fail(e)
          return null
        }
      },
      async update(id, patch) {
        try {
          const row = await layer.playerAvailability.update(id, patch)
          reconcile()
          return row
        } catch (e) {
          fail(e)
          return null
        }
      },
      async remove(id) {
        try {
          await layer.playerAvailability.remove(id)
          reconcile()
          return true
        } catch (e) {
          fail(e)
          return false
        }
      },
    }),
    [layer, reconcile, fail],
  )
}
