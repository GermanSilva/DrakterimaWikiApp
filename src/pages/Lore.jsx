import { useState } from 'react'
import { useApp } from '../AppContext'
import { Tag, PageHeader, FilterPills, EmptyState } from '../components/Shared'
import { nl2br } from '../helpers'

const DM_STYLE = { borderTopColor: 'var(--accent)' }
const DM_TITLE_STYLE = { color: 'var(--accent-bright)' }

function LoreDetailInline({ entrada, onBack }) {
  const { openForm } = useApp()
  return (
    <div>
      <div className="sesion-detail-nav">
        <button className="btn btn-secondary" onClick={onBack}>← Volver</button>
        <button className="btn btn-secondary" onClick={() => openForm('lore', entrada.id)}>Editar</button>
      </div>

      <div className="sesion-detail-header">
        <div className="page-eyebrow">Lore · {entrada.categoria || 'General'}</div>
        <div className="page-title">{entrada.titulo}</div>
        <div className="detail-tags" style={{ marginTop: 10 }}>
          {entrada.categoria && <Tag cls="neutral" text={entrada.categoria} />}
        </div>
      </div>

      {entrada.descripcion && (
        <div className="detail-section">
          <div className="detail-section-title">Descripción</div>
          <div className="detail-text" dangerouslySetInnerHTML={nl2br(entrada.descripcion)} />
        </div>
      )}
      {entrada.notas && (
        <div className="detail-section" style={DM_STYLE}>
          <div className="detail-section-title" style={DM_TITLE_STYLE}>🔒 Secretos DM</div>
          <div className="detail-text" dangerouslySetInnerHTML={nl2br(entrada.notas)} />
        </div>
      )}
    </div>
  )
}

export default function Lore() {
  const { db, openForm } = useApp()
  const [filtro, setFiltro] = useState('todos')
  const [selectedId, setSelectedId] = useState(null)

  if (selectedId !== null) {
    const entrada = db.lore.find(l => l.id === selectedId)
    if (entrada) return <LoreDetailInline entrada={entrada} onBack={() => setSelectedId(null)} />
  }

  const cats = [...new Set(db.lore.map(l => l.categoria).filter(Boolean))]
  const filtros = [
    { value: 'todos', label: 'Todos' },
    ...cats.map(c => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) })),
  ]
  const lista = filtro === 'todos' ? db.lore : db.lore.filter(l => l.categoria === filtro)

  return (
    <div>
      <PageHeader eyebrow="Historia y Conocimiento" title="Lore del Mundo">
        <button className="btn btn-primary" onClick={() => openForm('lore')}>+ Nueva Entrada</button>
      </PageHeader>

      <FilterPills options={filtros} value={filtro} onChange={setFiltro} />

      {lista.length === 0 ? (
        <EmptyState icon="📖" title="Sin entradas" text="Agregá entradas de lore para documentar el mundo." />
      ) : (
        <div className="cards-grid">
          {lista.map(l => (
            <div key={l.id} className="card" onClick={() => setSelectedId(l.id)}>
              <div className="card-header">
                <div className="card-title">{l.titulo}</div>
                <span className="card-icon">📖</span>
              </div>
              <div className="card-tags">
                {l.categoria && <Tag cls="neutral" text={l.categoria} />}
              </div>
              <div className="card-desc">{l.descripcion || ''}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
