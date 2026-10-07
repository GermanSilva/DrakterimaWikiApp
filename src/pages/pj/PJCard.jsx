import { useApp } from '../../AppContext'
import { RegionTag } from '../../components/Shared'
import UnreadDot from '../../components/UnreadDot'
import { clickable } from '../../helpers/a11y'
import { entityCardCls } from '../../constants'
import { PJCardContent } from './PJCardContent'

export default function PJCard({ pj, unread, onClick }) {
  const { isDM } = useApp()

  return (
    <div className={entityCardCls} {...clickable(onClick)}>
      <UnreadDot unread={unread} className="absolute top-2 right-2" />
      <PJCardContent pj={pj} hasDmNotes={isDM && !!pj.notas} regionTag={<RegionTag region={pj.region} />} />
    </div>
  )
}
