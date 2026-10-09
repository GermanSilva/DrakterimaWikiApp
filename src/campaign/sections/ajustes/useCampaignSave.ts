import { useState } from 'react'
import { ConflictError, type CampaignPatch } from '../../../data'
import { useCampaign } from '../../CampaignContext'
import { useCampaignServices } from '../../entities/campaignServicesContext'
import { describeDataError } from '../../entities/errorMessages'
import { freshestCampaign, useSavedCampaign } from './savedCampaignContext'

export interface Notice {
  kind: 'ok' | 'error'
  text: string
}

/**
 * Guarded save of a slice of the campaign row (the shared plumbing of the Ajustes editors). Writes against the
 * freshest version the Ajustes page knows (the context campaign or the last save of any section), then reloads
 * the campaign context so the whole app picks the change up. A
 * conflict never overwrites: it re-reads and asks the DM to review. `saves` counts successful saves so an editor
 * can rebuild its drafts from what was stored.
 */
export function useCampaignSave() {
  const { layer, campaignId } = useCampaignServices()
  const { campaign: loaded, reload } = useCampaign()
  // The freshest row any Ajustes section saved: shared, so a quick save in another section does not use a stale version.
  const { saved, setSaved } = useSavedCampaign()
  const campaign = freshestCampaign(loaded, saved)
  const [saves, setSaves] = useState(0)
  const [notice, setNotice] = useState<Notice | null>(null)

  async function save(patch: CampaignPatch, okText: string, failText: string): Promise<boolean> {
    setNotice(null)
    try {
      const row = await layer.campaigns.updateCampaign(campaignId, patch, campaign.updated_at)
      setSaved({ row, over: loaded })
      setSaves((n) => n + 1)
      setNotice({ kind: 'ok', text: okText })
      reload()
      return true
    } catch (e) {
      if (e instanceof ConflictError) {
        setSaved(null)
        setNotice({ kind: 'error', text: 'La campaña cambió mientras la editabas. Cargamos los valores actuales: revisalos y guardá de nuevo.' })
        reload()
      } else {
        setNotice({ kind: 'error', text: describeDataError(e, failText) })
      }
      return false
    }
  }

  return { campaign, notice, setNotice, saves, save }
}
