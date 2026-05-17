import { useState, useEffect } from 'react'
import { useApp } from '../AppContext'
import { Tag, PageHeader, EmptyState } from '../components/Shared'
import { isVisible } from '../helpers'
import PlayerNotes from '../components/PlayerNotes'
import WikiText from '../components/WikiText'

function ItemDetailInline({ item, onBack }) {
  const { openForm, isDM } = useApp()
  return (
    <div>
      <div className="sesion-detail-nav">
        <button className="btn btn-secondary" onClick={onBack}>← Volver</button>
        {isDM && <button className="btn btn-secondary" onClick={() => openForm('items', item.id)}>Editar</button>}
      </div>

      <div className="sesion-detail-header">
        <div className="page-eyebrow">{item.tipo || 'Ítem'} · {item.rareza || ''}</div>
        <div className="page-title">{item.nombre}</div>
        <div className="detail-tags" style={{ marginTop: 10 }}>
          {item.rareza && <Tag cls="neutral" text={item.rareza} />}
          {item.tipo && <Tag cls="orden" text={item.tipo} />}
          {item.requiere_sintonia && <Tag cls="culto" text="Sintonía" />}
          {item.estado === 'borrador' && <Tag cls="borrador" text="Borrador" />}
          {item.estado === 'secreto' && <Tag cls="secreto" text="Secreto" />}
        </div>
      </div>

      {item.imagen_url && (
        <div style={{ margin: '16px 0', textAlign: 'center' }}>
          <img src={item.imagen_url} alt={item.nombre} style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border)' }} onError={e => e.target.style.display = 'none'} />
        </div>
      )}

      {item.poseedor && (
        <div className="detail-field" style={{ marginTop: 12 }}>
          <label>Poseedor actual</label>
          <value>{item.poseedor}</value>
        </div>
      )}
      {item.descripcion && (
        <div className="detail-section">
          <div className="detail-section-title">Propiedades</div>
          <div className="detail-text"><WikiText text={item.descripcion} /></div>
        </div>
      )}
      {item.lore && (
        <div className="detail-section">
          <div className="detail-section-title">Historia</div>
          <div className="detail-text"><WikiText text={item.lore} /></div>
        </div>
      )}
      <PlayerNotes entityType="items" entityId={item.id} />
    </div>
  )
}

export default function Items() {
  const { db, openForm, isDM, currentPlayer, pendingDetail, consumePendingDetail } = useApp()
  const [selectedId, setSelectedId] = useState(() => pendingDetail?.id ?? null)

  useEffect(() => {
    if (pendingDetail?.id != null) consumePendingDetail()
  }, [])

  if (selectedId !== null) {
    const item = db.items.find(it => it.id === selectedId)
    if (item) return <ItemDetailInline item={item} onBack={() => setSelectedId(null)} />
  }

  const lista = db.items.filter(it => isVisible(it, isDM, currentPlayer))

  return (
    <div>
      <PageHeader eyebrow="Homebrew · Tesoros" title="Ítems">
        {isDM && <button className="btn btn-primary" onClick={() => openForm('items')}>+ Nuevo Ítem</button>}
      </PageHeader>

      {lista.length === 0 ? (
        <EmptyState icon="💎" title="Sin ítems registrados" text="Agregá ítems mágicos, objetos especiales o reglas homebrew de tu campaña." />
      ) : (
        <div className="cards-grid">
          {lista.map(it => (
            <div key={it.id} className="card" onClick={() => setSelectedId(it.id)}>
              <div className="card-header">
                <div className="card-title">{it.nombre}</div>
                <span className="card-icon">💎</span>
              </div>
              <div className="card-tags">
                {it.rareza && <Tag cls="neutral" text={it.rareza} />}
                {it.tipo && <Tag cls="orden" text={it.tipo} />}
                {it.requiere_sintonia && <Tag cls="culto" text="Sintonía" />}
                {it.estado === 'borrador' && <Tag cls="borrador" text="Borrador" />}
                {it.estado === 'secreto' && <Tag cls="secreto" text="Secreto" />}
              </div>
              <div className="card-desc">{it.descripcion || ''}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
