import { Star } from 'lucide-react'
import SessionCardShell from './SessionCardShell'
import PJSubsection from './PJSubsection'
import EmptyPjsState from './EmptyPjsState'

export default function SessionCardInspiration({ db, onEdit }) {
  const pjs = db?.pjs ?? []

  return (
    <SessionCardShell title="Inspiración">
      {pjs.length === 0 ? (
        <EmptyPjsState />
      ) : (
        <div className="space-y-3">
          {pjs.map(pj => (
            <PJSubsection key={pj.id} pj={pj} onEdit={onEdit}>
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
