import { useState } from 'react'
import { btnSecondary } from '../../../constants'
import type { FlatEntity, LinkedAction } from '../../../data'
import { useLinkedActions } from '../../../campaign/system/actions/useLinkedActions'
import { ActionRunDialog } from '../actions/ActionRunDialog'
import { ActionUndoDialog } from '../actions/ActionUndoDialog'
import { useSessionActions, useSessionHistory, type HistoryItem } from '../actions/sessionActions'
import EmptyPjsState from './EmptyPjsState'
import PJSubsection from './PJSubsection'
import SessionCardShell from './SessionCardShell'

function CharacterActions({ pj, onUse }: { pj: FlatEntity; onUse: (linked: LinkedAction) => void }) {
  const api = useSessionActions()
  const { linked, error } = useLinkedActions(api.repo, pj.id, true, pj.updated_at)
  const usable = linked.filter((l) => l.action.function !== null && l.action.function !== undefined)
  if (error && usable.length === 0) return <div className="text-[11px] text-accent-bright">No se pudieron leer las acciones.</div>
  if (usable.length === 0) return <div className="text-[11px] text-txt-muted">Sin acciones con función.</div>
  return (
    <ul className="divide-y divide-border-base border border-border-base">
      {usable.map((entry) => (
        <li key={entry.action.id} className="flex items-center justify-between gap-3 px-2 py-1.5">
          <div className="min-w-0">
            <div className="text-[13px] text-txt-primary truncate">{entry.action.name}</div>
            {entry.action.category !== '' && <div className="text-[11px] text-txt-muted truncate">{entry.action.category}</div>}
          </div>
          <button type="button" className={btnSecondary} aria-label={`Usar ${entry.action.name}`} onClick={() => onUse(entry)}>
            Usar
          </button>
        </li>
      ))}
    </ul>
  )
}

/** What this screen applied so far, newest first, each with its Deshacer (S22). */
function AppliedList({ onUndo }: { onUndo: (item: HistoryItem) => void }) {
  const history = useSessionHistory()
  if (history.length === 0) return null
  return (
    <div className="mt-4">
      <div className="font-exo text-[10px] tracking-[0.2em] uppercase text-txt-muted mb-1.5">Acciones aplicadas</div>
      <ul aria-label="Acciones aplicadas" className="divide-y divide-border-base border border-border-base">
        {history.map((item) => (
          <li key={item.id} data-name={`${item.pjName} · ${item.actionName}`} className="flex items-center justify-between gap-3 px-2 py-1.5">
            <div className="min-w-0 text-[13px] text-txt-primary truncate">
              {item.pjName} · {item.actionName}
            </div>
            <button type="button" className={btnSecondary} aria-label={`Deshacer ${item.actionName} de ${item.pjName}`} onClick={() => onUndo(item)}>
              Deshacer
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** DM session card: each character's linked actions that have a function, with a Usar button (S22). */
export default function SessionCardActions({ db, onRemove }: { db?: { pjs?: FlatEntity[] }; onRemove?: () => void }) {
  const pjs = db?.pjs ?? []
  const [running, setRunning] = useState<{ pj: FlatEntity; linked: LinkedAction } | null>(null)
  const [undoing, setUndoing] = useState<HistoryItem | null>(null)
  const [collapsedIds, setCollapsedIds] = useState(() => new Set(pjs.map((pj) => pj.id)))
  const allExpanded = pjs.length > 0 && pjs.every((pj) => !collapsedIds.has(pj.id))
  const toggleAll = () => setCollapsedIds(allExpanded ? new Set(pjs.map((pj) => pj.id)) : new Set())
  const toggleOne = (id: number) =>
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <SessionCardShell title="Acciones" onRemove={onRemove} onToggleAll={pjs.length > 0 ? toggleAll : undefined} allExpanded={allExpanded}>
      {pjs.length === 0 ? (
        <EmptyPjsState />
      ) : (
        <div className="space-y-3">
          {pjs.map((pj) => (
            <PJSubsection key={pj.id} pj={pj} onEdit={undefined} hideEdit collapsed={collapsedIds.has(pj.id)} onToggleCollapsed={() => toggleOne(pj.id)}>
              <CharacterActions pj={pj} onUse={(linked) => setRunning({ pj, linked })} />
            </PJSubsection>
          ))}
        </div>
      )}
      <AppliedList onUndo={setUndoing} />
      {undoing && <ActionUndoDialog item={undoing} onClose={() => setUndoing(null)} />}
      {running && <ActionRunDialog pj={{ id: running.pj.id, nombre: String(running.pj.nombre ?? '') }} linked={running.linked} onClose={() => setRunning(null)} />}
    </SessionCardShell>
  )
}
