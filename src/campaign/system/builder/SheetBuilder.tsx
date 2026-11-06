import { useCallback, useMemo, useState } from 'react'
import { ConfirmDialog } from '../../sections/ajustes/ConfirmDialog'
import { BuilderContext, type BuilderApi } from './builderContext'
import { CategoryTabs } from './CategoryTabs'
import { isNode, type Node } from './draft'
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

interface Props {
  /** The stored `system_profile.sheet`, or anything else when the campaign has none yet. */
  initial: unknown
}

/** The sheet template editor: categories > sections > items and blocks, plus the roles. Pure UI over a draft. */
export function SheetBuilder({ initial }: Props) {
  const [draft, setDraft] = useState<Node>(() => startDraft(initial))
  const [selected, setSelected] = useState(0)
  const [pending, setPending] = useState<RemovalRequest | null>(null)

  const edit = useCallback((change: (draft: Node) => Node) => setDraft(change), [])
  const requestRemoval = useCallback(
    (list: readonly (string | number)[], index: number) => {
      const request = describeRemoval(draft, list, index)
      if (!request) return
      if (request.holdsData) setPending(request)
      else setDraft((d) => removeNode(d, list, index))
    },
    [draft],
  )
  const api = useMemo<BuilderApi>(() => ({ draft, edit, requestRemoval }), [draft, edit, requestRemoval])

  return (
    <BuilderContext.Provider value={api}>
      <div className="flex flex-col gap-4">
        <CategoryTabs selected={selected} onSelect={setSelected} />
        <RolesPanel />
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
