import WikiText from '../../../components/WikiText'
import { sectionTitleCls, detailTextCls, detailSectionCls } from '../pjConstants'

export default function PJTraitsSection({ pj }) {
  return (
    <div id="pj-section-rasgos" className={detailSectionCls}>
      <div className={sectionTitleCls}>Rasgos & Proficiencias</div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-3 max-md:grid-cols-1">
        {pj.rasgos_clase && (
          <div className="col-span-2 max-md:col-span-1">
            <div className="font-exo text-[10px] text-txt-muted uppercase tracking-[0.15em] mb-1">Rasgos de Clase</div>
            <div className={detailTextCls}><WikiText text={pj.rasgos_clase} /></div>
          </div>
        )}
        {pj.otros_rasgos && (
          <div className="col-span-2 max-md:col-span-1">
            <div className="font-exo text-[10px] text-txt-muted uppercase tracking-[0.15em] mb-1">Otros Rasgos</div>
            <div className={detailTextCls}><WikiText text={pj.otros_rasgos} /></div>
          </div>
        )}
        {pj.idiomas && (
          <div>
            <div className="font-exo text-[10px] text-txt-muted uppercase tracking-[0.15em] mb-1">Idiomas</div>
            <div className="text-[13px] text-txt-secondary">{pj.idiomas}</div>
          </div>
        )}
        {pj.prof_armas && (
          <div>
            <div className="font-exo text-[10px] text-txt-muted uppercase tracking-[0.15em] mb-1">Prof. Armas</div>
            <div className="text-[13px] text-txt-secondary">{pj.prof_armas}</div>
          </div>
        )}
        {pj.prof_armaduras && (
          <div>
            <div className="font-exo text-[10px] text-txt-muted uppercase tracking-[0.15em] mb-1">Prof. Armaduras</div>
            <div className="text-[13px] text-txt-secondary">{pj.prof_armaduras}</div>
          </div>
        )}
        {pj.prof_herramientas && (
          <div>
            <div className="font-exo text-[10px] text-txt-muted uppercase tracking-[0.15em] mb-1">Prof. Herramientas</div>
            <div className="text-[13px] text-txt-secondary">{pj.prof_herramientas}</div>
          </div>
        )}
      </div>
    </div>
  )
}
