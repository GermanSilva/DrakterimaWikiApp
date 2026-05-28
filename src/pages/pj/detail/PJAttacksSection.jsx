import { sectionTitleCls, detailSectionCls } from '../../../constants'

export default function PJAttacksSection({ pj }) {
  return (
    <div id="pj-section-ataques" className={detailSectionCls}>
      <div className={sectionTitleCls}>Ataques</div>
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
            </tr>
          </thead>
          <tbody>
            {(pj.ataques ?? []).map(a => (
              <tr key={a.id} className="border-b border-border-base/50 text-txt-secondary">
                <td className="py-2 pr-4 text-txt-primary font-medium">{a.nombre}</td>
                <td className="text-center py-2 px-2 text-accent-dim font-semibold">{a.bono_ataque}</td>
                <td className="text-center py-2 px-2">{a.dano}</td>
                <td className="py-2 px-2 text-txt-muted">{a.tipo_dano}</td>
                <td className="py-2 px-2 text-txt-muted">{a.alcance}</td>
                <td className="py-2 pl-2 text-txt-muted">{a.notas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
