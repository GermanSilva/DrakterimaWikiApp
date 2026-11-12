import { useLayoutEffect, useRef, useState } from 'react'
import { ConflictError, DataError, type Campaign, type CampaignPatch } from '../../../data'
import { useCampaign } from '../../CampaignContext'
import { useCampaignServices } from '../../entities/campaignServicesContext'
import { describeDataError } from '../../entities/errorMessages'
import { freshestCampaign, useSavedCampaign } from './savedCampaignContext'
import { BlockSaveError } from './tabSave/tabSaveContext'

export interface Notice {
  kind: 'ok' | 'error'
  text: string
}

/**
 * Guarded save of a slice of the campaign row (the shared plumbing of the Ajustes editors). Writes against the
 * freshest version the Ajustes page knows (the context campaign or the last save of any section, read at the moment of
 * the write so blocks saved one after the other in a single click chain their versions), then reloads
 * the campaign context so the whole app picks the change up. A
 * conflict never overwrites: it re-reads and asks the DM to review. `saves` counts successful saves so an editor
 * can rebuild its drafts from what was stored. `latest()` is the same freshest row read at call time: a save builds the document it
 * writes from it, so a block saved just before (another tab's, or the previous one of the same click) is never overwritten by an older render. A failed save shows its notice and throws a `BlockSaveError` with the same text
 * (what the tab's save bar reports); `fail` does the same for a failure the block detects before writing.
 */
export function useCampaignSave() {
  const { layer, campaignId } = useCampaignServices()
  const { campaign: loaded, reload } = useCampaign()
  // The freshest row any Ajustes section saved: shared, so a quick save in another section does not use a stale version.
  const { saved, setSaved, getSaved } = useSavedCampaign()
  const campaign = freshestCampaign(loaded, saved)
  const loadedNow = useRef(loaded)
  useLayoutEffect(() => {
    loadedNow.current = loaded
  })
  /** The freshest campaign right now (not as of the last render): a save composes the document it writes from this one. */
  const latest = () => freshestCampaign(loadedNow.current, getSaved())
  const [saves, setSaves] = useState(0)
  const [notice, setNotice] = useState<Notice | null>(null)

  /** Shows `text` as the block's error and throws it for the save bar. */
  function fail(text: string): never {
    setNotice({ kind: 'error', text })
    throw new BlockSaveError(text)
  }

  /** The guarded write shared by every editor: `write` gets the version to write against and returns the saved row. */
  async function commit(write: (base: string) => Promise<Campaign>, okText: string, failText: string): Promise<void> {
    setNotice(null)
    try {
      const over = loadedNow.current
      const row = await write(latest().updated_at)
      setSaved({ row, over })
      setSaves((n) => n + 1)
      setNotice({ kind: 'ok', text: okText })
      reload()
    } catch (e) {
      if (e instanceof ConflictError) {
        setSaved(null)
        reload()
        fail('La campaña cambió mientras la editabas. Cargamos los valores actuales: revisalos y guardá de nuevo.')
      }
      const refused = e instanceof DataError && e.reason === 'invalid_system_profile'
      return fail(refused ? `El servidor no aceptó el sistema (parte: ${e.details ?? 'documento'}). Revisá los valores.` : describeDataError(e, failText))
    }
  }

  const save = (patch: CampaignPatch, okText: string, failText: string) =>
    commit((base) => layer.campaigns.updateCampaign(campaignId, patch, base), okText, failText)
  /** Writes the whole system document through the validated RPC (the only door to `campaigns.system_profile`). */
  const saveSystem = (profile: unknown, okText: string, failText: string) =>
    commit((base) => layer.campaigns.setSystemProfile(campaignId, profile, base), okText, failText)

  return { campaign, latest, notice, setNotice, saves, save, saveSystem, fail }
}
