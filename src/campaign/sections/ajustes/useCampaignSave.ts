import { useState } from 'react'
import { ConflictError, DataError, type Campaign, type CampaignPatch } from '../../../data'
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

  /** The guarded write shared by every editor: `write` gets the version to write against and returns the saved row. */
  async function commit(write: (base: string) => Promise<Campaign>, okText: string, failText: string): Promise<boolean> {
    setNotice(null)
    try {
      const row = await write(campaign.updated_at)
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
        const refused = e instanceof DataError && e.reason === 'invalid_system_profile'
        setNotice({ kind: 'error', text: refused ? `El servidor no aceptó el sistema (parte: ${e.details ?? 'documento'}). Revisá los valores.` : describeDataError(e, failText) })
      }
      return false
    }
  }

  const save = (patch: CampaignPatch, okText: string, failText: string) =>
    commit((base) => layer.campaigns.updateCampaign(campaignId, patch, base), okText, failText)
  /** Writes the whole system document through the validated RPC (the only door to `campaigns.system_profile`). */
  const saveSystem = (profile: unknown, okText: string, failText: string) =>
    commit((base) => layer.campaigns.setSystemProfile(campaignId, profile, base), okText, failText)

  return { campaign, notice, setNotice, saves, save, saveSystem }
}
