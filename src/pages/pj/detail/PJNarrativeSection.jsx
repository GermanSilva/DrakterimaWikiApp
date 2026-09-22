import WikiText from '../../../components/WikiText'
import UnreadDot from '../../../components/UnreadDot'
import { sectionTitleCls, detailTextCls, detailSectionCls } from '../../../constants'

export default function PJNarrativeSection({ pj, unread }) {
  return (
    <div id="pj-section-narrativa" className="grid grid-cols-2 gap-0 gap-x-8 max-md:grid-cols-1">
      <div>
        {pj.trasfondo && (
          <div className={detailSectionCls}>
            <div className={sectionTitleCls}>Trasfondo<UnreadDot unread={unread} className="ml-2 inline-block align-middle" /></div>
            <div className={detailTextCls}><WikiText text={pj.trasfondo} /></div>
          </div>
        )}
        {pj.motivo && (
          <div className={detailSectionCls}>
            <div className={sectionTitleCls}>Motivación · Gremio<UnreadDot unread={unread} className="ml-2 inline-block align-middle" /></div>
            <div className={detailTextCls}><WikiText text={pj.motivo} /></div>
          </div>
        )}
      </div>
      <div>
        {pj.magralita && (
          <div className={detailSectionCls}>
            <div className={sectionTitleCls}>Relación con la Magralita<UnreadDot unread={unread} className="ml-2 inline-block align-middle" /></div>
            <div className={detailTextCls}><WikiText text={pj.magralita} /></div>
          </div>
        )}
      </div>
    </div>
  )
}
