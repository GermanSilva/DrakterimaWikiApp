import { sectionTitleCls, detailSectionCls } from '../../../constants'

const CURRENCY = [
  { key: 'cp', label: 'Bronce' },
  { key: 'sp', label: 'Plata' },
  { key: 'ep', label: 'Electrum' },
  { key: 'gp', label: 'Oro' },
  { key: 'pp', label: 'Platino' },
]

export default function PJEquipmentSection({ pj }) {
  const equipo = pj.equipo ?? []
  const monedas = pj.monedas ?? {}
  const hasMonedas = CURRENCY.some(c => (monedas[c.key] ?? 0) > 0)

  return (
    <div id="pj-section-equipo" className={detailSectionCls}>
      <div className={sectionTitleCls}>Equipo</div>
      {equipo.length > 0 && (
        <ul className="space-y-1 mb-4">
          {equipo.map(item => (
            <li key={item.id} className="flex gap-3 text-[13px] text-txt-secondary">
              <span className="text-txt-primary font-medium">{item.nombre}</span>
              {item.cantidad > 1 && <span className="text-txt-muted">×{item.cantidad}</span>}
              {item.descripcion && <span className="text-txt-muted">— {item.descripcion}</span>}
            </li>
          ))}
        </ul>
      )}
      {hasMonedas && (
        <div className="flex gap-4 flex-wrap pt-2 border-t border-border-base">
          {CURRENCY.map(c => (monedas[c.key] ?? 0) > 0 && (
            <div key={c.key} className="text-center">
              <div className="font-exo text-[10px] text-txt-muted mb-0.5">{c.label}</div>
              <div className="font-exo text-[16px] font-bold text-txt-primary">{monedas[c.key]}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
