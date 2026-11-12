import { useId, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { btnSecondary, inputCls } from '../../../constants'
import { LABEL_MAX, parseSystemProfile, SECTION_KEYS, type SectionKey } from '../../system/systemProfile'
import { UNIT_MAX } from '../../system/distance/distance'
import { LEVEL_MAX, newUnit, systemDraft, validateSystem, type BuiltinDraft, type SystemDraft, type SystemErrors, type UnitDraft, type UnitErrors } from './systemForm'
import { AdminSection } from '../../../components/AdminSection'
import type { Node } from '../../system/builder/draft'
import { changes } from '../../system/builder/changeCount'
import { discardedEntries } from '../../system/builder/discard'
import { economyErrors, economyIdentity, economyProjection, isEconomyItem, mergeEconomy } from '../../system/builder/economy'
import type { ReviewHost } from '../../system/builder/SheetBuilder'
import { describeSheetError, displayLine } from '../../system/builder/errorsEs'
import { validateSheet } from '../../system/sheet/sheetModel'
import { EconomyDiscarded } from './EconomyDiscarded'
import { EconomySettings } from './EconomySettings'
import { HomebrewSettings } from './HomebrewSettings'
import { countChanges } from './tabSave/dirty'
import { BlockSaveError } from './tabSave/tabSaveContext'
import { useTabSaveBlock } from './tabSave/useTabSaveBlock'
import { useDiscardedReview } from './SheetBuilderReview'
import { useCampaignSave } from './useCampaignSave'
import { useCampaignServices } from '../../entities/campaignServicesContext'
import { useLoad } from '../../entities/useLoad'

/** The economy draft a Sistema save writes: the sheet being edited and the sheet it started from (to tell what was deleted here). */
interface EconomyDraft {
  sheet: Node
  base: Node | null
}

const ECONOMY_REASON = 'Corregí los errores de Economía para poder guardar.'

const labelCls = 'block font-exo text-[10px] font-medium tracking-[0.2em] uppercase text-txt-muted mb-1.5'

const SECTION_LABEL: Record<SectionKey, string> = {
  stats: 'Estadísticas',
  habilidades: 'Habilidades',
  ataques: 'Ataques',
  hechizos: 'Hechizos',
  recursos: 'Recursos',
  equipo: 'Equipo',
  rasgos: 'Rasgos',
  narrativa: 'Narrativa',
  apariencia: 'Apariencia',
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-[13px] text-red-400 mt-1">
          {error}
        </p>
      )}
    </div>
  )
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-[13px] text-txt-secondary cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-accent" />
      {label}
    </label>
  )
}

interface BuiltinRowProps {
  /** Accessible name of the row (the built-in's own name). */
  name: string
  toggleLabel: string
  hint: string
  draft: BuiltinDraft
  error?: string
  onChange: (draft: BuiltinDraft) => void
  /** Extra inline controls between the checkbox and the title (the level range). */
  children?: ReactNode
  /** Extra content below the hint (the level range error). */
  footer?: ReactNode
}

