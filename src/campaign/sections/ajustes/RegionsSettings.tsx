import { useState, type FormEvent, type ReactNode } from 'react'
import { btnSecondary, inputCls } from '../../../constants'
import type { DataLayer } from '../../../data'
import { parseRegions, readRegions } from '../../adapters/hubFormPort'
import { useCampaignServices } from '../../entities/campaignServicesContext'
import { useLoad } from '../../entities/useLoad'
import { UnreadableNotice } from './UnreadableNotice'
import { ListEditor, type RemovalPolicy } from './ListEditor'
import { countRegionUsage, describeUsage, REGION_TABLES, type RegionUsage } from './regionUsage'
import { MAX_REGIONS, newRegionDraft, regionDrafts, REGION_LABEL_MAX, validateRegions, type RegionDraft, type RegionRowErrors } from './regionsForm'
import { KEY_MAX } from './fieldKey'
import { mergeRegions, unreadableRegions } from './storedMerge'
import { useCampaignSave } from './useCampaignSave'

const labelCls = 'block font-exo text-[10px] font-medium tracking-[0.2em] uppercase text-txt-muted mb-1.5'
const FALLBACK_SWATCH = '#dc2626'

/** Rows of the four tables that carry a region, as the DM sees them (drafts and secrets included). */
async function fetchRegionUsage(layer: DataLayer, campaignId: string): Promise<RegionUsage> {
  const lists = await Promise.all(REGION_TABLES.map((table) => layer.entity(table).list(campaignId)))
  return countRegionUsage(Object.fromEntries(REGION_TABLES.map((table, i) => [table, lists[i]])) as never)
}

function Labelled({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-[12px] text-txt-muted mt-1">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-[13px] text-red-400 mt-1">
          {error}
        </p>
      )}
    </div>
  )
}

const describedBy = (id: string, hint: boolean, error?: string) => [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined

function RegionRow({ row, errors, update }: { row: RegionDraft; errors: RegionRowErrors; update: (patch: Partial<RegionDraft>) => void }) {
  const id = `region-${row.uid}`
  const swatch = /^#[0-9a-fA-F]{6}$/.test(row.color.trim()) ? row.color.trim() : FALLBACK_SWATCH
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
      <Labelled id={`${id}-label`} label="Nombre" error={errors.label}>
        <input
          id={`${id}-label`}
          type="text"
          value={row.label}
          maxLength={REGION_LABEL_MAX + 20}
          onChange={(e) => update({ label: e.target.value })}
          aria-invalid={errors.label ? true : undefined}
          aria-describedby={describedBy(`${id}-label`, false, errors.label)}
          className={inputCls}
        />
      </Labelled>
      <Labelled
        id={`${id}-key`}
        label="Clave"
        error={errors.key}
        hint={row.persisted ? 'La clave no se puede cambiar.' : `Identificador interno, hasta ${KEY_MAX} caracteres. No se puede cambiar después.`}
      >
        <input
          id={`${id}-key`}
          type="text"
          value={row.key}
          readOnly={row.persisted}
          aria-readonly={row.persisted ? true : undefined}
          onChange={(e) => update({ key: e.target.value })}
          aria-invalid={errors.key ? true : undefined}
          aria-describedby={describedBy(`${id}-key`, true, errors.key)}
          className={inputCls + (row.persisted ? ' opacity-70 cursor-not-allowed' : '')}
        />
      </Labelled>
      <Labelled id={`${id}-color`} label="Color (opcional)" error={errors.color}>
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label="Elegir color"
            value={swatch}
            onChange={(e) => update({ color: e.target.value })}
            className="h-9 w-10 p-0 bg-transparent border border-border-base cursor-pointer"
          />
          <input
            id={`${id}-color`}
            type="text"
            value={row.color}
            placeholder="#rrggbb"
            onChange={(e) => update({ color: e.target.value })}
            aria-invalid={errors.color ? true : undefined}
            aria-describedby={describedBy(`${id}-color`, false, errors.color)}
            className={inputCls + ' !w-28'}
          />
        </div>
      </Labelled>
    </div>
  )
}

const rowName = (r: RegionDraft) => r.label.trim() || r.key.trim() || 'región nueva'

