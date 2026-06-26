import { sectionTitleCls, detailSectionCls } from '../../../constants'

function AtaquesTable({ ataques }) {
  if (ataques.length === 0) return null
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr className="border-b border-border-base text-txt-muted font-exo text-[10px] tracking-[0.1em] uppercase">
            <th className="text-left py-2 pr-4 font-medium">Arma</th>
            <th className="text-center py-2 px-2 font-medium">Bono</th>
            <th className="text-center py-2 px-2 font-medium">Daño</th>
            <th className="text-left py-2 px-2 font-medium">Tipo</th>
            <th className="text-left py-2 px-2 font-medium">Alcance</th>
            <th className="text-left py-2 pl-2 font-medium">Notas</th>
            <th className="text-right py-2 pl-2 font-medium">Valor</th>
          </tr>
        </thead>
        <tbody>
          {ataques.map(a => (
            <tr key={a.id} className="border-b border-border-base/50 text-txt-secondary">
              <td className="py-2 pr-4 text-txt-primary font-medium">{a.nombre}</td>
              <td className="text-center py-2 px-2 text-accent-dim font-semibold">{a.bono_ataque}</td>
              <td className="text-center py-2 px-2">{a.dano}</td>
              <td className="py-2 px-2 text-txt-muted">{a.tipo_dano}</td>
              <td className="py-2 px-2 text-txt-muted">{a.alcance}</td>
              <td className="py-2 pl-2 text-txt-muted">{a.notas}</td>
              <td className="py-2 pl-2 text-txt-muted text-right">
                {(parseInt(a.precio) > 0) ? `${a.precio} ${a.precio_moneda ?? 'gp'}` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function PJAttacksSection({ pj }) {
  const portando = (pj.ataques ?? []).filter(a => a.portando !== false)
  const guardado = (pj.ataques ?? []).filter(a => a.portando === false)

  return (
    <div id="pj-section-ataques" className={detailSectionCls}>
      <div className={sectionTitleCls}>Ataques</div>
      {portando.length > 0 && (
        <div className="mb-3">
          <div className="font-exo text-[10px] font-semibold tracking-[0.15em] uppercase text-txt-muted mb-1">Portando</div>
          <AtaquesTable ataques={portando} />
        </div>
      )}
      {guardado.length > 0 && (
        <div>
          <div className="font-exo text-[10px] font-semibold tracking-[0.15em] uppercase text-txt-muted mb-1">Guardado</div>
          <AtaquesTable ataques={guardado} />
        </div>
      )}
    </div>
  )
}
