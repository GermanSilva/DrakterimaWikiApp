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

function EquipoList({ items }) {
  return (
    <ul className="space-y-0.5">
      {items.map(item => (
        <li key={item.id} className="flex flex-wrap gap-2 text-[11px] text-txt-secondary">
          <span className="text-txt-primary font-medium">{item.nombre}</span>
          {item.cantidad > 1 && <span className="text-txt-muted">×{item.cantidad}</span>}
        </li>
      ))}
    </ul>
  )
}

export default function SessionCardInventory({ db, onEdit }) {
  const pjs = db?.pjs ?? []

  return (
    <SessionCardShell title="Inventario">
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
                    {portando.length > 0 && (
                      <div className="mb-1.5">
                        <div className="font-exo text-[9px] font-semibold tracking-[0.15em] uppercase text-txt-muted mb-1">Portando</div>
                        <EquipoList items={portando} />
                      </div>
                    )}
                    {guardado.length > 0 && (
                      <div>
                        <div className="font-exo text-[9px] font-semibold tracking-[0.15em] uppercase text-txt-muted mb-1">Guardado</div>
                        <EquipoList items={guardado} />
                      </div>
                    )}
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
