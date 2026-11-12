import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ConfirmDialog } from '../../sections/ajustes/ConfirmDialog'
import { BlockSaveCancelled, BlockSaveError } from '../../sections/ajustes/tabSave/tabSaveContext'
import { useTabSaveBlock } from '../../sections/ajustes/tabSave/useTabSaveBlock'
import { validateSheet, type Sheet, type SheetError } from '../sheet/sheetModel'
import { BuilderContext, type BuilderApi } from './builderContext'
import { BuilderOutline } from './BuilderOutline'
import { BuilderPreview } from './BuilderPreview'
import { CategoryTabs } from './CategoryTabs'
import { changes } from './changeCount'
import { discardedEntries, planRestore, type RestorePlan } from './discard'
import { deletionMessage, DiscardedPanel, type ReviewCharacter } from './DiscardedPanel'
import { EconomyDiscardedNote } from './EconomyNote'
import type { TestCharacter } from './formula/testCharacters'
import { getAt, isNode, parsePath, setAt, type Node, type Path } from './draft'
import { holdsEconomy, isEconomyItem, economyProjection, mergeEconomy, rewardKey } from './economy'
import { describeSheetError, displayLine, ownerOf, type DisplayError } from './errorsEs'
import { newCategory, newSection } from './factories'
import { describeRemoval, kindOf, removalConflict, removalMessage, removeNode, type RemovalRequest } from './removal'
import { RolesPanel } from './RolesPanel'
import { blockedReason } from './blockedReason'
import { SaveBar } from './SaveBar'
import { CardPanel } from './CardPanel'

/** A stored sheet as the draft, or the smallest template (one category, one section) when the campaign has none. */
function startDraft(initial: unknown): Node {
  if (isNode(initial) && Array.isArray(initial.categories)) return { ...initial, roles: isNode(initial.roles) ? initial.roles : {} }
  const empty: Node = { categories: [], roles: {} }
  const category = { ...newCategory(empty), label: 'General', key: 'general', sections: [] as Node[] }
  const section = { ...newSection({ categories: [category] }), label: 'Principal', key: 'principal' }
  return { categories: [{ ...category, sections: [section] }], roles: {} }
}

const EMPTY_SHEET: SheetError = { path: 'categories', message: 'a sheet needs at least one category' }

export type { ReviewCharacter }

/**
 * What the review needs from the campaign to act on the saved data (DM only). The database moves or deletes the values of every
 * character and edits the saved template in one transaction, so both calls end with the saved template being replaced.
 */
export interface ReviewHost {
  characters: ReviewCharacter[]
  /** Deletes the discarded item with that key and its data from every character. */
  onPurge: (key: string) => Promise<void>
  /**
   * Saves `sheet` (the template with the item restored under new keys) and moves the data from the old keys to `renames`. The economy parts
   * of what is written always come from Sistema's side: from the stored sheet when `sheet` is a builder draft, from `sheet` when `economyOwner`.
   */
  onRestoreRenamed: (key: string, renames: Record<string, string>, sheet: Record<string, unknown>, warning: string, economyOwner?: boolean) => Promise<void>
}

interface Props {
  /** The stored `system_profile.sheet`, or anything else when the campaign has none yet. */
  initial: unknown
  /** Called with the draft whenever it changes (and once with the starting draft). */
  onChange?: (draft: unknown) => void
  /**
   * Receives the validated, normalised sheet. Without it the builder cannot be saved. Inside Ajustes the builder registers with the
   * save bar of its tab (which calls this and shows a failure thrown as `BlockSaveError`); on its own it has a Save button.
   */
  onSave?: (sheet: Record<string, unknown>, economyBase?: Record<string, unknown> | null) => Promise<unknown> | void
  /**
   * The freshest stored sheet. Its economy parts (denominations, instances, reward destination: configured in Sistema and Juegos, S8) are
   * kept in the draft as they change there, without touching what is being edited here; the save carries `economyBase`, the sheet the
   * draft was last synced with, so the host can tell an instance deleted elsewhere from one that never existed.
   */
  economy?: unknown
  /** Without it the discarded list shows the definitions only: no data, no deletion. */
  review?: ReviewHost
  /** Characters the formula workbench can try formulas on (id, name and the values the sheet reads). Without them it uses its example character. */
  testCharacters?: readonly TestCharacter[]
}

const NO_ERRORS: readonly SheetError[] = []
const NO_CHARACTERS: readonly TestCharacter[] = []
const key = (path: Path) => path.join('.')

