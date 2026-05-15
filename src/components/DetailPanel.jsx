import { useApp } from '../AppContext'
import { Tag } from './Shared'
import { nl2br } from '../helpers'

function ItemDetail({ item }) {
  const { openForm, closeDetail } = useApp()
  return (
    <>
      <div className="detail-eyebrow">{item.tipo || 'Ítem'} · {item.rareza || ''}</div>
      <div className="detail-title">{item.nombre}</div>
      <div className="detail-tags">
        {item.rareza && <Tag cls="neutral" text={item.rareza} />}
        {item.tipo && <Tag cls="orden" text={item.tipo} />}
        {item.requiere_sintonia && <Tag cls="culto" text="Sintonía" />}
      </div>
      {item.poseedor && (
        <div className="detail-field" style={{ marginTop: 12 }}>
          <label>Poseedor actual</label>
          <value>{item.poseedor}</value>
        </div>
      )}
      {item.descripcion && (
        <div className="detail-section">
          <div className="detail-section-title">Propiedades</div>
          <div className="detail-text" dangerouslySetInnerHTML={nl2br(item.descripcion)} />
        </div>
      )}
      {item.lore && (
        <div className="detail-section">
          <div className="detail-section-title">Historia</div>
          <div className="detail-text" dangerouslySetInnerHTML={nl2br(item.lore)} />
        </div>
      )}
      <div className="form-actions" style={{ marginTop: 24 }}>
        <button className="btn btn-secondary" onClick={() => { closeDetail(); openForm('items', item.id) }}>Editar</button>
      </div>
    </>
  )
}

const DETAIL_VIEWS = {
  items: ItemDetail,
}

export default function DetailPanel({ detail }) {
  const { db, closeDetail } = useApp()
  const item = (db[detail.type] || []).find(x => x.id === detail.id)
  const DetailView = DETAIL_VIEWS[detail.type]

  return (
    <div id="detail-overlay" onClick={e => e.target.id === 'detail-overlay' && closeDetail()}>
      <div id="detail-panel">
        <span className="detail-close" onClick={closeDetail}>✕</span>
        {item && DetailView ? <DetailView item={item} /> : <p style={{ color: 'var(--text-muted)' }}>No encontrado.</p>}
      </div>
    </div>
  )
}
