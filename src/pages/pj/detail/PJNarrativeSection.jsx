import WikiText from '../../../components/WikiText'
import { sectionTitleCls, detailTextCls, detailSectionCls } from '../../../constants'

export default function PJNarrativeSection({ pj }) {
  return (
    <div id="pj-section-narrativa" className="grid grid-cols-2 gap-0 gap-x-8 max-md:grid-cols-1">
      <div>
        {pj.trasfondo && (
          <div className={detailSectionCls}>
            <div className={sectionTitleCls}>Trasfondo</div>
            <div className={detailTextCls}><WikiText text={pj.trasfondo} /></div>
          </div>
        )}
        {pj.motivo && (
          <div className={detailSectionCls}>
            <div className={sectionTitleCls}>Motivación · Gremio</div>
            <div className={detailTextCls}><WikiText text={pj.motivo} /></div>
          </div>
        )}
      </div>
      <div>
        {pj.magralita && (
          <div className={detailSectionCls}>
            <div className={sectionTitleCls}>Relación con la Magralita</div>
            <div className={detailTextCls}><WikiText text={pj.magralita} /></div>
          </div>
        )}
      </div>
    </div>
  )
}
