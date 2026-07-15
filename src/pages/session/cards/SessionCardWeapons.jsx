import SessionCardShell from './SessionCardShell'
import PJSubsection from './PJSubsection'
import EmptyPjsState from './EmptyPjsState'

function AtaquesList({ ataques }) {
  return (
    <ul className="space-y-1">
      {ataques.map(a => (
        <li key={a.id} className="flex flex-wrap items-baseline gap-2 text-[11px] text-txt-secondary">
          <span className="text-txt-primary font-medium">{a.nombre}</span>
          <span className="text-accent-dim font-semibold">{a.bono_ataque}</span>
          <span>{a.dano} {a.tipo_dano}</span>
          {a.alcance && <span className="text-txt-muted">{a.alcance}</span>}
        </li>
      ))}
    </ul>
  )
}

export default function SessionCardWeapons({ db, onEdit, onRemove }) {
  const pjs = db?.pjs ?? []

  return (
    <SessionCardShell title="Armas" onRemove={onRemove}>
      {pjs.length === 0 ? (
        <EmptyPjsState />
      ) : (
        <div className="space-y-3">
          {pjs.map(pj => {
            const ataques = pj.ataques ?? []
            const portando = ataques.filter(a => a.portando !== false)
            const guardado = ataques.filter(a => a.portando === false)
            return (
              <PJSubsection key={pj.id} pj={pj} onEdit={onEdit}>
                {ataques.length === 0 ? (
                  <div className="text-[11px] text-txt-muted">Sin armas registradas.</div>
                ) : (
                  <>
                    {portando.length > 0 && (
                      <div className="mb-1.5">
                        <div className="font-exo text-[9px] font-semibold tracking-[0.15em] uppercase text-txt-muted mb-1">Portando</div>
                        <AtaquesList ataques={portando} />
                      </div>
                    )}
                    {guardado.length > 0 && (
                      <div>
                        <div className="font-exo text-[9px] font-semibold tracking-[0.15em] uppercase text-txt-muted mb-1">Guardado</div>
                        <AtaquesList ataques={guardado} />
                      </div>
                    )}
                  </>
                )}
              </PJSubsection>
            )
          })}
        </div>
      )}
    </SessionCardShell>
  )
}
