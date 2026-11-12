import { useEffect, useMemo, useState } from 'react'
import { useCampaignServices } from '../../entities/campaignServicesContext'
import { toTestCharacters, type TestCharacter } from '../../system/builder/formula/testCharacters'
import { expiringSoon, formatDeletionDate, deletionDate, DISCARDED_WARNING_DAYS } from '../../system/builder/discardedLifecycle'
import { SheetBuilder } from '../../system/builder/SheetBuilder'
import { parseSystemProfile } from '../../system/systemProfile'
import { ConfirmDialog } from './ConfirmDialog'
import { useDiscardedReview } from './SheetBuilderReview'
import { BlockSaveCancelled } from './tabSave/tabSaveContext'
import { useCampaignSave } from './useCampaignSave'

type Sheet = Record<string, unknown>

/** The first template waiting for the DM's confirmation: the tab's save waits on `settle` until it is confirmed or cancelled. */
interface FirstSave {
  sheet: Sheet
  settle: { resolve: () => void; reject: (reason: unknown) => void }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const discardedDates = (value: unknown): { at: string }[] =>
  Array.isArray(value) ? value.flatMap((e) => (isRecord(e) && typeof e.at === 'string' ? [{ at: e.at }] : [])) : []

/**
 * The campaign's characters to try formulas on (S42 d), read through the data layer. Never blocks the builder: while they load, or if
 * the read fails, the list is empty and the builder keeps its built-in example character.
 */
function useTestCharacters(): readonly TestCharacter[] {
  const { layer, campaignId } = useCampaignServices()
  const [rows, setRows] = useState<readonly Record<string, unknown>[]>([])
  useEffect(() => {
    let live = true
    layer
      .entity('pjs')
      .list(campaignId)
      .then((list) => live && setRows(list as unknown as Record<string, unknown>[]))
      .catch(() => live && setRows([]))
    return () => {
      live = false
    }
  }, [layer, campaignId])
  return useMemo(() => toTestCharacters(rows), [rows])
}

/**
 * The character sheet template of the campaign (DM only). The builder validates on every change; the Ficha tab's bar saves it,
 * writing the whole system document through the same guarded path as the "Sistema" section, with only `sheet` replaced: every other
 * key of the stored document (distance, currency, modules...) travels exactly as stored, as the document is when the save runs
 * (so a Sistema save made meanwhile is kept, and this draft is not rebuilt by it).
 */
export function SheetBuilderSettings() {
  const { campaign, latest, notice, setNotice, saves, saveSystem } = useCampaignSave()
  const raw: unknown = campaign.system_profile
  const stored = parseSystemProfile(raw)
  const hasSheet = stored.sheet !== undefined
  const testCharacters = useTestCharacters()
  const [asking, setAsking] = useState<FirstSave | null>(null)
  const [busy, setBusy] = useState(false)
  const discarded = isRecord(stored.sheet) && Array.isArray(stored.sheet.discarded) && stored.sheet.discarded.length > 0
  const review = useDiscardedReview({ enabled: discarded, campaign, setNotice })
  const expiring = discarded && isRecord(stored.sheet) ? expiringSoon(discardedDates(stored.sheet.discarded), new Date()) : []
  const firstDate = expiring.length > 0 ? formatDeletionDate(expiring.reduce((a, b) => (deletionDate(b.at) < deletionDate(a.at) ? b : a)).at) : null

  async function write(sheet: Sheet): Promise<void> {
    setNotice(null)
    // over the document as it is now (the Sistema section may have been saved since this render)
    const current: unknown = latest().system_profile
    const base = isRecord(current) && current.version === 1 ? current : parseSystemProfile(current)
    await saveSystem({ ...base, sheet }, 'Plantilla guardada.', 'No se pudo guardar la plantilla. Intentá de nuevo.')
  }

  /** Throws when the write fails; the first template resolves once the DM confirmed and the write finished (or rejects as cancelled). */
  async function onSave(sheet: Sheet): Promise<void> {
    if (hasSheet) return write(sheet)
    await new Promise<void>((resolve, reject) => setAsking({ sheet, settle: { resolve, reject } }))
  }

  async function confirmFirst() {
    if (!asking) return
    setBusy(true)
    try {
      await write(asking.sheet)
      asking.settle.resolve()
    } catch (e) {
      asking.settle.reject(e)
    } finally {
      setBusy(false)
      setAsking(null)
    }
  }

  function cancelFirst() {
    asking?.settle.reject(new BlockSaveCancelled())
    setAsking(null)
  }

  // Remount the draft when a save succeeded or the stored sheet changed (another DM, conflict re-read); a save of another
  // section changes the document but not the sheet, so it keeps what is being edited here.
  const builderKey = `${saves}:${JSON.stringify(stored.sheet ?? null)}`
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-txt-secondary">
        Diseñá la ficha de los personajes: categorías (las pestañas del editor), secciones, campos y tablas, y cómo se muestran en el detalle. Las claves se fijan al guardar:
        los datos de los personajes viven en ellas.
      </p>
      {!hasSheet && (
        <p className="text-[13px] text-txt-secondary">
          Esta campaña todavía usa la ficha clásica. Al guardar una plantilla, el formulario, el detalle, las tarjetas y la sesión en vivo pasan a leerla.
        </p>
      )}
      {expiring.length > 0 && (
        <p role="status" aria-label="Eliminación automática de campos descartados" className="text-[13px] text-amber-400">
          {expiring.length === 1
            ? `1 campo descartado se eliminará automáticamente en los próximos ${DISCARDED_WARNING_DAYS} días (el ${firstDate}).`
            : `${expiring.length} campos descartados se eliminarán automáticamente en los próximos ${DISCARDED_WARNING_DAYS} días (el primero, el ${firstDate}).`}
        </p>
      )}
      <SheetBuilder key={builderKey} initial={stored.sheet ?? null} onSave={onSave} review={review} testCharacters={testCharacters} />
      {notice && (
        <p role={notice.kind === 'error' ? 'alert' : 'status'} className={notice.kind === 'error' ? 'text-[13px] text-red-400' : 'text-[13px] text-accent-bright'}>
          {notice.text}
        </p>
      )}
      {asking && (
        <ConfirmDialog title="Guardar la primera plantilla" confirmLabel="Guardar plantilla" busyLabel="Guardando…" busy={busy} error={null} onConfirm={confirmFirst} onClose={cancelFirst}>
          <p>
            Al guardar la primera plantilla, la ficha clásica deja de usarse en esta campaña: el formulario, el detalle, las tarjetas de personajes y la sesión en vivo leen la
            plantilla. Asigná los roles (vida, clase de armadura, velocidad, iniciativa) o esos datos dejan de mostrarse. Los datos de los personajes no se borran.
          </p>
        </ConfirmDialog>
      )}
    </div>
  )
}
