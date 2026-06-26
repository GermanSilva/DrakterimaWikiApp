import { sectionTitleCls, detailSectionCls } from '../../../constants'

const CURRENCY = [
  { key: 'pp', label: 'Platino' },
  { key: 'gp', label: 'Oro' },
  { key: 'ep', label: 'Electrum' },
  { key: 'sp', label: 'Plata' },
  { key: 'cp', label: 'Bronce' },
]

const TO_CP = { pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1 }

function calcTotalCP(equipo, ataques) {
  return [...equipo, ...ataques].reduce((sum, item) => {
    const precio = parseInt(item.precio) || 0
    if (!precio) return sum
    const cantidad = parseInt(item.cantidad) || 1
    const rate = TO_CP[item.precio_moneda] ?? TO_CP.gp
    return sum + precio * cantidad * rate
  }, 0)
}

function formatTotalCP(totalCp) {
  if (totalCp === 0) return null
  const parts = []
  let rem = totalCp
  const denoms = [
    { val: 1000, label: 'platino' },
    { val: 100, label: 'oro' },
    { val: 10, label: 'plata' },
    { val: 1, label: 'bronce' },
  ]
  for (const d of denoms) {
    const n = Math.floor(rem / d.val)
    if (n > 0) { parts.push(`${n} ${d.label}`); rem -= n * d.val }
  }
  return parts.join(' ')
}

function MonedasDisplay({ label, monedas }) {
  const hasAny = CURRENCY.some(c => (monedas[c.key] ?? 0) > 0)
  if (!hasAny) return null
  return (
    <div>
      <div className="font-exo text-[10px] font-semibold tracking-[0.15em] uppercase text-txt-muted mb-2">{label}</div>
      <div className="flex gap-4 flex-wrap mb-3">
        {CURRENCY.map(c => (monedas[c.key] ?? 0) > 0 && (
          <div key={c.key} className="text-center">
            <div className="font-exo text-[10px] text-txt-muted mb-0.5">{c.label}</div>
            <div className="font-exo text-[16px] font-bold text-txt-primary">{monedas[c.key]}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EquipoSublist({ items, label, subtotalStr }) {
  if (items.length === 0) return null
  return (
    <div className="mb-3">
      <div className="font-exo text-[10px] font-semibold tracking-[0.15em] uppercase text-txt-muted mb-1">{label}</div>
      <ul className="space-y-1 mb-1">
        {items.map(item => (
          <li key={item.id} className="flex gap-3 text-[13px] text-txt-secondary">
            <span className="text-txt-primary font-medium flex-1">{item.nombre}</span>
            {item.cantidad > 1 && <span className="text-txt-muted">×{item.cantidad}</span>}
            {item.descripcion && <span className="text-txt-muted">— {item.descripcion}</span>}
            {(parseInt(item.precio) > 0) && (
              <span className="text-txt-muted shrink-0">{item.precio} {item.precio_moneda ?? 'gp'}</span>
            )}
          </li>
        ))}
      </ul>
      {subtotalStr && (
        <div className="text-[11px] text-txt-muted">
          Subtotal: <span className="text-txt-primary font-semibold">{subtotalStr}</span>
        </div>
      )}
    </div>
  )
}

export default function PJEquipmentSection({ pj }) {
  const equipo = pj.equipo ?? []
  const monedas = pj.monedas ?? {}
  const monedas_guardado = pj.monedas_guardado ?? {}
  const hasMonedas = CURRENCY.some(c => (monedas[c.key] ?? 0) > 0)
  const hasMonedasGuardado = CURRENCY.some(c => (monedas_guardado[c.key] ?? 0) > 0)

  const portando = equipo.filter(i => i.portando !== false)
  const guardado = equipo.filter(i => i.portando === false)
  const ataquesPortando = (pj.ataques ?? []).filter(a => a.portando !== false)
  const ataquesGuardado = (pj.ataques ?? []).filter(a => a.portando === false)
  const subtotalPortandoStr = formatTotalCP(calcTotalCP(portando, ataquesPortando))
  const subtotalGuardadoStr = formatTotalCP(calcTotalCP(guardado, ataquesGuardado))
  const totalStr = formatTotalCP(calcTotalCP(equipo, pj.ataques ?? []))

  return (
    <div id="pj-section-equipo" className={detailSectionCls}>
      <div className={sectionTitleCls}>Equipo</div>
      {equipo.length > 0 && (
        <>
          <EquipoSublist items={portando} label="Portando" subtotalStr={subtotalPortandoStr} />
          <EquipoSublist items={guardado} label="Guardado" subtotalStr={subtotalGuardadoStr} />
          {totalStr && (
            <div className="text-[12px] text-txt-muted border-t border-border-base/30 pt-2 mt-1">
              Valor total del inventario: <span className="text-txt-primary font-semibold">{totalStr}</span>
            </div>
          )}
        </>
      )}
      {(hasMonedas || hasMonedasGuardado) && (
        <div className="pt-2 border-t border-border-base">
          <MonedasDisplay label="En mano" monedas={monedas} />
          <MonedasDisplay label="Guardadas" monedas={monedas_guardado} />
        </div>
      )}
    </div>
  )
}
