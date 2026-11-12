import { useEffect, useState } from 'react'
import { ConflictError, DataError, type Campaign } from '../../../data'
import { useCampaign } from '../../CampaignContext'
import { useCampaignServices } from '../../entities/campaignServicesContext'
import { describeDataError } from '../../entities/errorMessages'
import { mergeEconomy } from '../../system/builder/economy'
import type { ReviewCharacter, ReviewHost } from '../../system/builder/SheetBuilder'
import { useSavedCampaign } from './savedCampaignContext'
import type { Notice } from './useCampaignSave'

interface Options {
  /** False for a template with nothing discarded: the characters are not even read. */
  enabled: boolean
  /** The freshest campaign the page knows: its `updated_at` is the version every write is made against. */
  campaign: Campaign
  setNotice: (notice: Notice | null) => void
}

/**
 * What the "Campos descartados" review needs from the campaign (G7b, S26): the characters, read through the data layer, and the two
 * DM-only RPCs that delete or move their data. Writes use the same guarded path as the rest of Ajustes (the stored version as `base`;
 * a conflict never overwrites), then the campaign is reloaded so the builder is rebuilt from what the database stored. `undefined`
 * until the characters have been read.
 */
export function useDiscardedReview({ enabled, campaign, setNotice }: Options): ReviewHost | undefined {
  const { layer, campaignId } = useCampaignServices()
  const { campaign: loaded, reload } = useCampaign()
  const { setSaved } = useSavedCampaign()
  const [characters, setCharacters] = useState<ReviewCharacter[] | null>(null)
  const [reads, setReads] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let live = true
    layer
      .entity('pjs')
      .list(campaignId)
      .then((rows) => live && setCharacters(rows.map((row) => ({ id: row.id, nombre: String(row.nombre ?? ''), values: row as unknown as Record<string, unknown> }))))
      .catch(() => live && setCharacters(null))
    return () => {
      live = false
    }
  }, [enabled, layer, campaignId, reads])

  async function commit(write: (base: string) => Promise<Campaign>, okText: string, failText: string): Promise<void> {
    setNotice(null)
    try {
      const row = await write(campaign.updated_at)
      setSaved({ row, over: loaded })
      setNotice({ kind: 'ok', text: okText })
      reload()
      setReads((n) => n + 1)
    } catch (e) {
      if (e instanceof ConflictError) {
        setSaved(null)
        setNotice({ kind: 'error', text: 'La campaña cambió mientras la editabas. Cargamos los valores actuales: revisalos y guardá de nuevo.' })
        reload()
      } else {
        const refused = e instanceof DataError && e.reason === 'invalid_system_profile'
        setNotice({ kind: 'error', text: refused ? `El servidor no aceptó el sistema (parte: ${e.details ?? 'documento'}). Revisá los valores.` : describeDataError(e, failText) })
      }
    }
  }

  if (!enabled || characters === null) return undefined
  return {
    characters,
    onPurge: (key) => commit((base) => layer.campaigns.purgeDiscardedItem(campaignId, key, base), 'Campo descartado eliminado.', 'No se pudo eliminar el campo descartado. Intentá de nuevo.'),
    onRestoreRenamed: (key, renames, sheet, warning, economyOwner = false) => {
      const stored = campaign.system_profile as unknown
      const document = typeof stored === 'object' && stored !== null && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {}
      // The economy of what is written always comes from its owner (S8): from the stored sheet when `sheet` is a builder draft (which cannot
      // bring an economy instance back), from `sheet` itself when Sistema restores one.
      const now = typeof document.sheet === 'object' && document.sheet !== null && !Array.isArray(document.sheet) ? (document.sheet as Record<string, unknown>) : null
      const written = !now ? sheet : economyOwner ? mergeEconomy({ placement: now, economy: sheet, base: now, latest: now }).sheet : mergeEconomy({ placement: sheet, economy: now, base: now, latest: now, strict: true }).sheet
      return commit(
        (base) => layer.campaigns.rekeyDiscardedItem(campaignId, key, renames, { ...document, sheet: written }, base),
        `Plantilla guardada. ${warning}`.trim(),
        'No se pudo restaurar el campo. Intentá de nuevo.',
      )
    },
  }
}
