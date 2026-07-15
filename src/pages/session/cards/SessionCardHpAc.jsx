import SessionCardShell from './SessionCardShell'
import PJSubsection from './PJSubsection'
import EmptyPjsState from './EmptyPjsState'

function StatBadge({ label, value }) {
  return (
    <div className="text-center bg-bg-mid border border-border-base px-4 py-2 min-w-[64px]">
      <div className="font-exo text-[10px] text-txt-muted uppercase">{label}</div>
      <div className="font-exo text-[20px] font-bold text-txt-primary">{value}</div>
    </div>
  )
}

export default function SessionCardHpAc({ db, onEdit, onRemove }) {
  const pjs = db?.pjs ?? []

  return (
    <SessionCardShell title="HP y AC" onRemove={onRemove}>
      {pjs.length === 0 ? (
        <EmptyPjsState />
      ) : (
        <div className="space-y-3">
          {pjs.map(pj => (
            <PJSubsection key={pj.id} pj={pj} onEdit={onEdit}>
              <div className="flex gap-3">
                <StatBadge label="HP Máx." value={pj.stat_hp > 0 ? pj.stat_hp : '—'} />
                <StatBadge label="AC" value={pj.stat_ac > 0 ? pj.stat_ac : '—'} />
              </div>
            </PJSubsection>
          ))}
        </div>
      )}
    </SessionCardShell>
  )
}