/** An error with the key of the part whose panel shows it. */
interface Located extends DisplayError {
  owner: string
}

/** The sheet template editor: categories > sections > items and blocks, plus the roles; validated on every change. */
export function SheetBuilder({ initial, onChange, onSave, review, economy, testCharacters = NO_CHARACTERS }: Props) {
  const [draft, setDraft] = useState<Node>(() => startDraft(initial))
  const [selected, setSelected] = useState(0)
  const [pending, setPending] = useState<RemovalRequest | null>(null)
  const [saving, setSaving] = useState(false)
  const [renaming, setRenaming] = useState<Extract<RestorePlan, { ok: true }> & { key: string } | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [removalError, setRemovalError] = useState<string | null>(null)
  const [testCharacterId, selectTestCharacter] = useState<string | null>(null)
  const [current, setCurrent] = useState<string | null>(null)
  const [focusRequest, setFocusRequest] = useState<{ id: string; n: number } | null>(null)
  const panels = useRef<HTMLDivElement>(null)

  useEffect(() => onChange?.(draft), [draft, onChange])

  const validation = useMemo(() => validateSheet(draft), [draft])
  const [lastValidSheet, setLastValidSheet] = useState<Sheet | null>(null)
  if (validation.ok && validation.sheet !== lastValidSheet) setLastValidSheet(validation.sheet)
  const errors = useMemo<Located[]>(() => {
    const raw: SheetError[] = [...(validation.ok ? [] : validation.errors), ...(Array.isArray(draft.categories) && draft.categories.length === 0 ? [EMPTY_SHEET] : [])]
    return raw.map((e) => ({ ...describeSheetError(draft, e), owner: key(ownerOf(parsePath(e.path))) }))
  }, [validation, draft])
  const byOwner = useMemo(() => {
    const map = new Map<string, DisplayError[]>()
    for (const e of errors) map.set(e.owner, [...(map.get(e.owner) ?? []), e])
    return map
  }, [errors])

  // The sheet the draft started from, with the economy as it is stored now: the draft follows the economy edited elsewhere (S8), so only
  // what is edited here counts as a change.
  const latestEconomy = isNode(economy) ? economy : null
  const economyKey = latestEconomy ? JSON.stringify([economyProjection(latestEconomy), rewardKey(latestEconomy)]) : ''
  const start = useMemo(
    () => {
      const first = startDraft(initial)
      return latestEconomy && isNode(initial) ? mergeEconomy({ placement: first, economy: latestEconomy, base: initial, latest: latestEconomy }).sheet : first
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [initial, economyKey],
  )
  const synced = useRef<Node | null>(isNode(initial) ? initial : null)
  useEffect(() => {
    if (!latestEconomy) return
    const was = synced.current
    const wasKey = was ? JSON.stringify([economyProjection(was), rewardKey(was)]) : ''
    if (wasKey === economyKey) return
    synced.current = latestEconomy
    setDraft((d) => mergeEconomy({ placement: d, economy: latestEconomy, base: was, latest: latestEconomy }).sheet)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [economyKey])

  // The database acts on the SAVED template: what can be deleted is what is saved, and only while the draft equals it.
  const saved = useMemo(() => {
    const result = validateSheet(start)
    return { json: result.ok ? JSON.stringify(result.sheet) : null, keys: new Set(discardedEntries(start).map((e) => String(e.item.key))) }
  }, [start])
  const unsaved = useMemo(() => changes(start, draft), [start, draft])
  const dirty = !validation.ok || saved.json === null || JSON.stringify(validation.sheet) !== saved.json
  const entries = discardedEntries(draft)
  // S8: discarded economy instances are reviewed in Sistema › Economía; the builder lists the rest
  const listed = entries.filter((e) => !isEconomyItem(e.item))
  const economyHeld = entries.length - listed.length

  // Inside Ajustes the bottom bar of the Ficha tab saves and discards this draft; its first template has no changes to count yet.
  const hosted = useTabSaveBlock(
    onSave
      ? {
          key: 'plantilla',
          label: 'Plantilla de ficha',
          order: 10,
          dirtyCount: unsaved,
          errorCount: errors.length,
          errorReason: blockedReason(errors.length),
          savableWhenClean: !(isNode(initial) && Array.isArray(initial.categories)),
          async save() {
            if (!validation.ok || errors.length > 0) throw new BlockSaveError(blockedReason(errors.length))
            await onSave(validation.sheet as unknown as Record<string, unknown>, synced.current)
          },
          discard() {
            setDraft(start)
            setSelected(0)
            setPending(null)
            setRestoreError(null)
            setRemovalError(null)
          },
        }
      : null,
  )
  const sectionLabels = useMemo(() => {
    const labels = new Map<string, string>()
    for (const category of Array.isArray(draft.categories) ? draft.categories : []) {
      for (const sec of isNode(category) && Array.isArray(category.sections) ? category.sections : []) {
        if (isNode(sec) && typeof sec.key === 'string' && typeof sec.label === 'string') labels.set(sec.key, sec.label)
      }
    }
    return labels
  }, [draft])

  function restore(itemKey: string) {
    setRestoreError(null)
    const held = entries.find((e) => String(e.item.key) === itemKey)
    if (held && isEconomyItem(held.item)) return setRestoreError('Las instancias de economía se restauran en Sistema › Economía.')
    const plan = planRestore(draft, itemKey)
    if (!plan.ok) return setRestoreError(plan.message)
    const renamed = Object.keys(plan.renames).length > 0
    if (!renamed) return setDraft(plan.draft)
    // A new key only makes sense if the values follow it: that needs the characters (to know what moves) and an entry the database
    // already has. Otherwise the values would stay under the old key, now owned by the live item, and the warning would be false.
    if (!review) return setRestoreError('No se puede restaurar con otra clave hasta poder leer los datos de los personajes. Probá de nuevo en unos segundos.')
    if (!saved.keys.has(itemKey)) return setRestoreError('Guardá la plantilla antes de restaurar con otra clave.')
    if (!validateSheet(plan.draft).ok) return setRestoreError('La plantilla tiene errores: corregilos antes de restaurar con otra clave.')
    setRenaming({ ...plan, key: itemKey })
  }

  async function confirmRenamed() {
    if (!renaming || !review) return
    const check = validateSheet(renaming.draft)
    if (!check.ok) return setRenaming(null)
    setReviewBusy(true)
    try {
      await review.onRestoreRenamed(renaming.key, renaming.renames, check.sheet as unknown as Record<string, unknown>, renaming.warning ?? '')
    } finally {
      setReviewBusy(false)
      setRenaming(null)
    }
  }

  async function confirmDeletion() {
    if (deleting === null || !review) return
    setReviewBusy(true)
    try {
      await review.onPurge(deleting)
    } finally {
      setReviewBusy(false)
      setDeleting(null)
    }
  }

  const edit = useCallback((change: (draft: Node) => Node) => setDraft(change), [])
  const requestRemoval = useCallback(
    (list: Path, index: number) => {
      const request = describeRemoval(draft, list, index)
      if (!request) return
      // S8: the builder places the economy tables, it does not delete them: that is done in Sistema › Economía
      const part = getAt(draft, [...list, index])
      if (isNode(part) && (kindOf(list) === 'item' || kindOf(list) === 'section' || kindOf(list) === 'category') && (isEconomyItem(part) || holdsEconomy(part))) {
        return setRemovalError(
          isEconomyItem(part)
            ? 'Las instancias de economía se eliminan en Sistema › Economía.'
            : `«${request.name}» tiene instancias de economía. Eliminá antes las instancias de economía en Sistema › Economía para poder quitarla.`,
        )
      }
      const conflict = removalConflict(draft, list, index)
      setRemovalError(conflict)
      if (conflict) return
      if (request.holdsData) setPending(request)
      else setDraft((d) => removeNode(d, list, index))
    },
    [draft],
  )
  const errorsFor = useCallback((path: Path) => byOwner.get(key(path)) ?? [], [byOwner])
  const hasErrorsUnder = useCallback(
    (path: Path) => {
      const prefix = key(path)
      return [...byOwner.keys()].some((owner) => owner === prefix || owner.startsWith(`${prefix}.`))
    },
    [byOwner],
  )
  const validSheet = validation.ok ? validation.sheet : null
  const sheetErrors = validation.ok ? NO_ERRORS : validation.errors
  const api = useMemo<BuilderApi>(
    () => ({ draft, edit, requestRemoval, errorsFor, hasErrorsUnder, validSheet, lastValidSheet, sheetErrors, testCharacters, testCharacterId, selectTestCharacter }),
    [draft, edit, requestRemoval, errorsFor, hasErrorsUnder, validSheet, lastValidSheet, sheetErrors, testCharacters, testCharacterId],
  )

  // The outline takes the editor to a part: its category tab, the item opened, then focus and scroll once that is drawn.
  function navigate(path: Path) {
    const id = key(path)
    setCurrent(id)
    setSelected(Number(path[1]))
    if (path[path.length - 2] === 'items') setDraft((d) => setAt(d, [...path, '_open'], true))
    setFocusRequest((previous) => ({ id, n: (previous?.n ?? 0) + 1 }))
  }
  useEffect(() => {
    if (!focusRequest) return
    const target = panels.current?.querySelector<HTMLElement>(`[data-builder-path="${focusRequest.id}"]`)
    target?.focus()
    target?.scrollIntoView?.({ block: 'nearest' })
  }, [focusRequest])

  async function save() {
    if (!onSave || !validation.ok || errors.length > 0) return
    setSaving(true)
    try {
      await onSave(validation.sheet as unknown as Record<string, unknown>, synced.current)
    } catch (e) {
      // the host already showed why (its notice); anything else is a bug and surfaces
      if (!(e instanceof BlockSaveError || e instanceof BlockSaveCancelled)) throw e
    } finally {
      setSaving(false)
    }
  }

  return (
    <BuilderContext.Provider value={api}>
      <div className="flex flex-col gap-4">
        <SaveBar changes={unsaved} errors={errors.length} saving={saving} onSave={onSave && !hosted ? save : undefined} />
        <div className="grid gap-4 min-[720px]:grid-cols-[minmax(0,200px)_minmax(0,1fr)] min-[1100px]:grid-cols-[220px_minmax(0,1fr)_minmax(0,420px)]">
          <BuilderOutline current={current} onNavigate={navigate} />
          <div ref={panels} className="min-w-0 flex flex-col gap-4">
            <CategoryTabs selected={selected} onSelect={setSelected} />
            <RolesPanel />
            <CardPanel />
            {removalError && (
              <p role="alert" aria-label="No se pudo quitar" className="text-[13px] text-red-400">
                {removalError}
              </p>
            )}
            {listed.length > 0 && (
              <DiscardedPanel
                entries={listed}
                sectionLabels={sectionLabels}
                characters={review?.characters ?? null}
                canDelete={review !== undefined}
                savedKeys={saved.keys}
                dirty={dirty}
                error={restoreError}
                onRestore={restore}
                onDelete={setDeleting}
              />
            )}
            {economyHeld > 0 && <EconomyDiscardedNote count={economyHeld} />}
            {errors.length > 0 ? (
              <div role="alert" aria-label="Errores de la plantilla" className="text-[13px] text-red-400 flex flex-col gap-1">
                <p>{errors.length === 1 ? 'La plantilla tiene 1 error. Corregilo para poder guardar.' : `La plantilla tiene ${errors.length} errores. Corregilos para poder guardar.`}</p>
                <ul className="list-disc pl-5">
                  {errors.map((e, i) => (
                    <li key={i}>{displayLine(e)}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p role="status" className="text-[13px] text-accent-bright">
                La plantilla es válida.
              </p>
            )}
          </div>
          <div className="min-w-0 min-[720px]:col-span-2 min-[1100px]:col-span-1">
            <BuilderPreview />
          </div>
        </div>
      </div>
      {pending && (
        <ConfirmDialog
          title="Quitar de la plantilla"
          confirmLabel="Quitar"
          busyLabel="Quitando…"
          busy={false}
          error={null}
          onClose={() => setPending(null)}
          onConfirm={() => {
            setDraft((d) => removeNode(d, pending.list, pending.index))
            setPending(null)
          }}
        >
          <p>{removalMessage(pending)}</p>
        </ConfirmDialog>
      )}
      {renaming && (
        <ConfirmDialog
          title="Restaurar con otra clave"
          confirmLabel="Restaurar y guardar"
          busyLabel="Guardando…"
          busy={reviewBusy}
          error={null}
          onClose={() => setRenaming(null)}
          onConfirm={confirmRenamed}
        >
          <p>{renaming.warning}</p>
          <p>Para llevar los datos de los personajes a la clave nueva, se guardará la plantilla ahora (con todos los cambios de este borrador). Si la clave vieja sigue en uso, sus valores se copian.</p>
        </ConfirmDialog>
      )}
      {deleting !== null && (
        <ConfirmDialog
          title="Eliminar definitivamente"
          confirmLabel="Eliminar definitivamente"
          busyLabel="Eliminando…"
          busy={reviewBusy}
          error={null}
          onClose={() => setDeleting(null)}
          onConfirm={confirmDeletion}
        >
          <p>{deletionMessage(entries, review?.characters ?? [], deleting)}</p>
        </ConfirmDialog>
      )}
    </BuilderContext.Provider>
  )
}
