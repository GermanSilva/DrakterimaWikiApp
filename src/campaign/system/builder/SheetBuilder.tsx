import { useCallback, useEffect, useMemo, useState } from 'react'
import { btnPrimary } from '../../../constants'
import { ConfirmDialog } from '../../sections/ajustes/ConfirmDialog'
import { validateSheet, type SheetError } from '../sheet/sheetModel'
import { BuilderContext, type BuilderApi } from './builderContext'
import { CategoryTabs } from './CategoryTabs'
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

interface Props {
  /** The stored `system_profile.sheet`, or anything else when the campaign has none yet. */
  initial: unknown
  /** Called with the draft whenever it changes (and once with the starting draft). */
  onChange?: (draft: unknown) => void
  /** Receives the validated, normalised sheet. Without it the builder has no Save button. */
  onSave?: (sheet: Record<string, unknown>) => Promise<unknown> | void
}

const key = (path: Path) => path.join('.')

/** An error with the key of the part whose panel shows it. */
interface Located extends DisplayError {
  owner: string
}

/** The sheet template editor: categories > sections > items and blocks, plus the roles; validated on every change. */
export function SheetBuilder({ initial, onChange, onSave }: Props) {
  const [draft, setDraft] = useState<Node>(() => startDraft(initial))
  const [selected, setSelected] = useState(0)
  const [pending, setPending] = useState<RemovalRequest | null>(null)
  const [saving, setSaving] = useState(false)

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
    </BuilderContext.Provider>
  )
}
