import { useCallback, useEffect, useMemo, useState } from 'react'
import { btnPrimary } from '../../../constants'
import { ConfirmDialog } from '../../sections/ajustes/ConfirmDialog'
import { validateSheet, type DiscardedItem, type SheetError } from '../sheet/sheetModel'
import { BuilderContext, type BuilderApi } from './builderContext'
import { CategoryTabs } from './CategoryTabs'
import { discardedEntries, planRestore, type RestorePlan } from './discard'
import { DiscardedPanel, type ReviewCharacter } from './DiscardedPanel'
import { heldKeys } from './discardedValues'
import { isNode, parsePath, type Node, type Path } from './draft'
import { describeSheetError, displayLine, ownerOf, type DisplayError } from './errorsEs'
import { newCategory, newSection } from './factories'
import { describeRemoval, removalMessage, removeNode, type RemovalRequest } from './removal'
import { RolesPanel } from './RolesPanel'

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
  /** Saves `sheet` (the template with the item restored under new keys) and moves the data from the old keys to `renames`. */
  onRestoreRenamed: (key: string, renames: Record<string, string>, sheet: Record<string, unknown>, warning: string) => Promise<void>
}

interface Props {
  /** The stored `system_profile.sheet`, or anything else when the campaign has none yet. */
  initial: unknown
  /** Called with the draft whenever it changes (and once with the starting draft). */
  onChange?: (draft: unknown) => void
  /** Receives the validated, normalised sheet. Without it the builder has no Save button. */
  onSave?: (sheet: Record<string, unknown>) => Promise<unknown> | void
  /** Without it the discarded list shows the definitions only: no data, no deletion. */
  review?: ReviewHost
}

const key = (path: Path) => path.join('.')

/** An error with the key of the part whose panel shows it. */
interface Located extends DisplayError {
  owner: string
}

/** The sheet template editor: categories > sections > items and blocks, plus the roles; validated on every change. */
export function SheetBuilder({ initial, onChange, onSave, review }: Props) {
  const [draft, setDraft] = useState<Node>(() => startDraft(initial))
  const [selected, setSelected] = useState(0)
  const [pending, setPending] = useState<RemovalRequest | null>(null)
  const [saving, setSaving] = useState(false)
  const [renaming, setRenaming] = useState<Extract<RestorePlan, { ok: true }> & { key: string } | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [restoreNote, setRestoreNote] = useState<string | null>(null)

  useEffect(() => onChange?.(draft), [draft, onChange])

  const validation = useMemo(() => validateSheet(draft), [draft])
  const errors = useMemo<Located[]>(() => {
    const raw: SheetError[] = [...(validation.ok ? [] : validation.errors), ...(Array.isArray(draft.categories) && draft.categories.length === 0 ? [EMPTY_SHEET] : [])]
    return raw.map((e) => ({ ...describeSheetError(draft, e), owner: key(ownerOf(parsePath(e.path))) }))
  }, [validation, draft])
  const byOwner = useMemo(() => {
    const map = new Map<string, DisplayError[]>()
    for (const e of errors) map.set(e.owner, [...(map.get(e.owner) ?? []), e])
    return map
  }, [errors])

  // The database acts on the SAVED template: what can be deleted is what is saved, and only while the draft equals it.
  const saved = useMemo(() => {
    const start = startDraft(initial)
    const result = validateSheet(start)
    return { json: result.ok ? JSON.stringify(result.sheet) : null, keys: new Set(discardedEntries(start).map((e) => String(e.item.key))) }
  }, [initial])
  const dirty = !validation.ok || saved.json === null || JSON.stringify(validation.sheet) !== saved.json
  const entries = discardedEntries(draft)
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
    setRestoreNote(null)
    const plan = planRestore(draft, itemKey)
    if (!plan.ok) return setRestoreError(plan.message)
    const renamed = Object.keys(plan.renames).length > 0
    // The data can only move when the database knows the entry (it was saved) and the template can be saved right away.
    if (!renamed || !review || !saved.keys.has(itemKey)) {
      setDraft(plan.draft)
      setRestoreNote(plan.warning)
      return
    }
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
  const api = useMemo<BuilderApi>(() => ({ draft, edit, requestRemoval, errorsFor, hasErrorsUnder }), [draft, edit, requestRemoval, errorsFor, hasErrorsUnder])

  async function save() {
    if (!onSave || !validation.ok || errors.length > 0) return
    setSaving(true)
    try {
      await onSave(validation.sheet as unknown as Record<string, unknown>)
    } finally {
      setSaving(false)
    }
  }

  return (
    <BuilderContext.Provider value={api}>
      <div className="flex flex-col gap-4">
        <CategoryTabs selected={selected} onSelect={setSelected} />
        <RolesPanel />
        {restoreNote && (
          <p role="status" aria-label="Aviso de restauración" className="text-[13px] text-accent-bright">
            {restoreNote}
          </p>
        )}
        {entries.length > 0 && (
          <DiscardedPanel
            entries={entries}
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
        {onSave && (
          <div>
            <button type="button" className={`${btnPrimary} disabled:opacity-40 disabled:cursor-not-allowed`} disabled={errors.length > 0 || saving} onClick={save}>
              {saving ? 'Guardando…' : 'Guardar plantilla'}
            </button>
          </div>
        )}
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

function deletionMessage(entries: ReturnType<typeof discardedEntries>, characters: ReviewCharacter[], key: string): string {
  const entry = entries.find((e) => String(e.item.key) === key)
  const item = (entry?.item ?? {}) as unknown as DiscardedItem
  const label = typeof (item as { label?: unknown }).label === 'string' ? (item as { label: string }).label : key
  const holders = characters.filter((c) => heldKeys(item, c.values).length > 0).length
  const who = holders === 0 ? 'ningún personaje tiene datos guardados' : holders === 1 ? 'se borran los datos de 1 personaje' : `se borran los datos de ${holders} personajes`
  return `Eliminar «${label}» para siempre: ${who}. Esta acción no se puede deshacer.`
}
