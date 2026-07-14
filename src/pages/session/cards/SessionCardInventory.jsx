import SessionCardShell from './SessionCardShell'
import PJSubsection from './PJSubsection'
import EmptyPjsState from './EmptyPjsState'

const CURRENCY = [
  { key: 'pp', label: 'PP' },
  { key: 'gp', label: 'GP' },
  { key: 'ep', label: 'EP' },
  { key: 'sp', label: 'SP' },
  { key: 'cp', label: 'CP' },
]

function MonedasRow({ label, monedas }) {
  const hasAny = CURRENCY.some(c => (monedas[c.key] ?? 0) > 0)
  if (!hasAny) return null
  return (
    <div className="flex items-center gap-3 text-[11px] mb-1">
      <span className="text-txt-muted uppercase tracking-[0.1em] text-[9px] shrink-0">{label}</span>
      {CURRENCY.map(c => (monedas[c.key] ?? 0) > 0 && (
        <span key={c.key} className="text-txt-secondary">
          <span className="text-txt-primary font-semibold">{monedas[c.key]}</span> {c.label}
        </span>
      ))}
    </div>
  )
}

const THEAD_CLS = 'text-left font-exo text-[9px] font-semibold tracking-[0.15em] uppercase text-txt-muted pb-1 pr-3'
const GROUP_ROW_CLS = 'text-left font-exo text-[9px] font-semibold tracking-[0.15em] uppercase text-txt-muted pt-2 pb-1'

function EquipoTable({ portando, guardado }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px] text-txt-secondary border-collapse">
        <thead>
          <tr className="border-b border-border-base">
            <th className={THEAD_CLS}>Nombre</th>
            <th className={THEAD_CLS}>Cantidad</th>
            <th className={THEAD_CLS}>Descripción</th>
          </tr>
        </thead>
        <tbody>
          {portando.length > 0 && (
            <>
              <tr>
                <th colSpan={3} className={GROUP_ROW_CLS}>Portando</th>
              </tr>
              {portando.map(item => (
                <tr key={item.id} className="border-t border-border-base">
                  <td className="text-txt-primary font-medium py-1 pr-3">{item.nombre}</td>
                  <td className="py-1 pr-3">{item.cantidad ?? 1}</td>
                  <td className="text-txt-muted py-1">{item.descripcion}</td>
                </tr>
              ))}
            </>
          )}
          {guardado.length > 0 && (
            <>
              <tr>
                <th colSpan={3} className={GROUP_ROW_CLS}>Guardado</th>
              </tr>
              {guardado.map(item => (
                <tr key={item.id} className="border-t border-border-base">
                  <td className="text-txt-primary font-medium py-1 pr-3">{item.nombre}</td>
                  <td className="py-1 pr-3">{item.cantidad ?? 1}</td>
                  <td className="text-txt-muted py-1">{item.descripcion}</td>
                </tr>
              ))}
            </>
          )}
        </tbody>
      </table>
    </div>
  )
}

export default function SessionCardInventory({ db, onEdit, onRemove }) {
  const pjs = db?.pjs ?? []

  return (
    <SessionCardShell title="Inventario" onRemove={onRemove}>
      {pjs.length === 0 ? (
        <EmptyPjsState />
      ) : (
        <div className="space-y-3">
          {pjs.map(pj => {
            const equipo = pj.equipo ?? []
            const monedas = pj.monedas ?? {}
            const monedasGuardado = pj.monedas_guardado ?? {}
            const portando = equipo.filter(i => i.portando !== false)
            const guardado = equipo.filter(i => i.portando === false)
            return (
              <PJSubsection key={pj.id} pj={pj} onEdit={onEdit}>
                <MonedasRow label="En mano" monedas={monedas} />
                <MonedasRow label="Guardadas" monedas={monedasGuardado} />
                {equipo.length === 0 ? (
                  <div className="text-[11px] text-txt-muted mt-1">Sin objetos registrados.</div>
                ) : (
                  <div className="mt-1.5">
                    <EquipoTable portando={portando} guardado={guardado} />
                  </div>
                )}
              </PJSubsection>
            )
          })}
        </div>
      )}
    </SessionCardShell>
  )
}
