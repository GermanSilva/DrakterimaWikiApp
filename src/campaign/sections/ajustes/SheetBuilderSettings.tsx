import { useState } from 'react'
import { expiringSoon, formatDeletionDate, deletionDate, DISCARDED_WARNING_DAYS } from '../../system/builder/discardedLifecycle'
import { SheetBuilder } from '../../system/builder/SheetBuilder'
import { parseSystemProfile } from '../../system/systemProfile'
import { ConfirmDialog } from './ConfirmDialog'
import { useDiscardedReview } from './SheetBuilderReview'
import { useCampaignSave } from './useCampaignSave'

type Sheet = Record<string, unknown>

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const discardedDates = (value: unknown): { at: string }[] =>
  Array.isArray(value) ? value.flatMap((e) => (isRecord(e) && typeof e.at === 'string' ? [{ at: e.at }] : [])) : []

/**
 * The character sheet template of the campaign (DM only). The builder validates on every change; saving writes the whole
 * system document through the same guarded path as the "Sistema" section, with only `sheet` replaced: every other key of
 * the stored document (distance, currency, modules...) travels exactly as stored.
 */
export function SheetBuilderSettings() {
  const { campaign, notice, setNotice, saves, saveSystem } = useCampaignSave()
  const raw: unknown = campaign.system_profile
  const stored = parseSystemProfile(raw)
  const hasSheet = stored.sheet !== undefined
  const [asking, setAsking] = useState<Sheet | null>(null)
  const [busy, setBusy] = useState(false)
  const discarded = isRecord(stored.sheet) && Array.isArray(stored.sheet.discarded) && stored.sheet.discarded.length > 0
  const review = useDiscardedReview({ enabled: discarded, campaign, setNotice })
  const expiring = discarded && isRecord(stored.sheet) ? expiringSoon(discardedDates(stored.sheet.discarded), new Date()) : []
  const firstDate = expiring.length > 0 ? formatDeletionDate(expiring.reduce((a, b) => (deletionDate(b.at) < deletionDate(a.at) ? b : a)).at) : null

  async function write(sheet: Sheet): Promise<void> {
    setNotice(null)
    const base = isRecord(raw) && raw.version === 1 ? raw : stored
    await saveSystem({ ...base, sheet }, 'Plantilla guardada.', 'No se pudo guardar la plantilla. Intentá de nuevo.')
  }

  async function onSave(sheet: Sheet): Promise<void> {
    if (!hasSheet) setAsking(sheet)
    else await write(sheet)
  }

  async function confirmFirst() {
    if (!asking) return
    setBusy(true)
    try {
      await write(asking)
    } finally {
      setBusy(false)
      setAsking(null)
    }
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
      <SheetBuilder key={builderKey} initial={stored.sheet ?? null} onSave={onSave} review={review} />
      {notice && (
        <p role={notice.kind === 'error' ? 'alert' : 'status'} className={notice.kind === 'error' ? 'text-[13px] text-red-400' : 'text-[13px] text-accent-bright'}>
          {notice.text}
        </p>
      )}
      {asking && (
        <ConfirmDialog title="Guardar la primera plantilla" confirmLabel="Guardar plantilla" busyLabel="Guardando…" busy={busy} error={null} onConfirm={confirmFirst} onClose={() => setAsking(null)}>
          <p>
            Al guardar la primera plantilla, la ficha clásica deja de usarse en esta campaña: el formulario, el detalle, las tarjetas de personajes y la sesión en vivo leen la
            plantilla. Asigná los roles (vida, clase de armadura, velocidad, iniciativa) o esos datos dejan de mostrarse. Los datos de los personajes no se borran.
          </p>
        </ConfirmDialog>
      )}
    </div>
  )
}
