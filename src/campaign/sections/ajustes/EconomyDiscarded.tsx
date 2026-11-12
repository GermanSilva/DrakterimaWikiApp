import { useMemo, useState } from 'react'
import { discardedEntries, planRestore, type RestorePlan } from '../../system/builder/discard'
import { deletionMessage, DiscardedPanel } from '../../system/builder/DiscardedPanel'
import { isNode, type Node } from '../../system/builder/draft'
import { isEconomyItem } from '../../system/builder/economy'
import type { ReviewHost } from '../../system/builder/SheetBuilder'
import { validateSheet } from '../../system/sheet/sheetModel'
import { ConfirmDialog } from './ConfirmDialog'

interface Props {
  /** The Sistema draft of the sheet (the economy being edited). */
  sheet: Node
  /** The stored sheet the draft started from: only its discarded entries exist in the database. */
  stored: Node | null
  /** Characters and the DM-only RPCs; absent until the characters have been read. */
  review: ReviewHost | undefined
  /** The Sistema block has unsaved changes: the RPCs act on the SAVED document, so they wait. */
  dirty: boolean
  onChange: (next: Node) => void
}

const nodes = (value: unknown): Node[] => (Array.isArray(value) ? value.filter(isNode) : [])

/**
 * Sistema › Economía › Instancias descartadas (S8, S26): the economy tables the DM removed while characters hold amounts in them.
 * Review what each character holds, restore one into its section (a draft edit saved with the Sistema block, or the rekey RPC when a
 * live table took its key) or delete it for good (the purge RPC, an immediate action on the saved document).
 */
export function EconomyDiscarded({ sheet, stored, review, dirty, onChange }: Props) {
  const [renaming, setRenaming] = useState<(Extract<RestorePlan, { ok: true }> & { key: string }) | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const entries = useMemo(() => discardedEntries(sheet).filter((e) => isEconomyItem(e.item)), [sheet])
  const savedKeys = useMemo(() => new Set(discardedEntries(stored ?? {}).map((e) => String(e.item.key))), [stored])
  const sectionLabels = useMemo(() => {
    const labels = new Map<string, string>()
    for (const category of nodes(sheet.categories)) for (const section of nodes(category.sections)) if (typeof section.key === 'string' && typeof section.label === 'string') labels.set(section.key, section.label)
    return labels
  }, [sheet])
  if (entries.length === 0 && renaming === null && deleting === null) return null

  function restore(key: string) {
    setError(null)
    const plan = planRestore(sheet, key)
    if (!plan.ok) return setError(plan.message)
    if (Object.keys(plan.renames).length === 0) return onChange(plan.draft)
    // A new key only makes sense if the values follow it: that needs the characters, an entry the database already has and a draft equal to
    // what is saved (the RPC writes the saved document and the form is rebuilt from it).
    if (!review) return setError('No se puede restaurar con otra clave hasta poder leer los datos de los personajes. Probá de nuevo en unos segundos.')
    if (!savedKeys.has(key)) return setError('Guardá el sistema antes de restaurar con otra clave.')
    if (dirty) return setError('Guardá o descartá los cambios de Sistema antes de restaurar con otra clave.')
    if (!validateSheet(plan.draft).ok) return setError('La plantilla tiene errores: corregilos antes de restaurar con otra clave.')
    setRenaming({ ...plan, key })
  }

  async function confirmRenamed() {
    if (!renaming || !review) return
    const check = validateSheet(renaming.draft)
    if (!check.ok) return setRenaming(null)
    setBusy(true)
    try {
      await review.onRestoreRenamed(renaming.key, renaming.renames, check.sheet as unknown as Record<string, unknown>, renaming.warning ?? '', true)
    } finally {
      setBusy(false)
      setRenaming(null)
    }
  }

  async function confirmDeletion() {
    if (deleting === null || !review) return
    setBusy(true)
    try {
      await review.onPurge(deleting)
    } finally {
      setBusy(false)
      setDeleting(null)
    }
  }

  return (
    <>
      {entries.length > 0 && (
        <DiscardedPanel
          title="Instancias descartadas"
          unsavedHint="Guardá el sistema antes de eliminar."
          entries={entries}
          sectionLabels={sectionLabels}
          characters={review?.characters ?? null}
          canDelete={review !== undefined}
          savedKeys={savedKeys}
          dirty={dirty}
          error={error}
          onRestore={restore}
          onDelete={setDeleting}
        />
      )}
      {renaming && (
        <ConfirmDialog title="Restaurar con otra clave" confirmLabel="Restaurar y guardar" busyLabel="Guardando…" busy={busy} error={null} onClose={() => setRenaming(null)} onConfirm={confirmRenamed}>
          <p>{renaming.warning}</p>
          <p>Para llevar los datos de los personajes a la clave nueva, se guardará el sistema ahora. Si la clave vieja sigue en uso, sus valores se copian.</p>
        </ConfirmDialog>
      )}
      {deleting !== null && (
        <ConfirmDialog
          title="Eliminar definitivamente"
          confirmLabel="Eliminar definitivamente"
          busyLabel="Eliminando…"
          busy={busy}
          error={null}
          onClose={() => setDeleting(null)}
          onConfirm={confirmDeletion}
        >
          <p>{deletionMessage(entries, review?.characters ?? [], deleting)}</p>
        </ConfirmDialog>
      )}
    </>
  )
}
