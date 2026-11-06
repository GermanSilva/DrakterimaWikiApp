import { useCallback, useEffect, useState } from 'react'
import type { CampaignAction } from '../../../data'
import { useCampaignServices } from '../../entities/campaignServicesContext'

export type ActionCollectionState = { status: 'loading' | 'error'; items: CampaignAction[] } | { status: 'ready'; items: CampaignAction[] }

/**
 * The shared action collection of the campaign for the DM catalogue. No realtime: entries only change through this page, so
 * every write refetches (`reload`); a failed read keeps what was shown and reports `error`.
 */
export function useActionCollection() {
  const { layer, campaignId } = useCampaignServices()
  const [state, setState] = useState<ActionCollectionState>({ status: 'loading', items: [] })

  const reload = useCallback(async () => {
    try {
      const items = await layer.actions.listActions(campaignId)
      setState({ status: 'ready', items })
    } catch (err) {
      console.error('No se pudo leer la colección de acciones', err)
      setState((current) => ({ status: 'error', items: current.items }))
    }
  }, [layer, campaignId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
  }, [reload])

  return { ...state, reload, retry: () => { setState((current) => ({ status: 'loading', items: current.items })); void reload() } }
}
