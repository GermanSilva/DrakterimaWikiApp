import SessionCardShell from './SessionCardShell'
import PJSubsection from './PJSubsection'
import EmptyPjsState from './EmptyPjsState'

const THEAD_CLS = 'text-left font-exo text-[9px] font-semibold tracking-[0.15em] uppercase text-txt-muted pb-1 pr-3'
const GROUP_ROW_CLS = 'text-left font-exo text-[9px] font-semibold tracking-[0.15em] uppercase text-txt-muted pt-2 pb-1'

function AtaquesTable({ portando, guardado }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px] text-txt-secondary border-collapse">
        <thead>
          <tr className="border-b border-border-base">
            <th className={THEAD_CLS}>Nombre</th>
            <th className={THEAD_CLS}>Bono</th>
            <th className={THEAD_CLS}>Daño</th>
            <th className={THEAD_CLS}>Tipo</th>
            <th className={THEAD_CLS}>Alcance</th>
          </tr>
        </thead>
        <tbody>
          {portando.length > 0 && (
            <>
              <tr>
                <th colSpan={5} className={GROUP_ROW_CLS}>Portando</th>
              </tr>
              {portando.map(a => (
                <tr key={a.id} className="border-t border-border-base">
                  <td className="text-txt-primary font-medium py-1 pr-3">{a.nombre}</td>
                  <td className="text-accent-dim font-semibold py-1 pr-3">{a.bono_ataque}</td>
                  <td className="py-1 pr-3">{a.dano}</td>
                  <td className="py-1 pr-3">{a.tipo_dano}</td>
                  <td className="text-txt-muted py-1">{a.alcance}</td>
                </tr>
              ))}
            </>
          )}
          {guardado.length > 0 && (
            <>
              <tr>
                <th colSpan={5} className={GROUP_ROW_CLS}>Guardado</th>
              </tr>
              {guardado.map(a => (
                <tr key={a.id} className="border-t border-border-base">
                  <td className="text-txt-primary font-medium py-1 pr-3">{a.nombre}</td>
                  <td className="text-accent-dim font-semibold py-1 pr-3">{a.bono_ataque}</td>
                  <td className="py-1 pr-3">{a.dano}</td>
                  <td className="py-1 pr-3">{a.tipo_dano}</td>
                  <td className="text-txt-muted py-1">{a.alcance}</td>
                </tr>
              ))}
            </>
          )}
        </tbody>
      </table>
    </div>
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
                  <AtaquesTable portando={portando} guardado={guardado} />
                )}
              </PJSubsection>
            )
          })}
        </div>
      )}
    </SessionCardShell>
  )
}
