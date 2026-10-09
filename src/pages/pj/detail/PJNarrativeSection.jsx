import WikiText from '../../../components/WikiText'
import UnreadDot from '../../../components/UnreadDot'
import { sectionTitleCls, detailTextCls, detailSectionCls } from '../../../constants'
import { LEGACY_CHARACTER_FIELDS, customFieldValue } from '../../../helpers/pjCustomFields'

export default function PJNarrativeSection({ pj, unread, customFields = LEGACY_CHARACTER_FIELDS, motivoLabel = 'Motivación' }) {
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
            <div className={sectionTitleCls}>{motivoLabel}<UnreadDot unread={unread} className="ml-2 inline-block align-middle" /></div>
            <div className={detailTextCls}><WikiText text={pj.motivo} /></div>
          </div>
        )}
      </div>
      <div>
        {customFields.map(field => {
          const value = customFieldValue(pj, field)
          return value && (
            <div key={field.key} className={detailSectionCls}>
              <div className={sectionTitleCls}>{field.label}<UnreadDot unread={unread} className="ml-2 inline-block align-middle" /></div>
              <div className={detailTextCls}><WikiText text={value} /></div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