function RegionsForm({ initial, usageText, usageState, onSave }: {
  initial: RegionDraft[]
  usageText: (key: string) => string
  usageState: 'loading' | 'error' | 'ready'
  onSave: (rows: RegionDraft[]) => Promise<{ errors: Record<number, RegionRowErrors>; list?: string } | null>
}) {
  const [rows, setRows] = useState(initial)
  const [errors, setErrors] = useState<Record<number, RegionRowErrors>>({})
  const [listError, setListError] = useState<string | undefined>()
  const [saving, setSaving] = useState(false)

  const removal = (row: RegionDraft): RemovalPolicy => {
    if (rows.length <= 1) return { blocked: 'Tiene que quedar al menos una región.' }
    if (!row.persisted) return {}
    if (usageState === 'loading') return { blocked: 'Verificando si la región está en uso…' }
    if (usageState === 'error') return { blocked: 'No pudimos verificar si la región está en uso, así que no se puede quitar ahora.' }
    const used = usageText(row.key)
    return used ? { blocked: `En uso por ${used}. Cambiá la región de esos elementos antes de quitarla.` } : {}
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const result = await onSave(rows)
      setErrors(result?.errors ?? {})
      setListError(result?.list)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form noValidate onSubmit={submit} aria-label="Regiones de la campaña" id="regions-form" className="flex flex-col gap-4">
      <ListEditor
        label="Lista de regiones"
        items={rows}
        onChange={setRows}
        onAdd={() => setRows((r) => [...r, newRegionDraft(r)])}
        addLabel="Agregar región"
        addDisabled={rows.length >= MAX_REGIONS ? `Máximo ${MAX_REGIONS} regiones.` : undefined}
        itemName={rowName}
        renderFields={(row, update) => <RegionRow row={row} errors={errors[row.uid] ?? {}} update={update} />}
        removal={removal}
        confirmText={(row) => `¿Quitar la región "${rowName(row)}"?`}
        listError={listError}
        disabled={saving}
      />
      <SaveBar saving={saving} />
    </form>
  )
}

function SaveBar({ saving }: { saving: boolean }) {
  return (
    <div>
      <button type="submit" className={btnSecondary} disabled={saving}>
        {saving ? 'Guardando…' : 'Guardar regiones'}
      </button>
    </div>
  )
}

/**
 * Regions of the campaign (DM only): add, rename, recolour, reorder and remove. A key never changes once saved. A
 * region still used by a lugar, PNJ, personaje or facción cannot be removed (the count is shown), and the last
 * one cannot be removed. The use check runs again right before the write, so a row that took the region after
 * the page loaded still blocks the removal.
 */
export function RegionsSettings() {
  const { layer, campaignId } = useCampaignServices()
  const { campaign, notice, setNotice, saves, save } = useCampaignSave()
  const usage = useLoad(() => fetchRegionUsage(layer, campaignId), `region-usage:${campaignId}:${saves}`)

  const stored = parseRegions(campaign.regions)
  // With no readable region the list shows a synthetic "otro": it is only a draft until the DM saves the list.
  const synthetic = readRegions(campaign.regions).regions.length === 0
  const unreadable = unreadableRegions(campaign.regions)

  async function onSave(rows: RegionDraft[]) {
    setNotice(null)
    const result = validateRegions(rows)
    if (!result.ok) {
      setNotice({ kind: 'error', text: 'Revisá los campos marcados.' })
      return { errors: result.errors, list: result.list }
    }
    // Re-check the use of every key about to disappear against fresh data, not the possibly stale list on screen.
    const removed = stored.filter((s) => !result.regions.some((r) => r.key === s.key))
    if (removed.length > 0) {
      let fresh: RegionUsage
      try {
        fresh = await fetchRegionUsage(layer, campaignId)
      } catch {
        setNotice({ kind: 'error', text: 'No pudimos verificar si las regiones quitadas están en uso. No se guardó nada.' })
        return null
      }
      const inUse = removed.filter((s) => describeUsage(fresh.get(s.key)))
      if (inUse.length > 0) {
        setNotice({ kind: 'error', text: `No se puede quitar ${inUse.map((s) => `"${s.label}" (${describeUsage(fresh.get(s.key))})`).join(', ')}: la región sigue en uso. No se guardó nada.` })
        return null
      }
    }
    await save({ regions: mergeRegions(campaign.regions, result.regions) }, 'Regiones guardadas.', 'No se pudieron guardar las regiones. Intentá de nuevo.')
    return null
  }

  const usageState = usage.status === 'ready' ? 'ready' : usage.status === 'error' ? 'error' : 'loading'
  const usageText = (key: string) => (usage.status === 'ready' && usage.data ? describeUsage(usage.data.get(key)) : '')
  // Remount the drafts when a save succeeded or the stored regions changed (another DM, conflict re-read).
  const formKey = `${saves}:${JSON.stringify(campaign.regions)}`

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-txt-secondary">
        Las regiones clasifican lugares, PNJs, personajes y facciones. La clave es interna y no cambia; el nombre y el color sí.
      </p>
      {unreadable > 0 && <UnreadableNotice count={unreadable} />}
      <RegionsForm key={formKey} initial={regionDrafts(stored, !synthetic)} usageText={usageText} usageState={usageState} onSave={onSave} />
      {notice && (
        <p role={notice.kind === 'error' ? 'alert' : 'status'} className={notice.kind === 'error' ? 'text-[13px] text-red-400' : 'text-[13px] text-accent-bright'}>
          {notice.text}
        </p>
      )}
    </div>
  )
}
