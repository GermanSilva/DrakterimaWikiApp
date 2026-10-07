import { sectionTitleCls, detailSectionCls } from '../../../constants'
import UnreadDot from '../../../components/UnreadDot'
import { calcTotalCP, formatTotalCP } from '../../../helpers/pjInventory'

const CURRENCY = [
  { key: 'pp', label: 'Platino' },
  { key: 'gp', label: 'Oro' },
  { key: 'ep', label: 'Electrum' },
  { key: 'sp', label: 'Plata' },
  { key: 'cp', label: 'Bronce' },
]

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

const THEAD_CLS = 'text-left font-exo text-[10px] font-semibold tracking-[0.15em] uppercase text-txt-muted pb-1 pr-4'
const GROUP_ROW_CLS = 'text-left font-exo text-[10px] font-semibold tracking-[0.15em] uppercase text-txt-muted pt-3 pb-1'

function EquipoGroup({ items, label, subtotalStr }) {
  if (items.length === 0) return null
  return (
    <>
      <tr>
        <th colSpan={4} className={GROUP_ROW_CLS}>{label}</th>
      </tr>
      {items.map(item => (
        <tr key={item.id} className="border-t border-border-base">
          <td className="text-txt-primary font-medium py-1.5 pr-4">{item.nombre}</td>
          <td className="py-1.5 pr-4">{item.cantidad > 1 ? `×${item.cantidad}` : ''}</td>
          <td className="text-txt-muted py-1.5 pr-4">{item.descripcion}</td>
          <td className="text-txt-muted py-1.5 shrink-0">
            {parseInt(item.precio) > 0 ? `${item.precio} ${item.precio_moneda ?? 'gp'}` : ''}
          </td>
        </tr>
      ))}
      {subtotalStr && (
        <tr>
          <td colSpan={4} className="text-[11px] text-txt-muted pt-1 pb-2">
            Subtotal: <span className="text-txt-primary font-semibold">{subtotalStr}</span>
          </td>
        </tr>
      )}
    </>
  )
}

function EquipoTable({ portando, guardado, subtotalPortandoStr, subtotalGuardadoStr }) {
  return (
    <div className="overflow-x-auto mb-1">
      <table className="w-full text-[13px] text-txt-secondary border-collapse">
        <thead>
          <tr className="border-b border-border-base">
            <th className={THEAD_CLS}>Nombre</th>
            <th className={THEAD_CLS}>Cant.</th>
            <th className={THEAD_CLS}>Descripción</th>
            <th className={THEAD_CLS}>Precio</th>
          </tr>
        </thead>
        <tbody>
          <EquipoGroup items={portando} label="Portando" subtotalStr={subtotalPortandoStr} />
          <EquipoGroup items={guardado} label="Guardado" subtotalStr={subtotalGuardadoStr} />
        </tbody>
      </table>
    </div>
  )
}

export default function PJEquipmentSection({ pj, unread }) {
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
      <div className={sectionTitleCls}>Equipo<UnreadDot unread={unread} className="ml-2 inline-block align-middle" /></div>
      {equipo.length > 0 && (
        <>
          <EquipoTable
            portando={portando}
            guardado={guardado}
            subtotalPortandoStr={subtotalPortandoStr}
            subtotalGuardadoStr={subtotalGuardadoStr}
          />
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