/** One built-in on a single line: the checkbox, its inline inputs and the title (disabled while the built-in is off), the hint below. */
function BuiltinRow({ name, toggleLabel, hint, draft, error, onChange, children, footer }: BuiltinRowProps) {
  const id = useId()
  return (
    <div role="group" aria-label={name} className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Check label={toggleLabel} checked={draft.enabled} onChange={(enabled) => onChange({ ...draft, enabled })} />
        {children}
        <span className="flex items-center gap-2 text-[13px] text-txt-secondary">
          <label htmlFor={`${id}-label`}>Título</label>
          <input
            id={`${id}-label`}
            type="text"
            value={draft.label}
            maxLength={LABEL_MAX}
            disabled={!draft.enabled}
            onChange={(e) => onChange({ ...draft, label: e.target.value })}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-label-error` : undefined}
            className={`${inputCls} !w-[200px] disabled:opacity-50`}
          />
        </span>
      </div>
      <p className="text-[12px] text-txt-muted mt-1">{hint}</p>
      {error && (
        <p id={`${id}-label-error`} role="alert" className="text-[13px] text-red-400 mt-1">
          {error}
        </p>
      )}
      {footer}
    </div>
  )
}

/** Read-only lineage (S7): the system this campaign was created from, resolved among the systems the DM can read. */
function BasedOnField({ basedOn }: { basedOn: string | null | undefined }) {
  const { layer, campaignId } = useCampaignServices()
  const id = useId()
  const systems = useLoad(basedOn ? () => layer.systems.listAvailableBases() : null, `based-on:${campaignId}:${basedOn ?? ''}`)
  const value = !basedOn
    ? 'Sistema original (no se basa en ninguno)'
    : systems.status === 'ready'
      ? (systems.data?.find((s) => s.id === basedOn)?.name ?? 'Sistema no disponible')
      : systems.status === 'error'
        ? 'Sistema no disponible'
        : 'Cargando…'
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={labelCls}>
        Basado en
      </label>
      <input id={id} type="text" readOnly aria-readonly="true" value={value} aria-describedby={`${id}-hint`} className={`${inputCls} opacity-80`} />
      <p id={`${id}-hint`} className="text-[12px] text-txt-muted mt-1">
        Solo informativo: la campaña tiene su propia copia y no recibe cambios del sistema elegido.
      </p>
    </div>
  )
}

const smallBtn = `${btnSecondary} !px-2 !py-1 disabled:opacity-40 disabled:cursor-not-allowed`

interface UnitRowProps {
  position: number
  count: number
  unit: UnitDraft
  errors: UnitErrors
  onChange: (unit: UnitDraft) => void
  onMove: (delta: -1 | 1) => void
  onRemove: () => void
  radioName: string
}

function UnitRow({ position, count, unit, errors, onChange, onMove, onRemove, radioName }: UnitRowProps) {
  const id = useId()
  const invalid = (error?: string) => (error ? true : undefined)
  const describedBy = (field: string, error?: string) => (error ? `${id}-${field}-error` : undefined)
  return (
    <div role="group" aria-label={`Unidad ${position}`} className="border border-border-base px-3 py-3 flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field id={`${id}-key`} label="Clave" error={errors.key}>
          <input
            id={`${id}-key`}
            type="text"
            value={unit.key}
            readOnly={unit.saved}
            onChange={(e) => onChange({ ...unit, key: e.target.value })}
            aria-invalid={invalid(errors.key)}
            aria-describedby={describedBy('key', errors.key)}
            className={`${inputCls}${unit.saved ? ' opacity-70' : ''}`}
          />
        </Field>
        <Field id={`${id}-label`} label="Nombre" error={errors.label}>
          <input
            id={`${id}-label`}
            type="text"
            value={unit.label}
            onChange={(e) => onChange({ ...unit, label: e.target.value })}
            aria-invalid={invalid(errors.label)}
            aria-describedby={describedBy('label', errors.label)}
            className={inputCls}
          />
        </Field>
        <Field id={`${id}-value`} label="Valor" error={errors.value}>
          <input
            id={`${id}-value`}
            type="text"
            inputMode="decimal"
            value={unit.value}
            onChange={(e) => onChange({ ...unit, value: e.target.value })}
            aria-invalid={invalid(errors.value)}
            aria-describedby={describedBy('value', errors.value)}
            className={inputCls}
          />
        </Field>
        <Field id={`${id}-decimals`} label="Decimales">
          <select
            id={`${id}-decimals`}
            value={unit.decimals}
            onChange={(e) => onChange({ ...unit, decimals: e.target.value as UnitDraft['decimals'] })}
            className={inputCls}
          >
            <option value="0">0 (enteros)</option>
            <option value="1">1</option>
            <option value="2">2</option>
          </select>
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[13px] text-txt-secondary cursor-pointer">
          <input type="radio" name={radioName} checked={unit.main} onChange={() => onChange({ ...unit, main: true })} className="accent-accent" />
          Principal
        </label>
        <button type="button" className={smallBtn} disabled={position === 1} onClick={() => onMove(-1)}>
          Subir
        </button>
        <button type="button" className={smallBtn} disabled={position === count} onClick={() => onMove(1)}>
          Bajar
        </button>
        <button type="button" className={smallBtn} onClick={onRemove}>
          Quitar
        </button>
      </div>
    </div>
  )
}

function DistanceFieldset({ units, errors, onChange }: { units: UnitDraft[] | null; errors: SystemErrors['distance']; onChange: (units: UnitDraft[]) => void }) {
  const radioName = useId()
  return (
    <fieldset className="border border-border-base px-4 py-3 flex flex-col gap-3">
      <legend className="px-1 font-exo text-[11px] font-semibold tracking-[0.15em] uppercase text-txt-primary">Distancias</legend>
      <p className="text-[12px] text-txt-muted">
        Las unidades se escriben en los textos como [[{'{'}D:clave{'}'}15]] y se muestran con todas sus equivalencias, por ejemplo [15ft|4,5m|3c]. El valor es el tamaño de
        la unidad en una medida común (pie = 1, metro = 3,28084, casillero = 5). Cada unidad redondea hacia abajo con sus decimales. La clave no se puede cambiar una vez
        guardada.
      </p>
      {units === null ? (
        <p className="text-[13px] text-txt-secondary">Las unidades guardadas no se pueden editar desde aquí; se conservan tal como están.</p>
      ) : (
        <>
          {units.map((unit, i) => (
            <UnitRow
              // rows have no stable id until saved: the position is their identity
              key={i}
              position={i + 1}
              count={units.length}
              unit={unit}
              errors={errors?.units[i] ?? {}}
              radioName={radioName}
              onChange={(next) => onChange(units.map((u, j) => (j === i ? next : next.main ? { ...u, main: false } : u)))}
              onMove={(delta) => {
                const next = [...units]
                const [moved] = next.splice(i, 1)
                next.splice(i + delta, 0, moved)
                onChange(next)
              }}
              onRemove={() => {
                const next = units.filter((_, j) => j !== i)
                onChange(next.length > 0 && !next.some((u) => u.main) ? next.map((u, j) => ({ ...u, main: j === 0 })) : next)
              }}
            />
          ))}
          {errors?.main && (
            <p role="alert" className="text-[13px] text-red-400">
              {errors.main}
            </p>
          )}
          {errors?.list && (
            <p role="alert" className="text-[13px] text-red-400">
              {errors.list}
            </p>
          )}
          <div>
            <button
              type="button"
              className={`${btnSecondary} disabled:opacity-40 disabled:cursor-not-allowed`}
              disabled={units.length >= UNIT_MAX}
              onClick={() => onChange([...units, { ...newUnit(), main: units.length === 0 }])}
            >
              Agregar unidad
            </button>
          </div>
        </>
      )}
    </fieldset>
  )
}

/** `onSave` returns the errors of a rejected draft (shown on the fields), or throws a `BlockSaveError` when the write fails. */
function SystemForm({
  initial,
  initialSheet,
  latestSheet,
  readLottery,
  review,
  basedOn,
  onSave,
}: {
  initial: SystemDraft
  /** The stored sheet this form started from (null: the campaign has no template yet). */
  initialSheet: Node | null
  /** The freshest stored sheet. */
  latestSheet: Node | null
  readLottery: () => Promise<unknown>
  /** Characters and the DM-only RPCs of the discarded economy instances (absent until the characters were read). */
  review: ReviewHost | undefined
  basedOn: string | null | undefined
  onSave: (draft: SystemDraft, economy: EconomyDraft | null) => Promise<SystemErrors | null>
}) {
  const [draft, setDraft] = useState(initial)
  const [sheet, setSheet] = useState<Node | null>(initialSheet)
  const [errors, setErrors] = useState<SystemErrors>({})
  const rangeId = useId()

  // Economía shares this block (and so the single system_profile write of the tab): its draft is the sheet, validated as it would be written
  const economyChanges = initialSheet && sheet ? changes(economyProjection(initialSheet), economyProjection(sheet)) : 0
  const economyLines = useMemo(() => {
    if (economyChanges === 0 || !sheet || !latestSheet) return []
    const merged = mergeEconomy({ placement: latestSheet, economy: sheet, base: initialSheet, latest: latestSheet })
    const checked = validateSheet(merged.sheet)
    return [...(merged.blocked ? [merged.blocked] : []), ...(checked.ok ? [] : economyErrors(merged.sheet, checked.errors).map((e) => displayLine(describeSheetError(merged.sheet, e))))]
  }, [economyChanges, sheet, latestSheet, initialSheet])

  useTabSaveBlock({
    key: 'sistema',
    label: 'Datos del sistema',
    order: 10,
    dirtyCount: countChanges(initial, draft) + economyChanges,
    errorCount: economyLines.length,
    errorReason: economyLines.length > 0 ? ECONOMY_REASON : undefined,
    async save() {
      let found: SystemErrors | null
      try {
        found = await onSave(draft, economyChanges > 0 && sheet ? { sheet, base: initialSheet } : null)
      } catch (e) {
        setErrors({})
        throw e
      }
      setErrors(found ?? {})
      if (found) throw new BlockSaveError('Revisá los campos marcados.')
    },
    discard() {
      setDraft(initial)
      setSheet(initialSheet)
      setErrors({})
    },
  })

  // The tab's save bar saves; Enter in a field must not submit anything by itself.
  const submit = (e: FormEvent) => e.preventDefault()

  const level = (key: 'min' | 'max', label: string) => (
    <input
      id={`${rangeId}-${key}`}
      type="number"
      inputMode="numeric"
      min={0}
      max={LEVEL_MAX}
      aria-label={label}
      disabled={!draft.nivel.enabled}
      value={draft.nivel[key]}
      onChange={(e) => setDraft((d) => ({ ...d, nivel: { ...d.nivel, [key]: e.target.value } }))}
      aria-invalid={errors.range ? true : undefined}
      aria-describedby={errors.range ? `${rangeId}-error` : undefined}
      className={`${inputCls} !w-[90px] disabled:opacity-50`}
    />
  )

  return (
    <form noValidate onSubmit={submit} aria-label="Sistema de la campaña" className="flex flex-col gap-4">
      <div className="border border-border-base px-4 py-3 flex flex-col gap-4">
        <BasedOnField basedOn={basedOn} />
        <BuiltinRow
          name="Nivel"
          toggleLabel="Usar «Nivel»"
          hint="Cualquier rango entre 0 y 1000; por ejemplo 1 a 100 para sistemas con progresión larga."
          draft={draft.nivel}
          error={errors.nivel}
          onChange={(nivel) => setDraft((d) => ({ ...d, nivel: { ...d.nivel, ...nivel } }))}
          footer={
            errors.range && (
              <p id={`${rangeId}-error`} role="alert" className="text-[13px] text-red-400 mt-1">
                {errors.range}
              </p>
            )
          }
        >
          <span className="flex items-center gap-2 text-[13px] text-txt-secondary">
            <span>Rango</span>
            {level('min', 'Nivel mínimo')}
            <span>a</span>
            {level('max', 'Nivel máximo')}
          </span>
        </BuiltinRow>
        <BuiltinRow
          name="Clase"
          toggleLabel="Usar «Clase/Trabajo/Grupo»"
          hint="Cómo se llama en tu sistema: Clase, Trabajo, Oficio, Grupo… Se usa en la ficha, la lista y el buscador."
          draft={draft.clase}
          error={errors.clase}
          onChange={(clase) => setDraft((d) => ({ ...d, clase }))}
        />
        <BuiltinRow
          name="Raza"
          toggleLabel="Usar «Raza/Especie»"
          hint="Cómo se llama en tu sistema: Raza, Especie, Linaje, Ascendencia… Se usa en la ficha, la lista y el buscador."
          draft={draft.raza}
          error={errors.raza}
          onChange={(raza) => setDraft((d) => ({ ...d, raza }))}
        />
      </div>

      <fieldset className="border border-border-base px-4 py-3">
        <legend className="px-1 font-exo text-[11px] font-semibold tracking-[0.15em] uppercase text-txt-primary">Bloques de la ficha</legend>
        <p className="text-[12px] text-txt-muted mb-3">Los bloques desmarcados no aparecen en el formulario ni en el detalle del personaje. Los datos ya cargados no se borran.</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {SECTION_KEYS.map((key) => (
            <Check
              key={key}
              label={SECTION_LABEL[key]}
              checked={draft.sections[key]}
              onChange={(checked) => setDraft((d) => ({ ...d, sections: { ...d.sections, [key]: checked } }))}
            />
          ))}
        </div>
      </fieldset>

      <DistanceFieldset units={draft.distance} errors={errors.distance} onChange={(distance) => setDraft((d) => ({ ...d, distance }))} />

      <div id="ajustes-economia">
        <AdminSection title="Economía">
          <EconomySettings sheet={sheet} stored={latestSheet} onChange={setSheet} errors={economyLines} readLottery={readLottery} />
          {sheet && <EconomyDiscarded sheet={sheet} stored={initialSheet} review={review} dirty={countChanges(initial, draft) + economyChanges > 0} onChange={setSheet} />}
        </AdminSection>
      </div>

    </form>
  )
}

/**
 * The system of the campaign (DM only): which built-in character fields exist and what they are called, the level range
 * and which blocks the character sheet shows. The whole document is written through the validated RPC; the parts edited
 * elsewhere (currency, modules) travel unchanged.
 */
export function SystemSettings() {
  const { campaign, latest, notice, setNotice, saves, saveSystem, fail } = useCampaignSave()
  const { layer, campaignId } = useCampaignServices()
  const stored = parseSystemProfile(campaign.system_profile)
  const hasDiscardedEconomy = discardedEntries(stored.sheet ?? {}).some((e) => isEconomyItem(e.item))
  const review = useDiscardedReview({ enabled: hasDiscardedEconomy, campaign, setNotice })
  const readLottery = async () => (await layer.config.get(campaignId, 'loteria'))?.value

  async function onSave(draft: SystemDraft, economy: EconomyDraft | null): Promise<SystemErrors | null> {
    setNotice(null)
    // over the document as it is now (the sheet template may have been saved since this render)
    const current = parseSystemProfile(latest().system_profile)
    const result = validateSystem(draft, current)
    if (!result.ok) {
      setNotice({ kind: 'error', text: 'Revisá los campos marcados.' })
      return result.errors
    }
    let profile = result.profile
    if (economy) {
      // ONE write: the economy parts go into the same document as the rest of Sistema, over the placement as stored now (the builder may have saved)
      const now: Node | null = current.sheet ?? null
      if (!now) return fail('La campaña no tiene plantilla de ficha: guardala en la pestaña Ficha antes de configurar la economía.')
      const merged = mergeEconomy({ placement: now, economy: economy.sheet, base: economy.base, latest: now })
      if (merged.blocked) return fail(merged.blocked)
      const checked = validateSheet(merged.sheet)
      if (!checked.ok && economyErrors(merged.sheet, checked.errors).length > 0) return fail(ECONOMY_REASON)
      profile = { ...profile, sheet: merged.sheet }
    }
    await saveSystem(profile, 'Sistema guardado.', 'No se pudo guardar el sistema. Intentá de nuevo.')
    return null
  }

  // Rebuild the draft when a save of this form succeeded or the part of the document it edits changed (another DM, conflict
  // re-read). A save of another block of the same document (the sheet template) changes the rest of the document, not this
  // draft: the form keeps what is typed and its next save is written over the document as saved by then.
  const formKey = `${saves}:${JSON.stringify(systemDraft(stored))}:${JSON.stringify(economyIdentity(stored.sheet ?? null))}`
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-txt-secondary">
        Definí cómo es la ficha de los personajes en esta campaña: nombres de los campos integrados, rango de nivel, bloques que se usan y unidades de distancia.
      </p>
      <SystemForm
        key={formKey}
        initial={systemDraft(stored)}
        initialSheet={stored.sheet ?? null}
        latestSheet={stored.sheet ?? null}
        readLottery={readLottery}
        review={review}
        basedOn={campaign.based_on_system}
        onSave={onSave}
      />
      {notice && (
        <p role={notice.kind === 'error' ? 'alert' : 'status'} className={notice.kind === 'error' ? 'text-[13px] text-red-400' : 'text-[13px] text-accent-bright'}>
          {notice.text}
        </p>
      )}
      <AdminSection title="Homebrew">
        <HomebrewSettings />
      </AdminSection>
    </div>
  )
}
