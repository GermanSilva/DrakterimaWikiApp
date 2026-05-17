import { useApp } from '../AppContext'

// DetailPanel está reservado para tipos futuros que requieran panel lateral.
// Los ítems migraron a detalle inline en Items.jsx.
const DETAIL_VIEWS = {}

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
