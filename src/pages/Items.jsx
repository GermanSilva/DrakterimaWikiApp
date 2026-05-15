import { useApp } from '../AppContext'
import { Tag, PageHeader, EmptyState } from '../components/Shared'

export default function Items() {
  const { db, openDetail, openForm } = useApp()

  return (
    <div>
      <PageHeader eyebrow="Homebrew · Tesoros" title="Ítems">
        <button className="btn btn-primary" onClick={() => openForm('items')}>+ Nuevo Ítem</button>
      </PageHeader>

      {db.items.length === 0 ? (
        <EmptyState icon="💎" title="Sin ítems registrados" text="Agregá ítems mágicos, objetos especiales o reglas homebrew de tu campaña." />
      ) : (
        <div className="cards-grid">
          {db.items.map(it => (
            <div key={it.id} className="card" onClick={() => openDetail('items', it.id)}>
              <div className="card-header">
                <div className="card-title">{it.nombre}</div>
                <span className="card-icon">💎</span>
              </div>
              <div className="card-tags">
                {it.rareza && <Tag cls="neutral" text={it.rareza} />}
                {it.tipo && <Tag cls="orden" text={it.tipo} />}
                {it.requiere_sintonia && <Tag cls="culto" text="Sintonía" />}
              </div>
              <div className="card-desc">{it.descripcion || ''}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
