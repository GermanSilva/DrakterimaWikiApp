import { useState } from 'react'
import { Star } from 'lucide-react'
import SessionCardShell from './SessionCardShell'
import PJSubsection from './PJSubsection'
import EmptyPjsState from './EmptyPjsState'

export default function SessionCardInspiration({ db, onEdit, onRemove }) {
  const pjs = db?.pjs ?? []
  const [collapsedIds, setCollapsedIds] = useState(() => new Set(pjs.map(pj => pj.id)))
  const allExpanded = pjs.length > 0 && pjs.every(pj => !collapsedIds.has(pj.id))
  const toggleAll = () => setCollapsedIds(allExpanded ? new Set(pjs.map(pj => pj.id)) : new Set())
  const toggleOne = (pjId) => setCollapsedIds(prev => {
    const next = new Set(prev)
    next.has(pjId) ? next.delete(pjId) : next.add(pjId)
    return next
  })

  return (
    <SessionCardShell title="Inspiración" onRemove={onRemove} onToggleAll={pjs.length > 0 ? toggleAll : undefined} allExpanded={allExpanded}>
      {pjs.length === 0 ? (
        <EmptyPjsState />
      ) : (
        <div className="space-y-3">
          {pjs.map(pj => (
            <PJSubsection key={pj.id} pj={pj} onEdit={onEdit} collapsed={collapsedIds.has(pj.id)} onToggleCollapsed={() => toggleOne(pj.id)}>
              <div className="flex items-center gap-2">
                <Star size={16} className={pj.stat_inspiration ? 'text-accent-bright fill-accent-bright' : 'text-txt-muted'} />
                <span className={`text-[12px] ${pj.stat_inspiration ? 'text-accent-dim font-semibold' : 'text-txt-muted'}`}>
                  {pj.stat_inspiration ? 'Con inspiración' : 'Sin inspiración'}
                </span>
              </div>
            </PJSubsection>
          ))}
        </div>
      )}
    </SessionCardShell>
  )
}
