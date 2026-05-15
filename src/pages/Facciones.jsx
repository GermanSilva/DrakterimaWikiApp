import { useState } from 'react'
import { useApp } from '../AppContext'
import { Tag, RegionTag, RelacionTag, PageHeader, EmptyState } from '../components/Shared'
import { nl2br } from '../helpers'

const REGION_COLOR = {
  magral:  '#7aad82',
  nezor:   '#c4834a',
  heladas: '#7aaad0',
  islas:   '#9090c0',
}

const DM_STYLE = { borderTopColor: 'var(--accent)' }
const DM_TITLE_STYLE = { color: 'var(--accent-bright)' }

function FaccionDetailInline({ faccion, onBack }) {
  const { openForm } = useApp()
  return (
    <div>
      <div className="sesion-detail-nav">
        <button className="btn btn-secondary" onClick={onBack}>← Volver</button>
        <button className="btn btn-secondary" onClick={() => openForm('facciones', faccion.id)}>Editar</button>
      </div>

      <div className="sesion-detail-header">
        <div className="page-eyebrow" style={{ color: REGION_COLOR[faccion.region] || undefined }}>
          Facción · {faccion.tipo || 'Organización'}
        </div>
        <div className="page-title">{faccion.nombre}</div>
        <div className="detail-tags" style={{ marginTop: 10 }}>
          {faccion.region && <RegionTag region={faccion.region} />}
          {faccion.relacion && <RelacionTag relacion={faccion.relacion} />}
          {faccion.tipo && <Tag cls="neutral" text={faccion.tipo} />}
        </div>
      </div>

      <div className="char-detail-grid">
        <div>
          {faccion.descripcion && (
            <div className="detail-section">
              <div className="detail-section-title">Descripción</div>
              <div className="detail-text" dangerouslySetInnerHTML={nl2br(faccion.descripcion)} />
            </div>
          )}
        </div>
        <div>
          {faccion.secreto && (
            <div className="detail-section" style={DM_STYLE}>
              <div className="detail-section-title" style={DM_TITLE_STYLE}>🔒 Objetivos secretos</div>
              <div className="detail-text" dangerouslySetInnerHTML={nl2br(faccion.secreto)} />
            </div>
          )}
          {faccion.notas && (
            <div className="detail-section" style={DM_STYLE}>
              <div className="detail-section-title" style={DM_TITLE_STYLE}>🔒 Notas DM</div>
              <div className="detail-text" dangerouslySetInnerHTML={nl2br(faccion.notas)} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Facciones() {
  const { db, openForm } = useApp()
  const [selectedId, setSelectedId] = useState(null)

  if (selectedId !== null) {
    const faccion = db.facciones.find(f => f.id === selectedId)
    if (faccion) return <FaccionDetailInline faccion={faccion} onBack={() => setSelectedId(null)} />
  }

  return (
    <div>
      <PageHeader eyebrow="Política y Poder" title="Facciones">
        <button className="btn btn-primary" onClick={() => openForm('facciones')}>+ Nueva Facción</button>
      </PageHeader>

      {db.facciones.length === 0 ? (
        <EmptyState icon="⚜️" title="Sin facciones" text="Agregá facciones para definir el poder en Drakterima." />
      ) : (
        <div className="cards-grid">
          {db.facciones.map(f => (
            <div key={f.id} className="card" onClick={() => setSelectedId(f.id)}>
              <div className="card-header">
                <div className="card-title">{f.nombre}</div>
                <span className="card-icon">⚜️</span>
              </div>
              <div className="card-tags">
                {f.tipo && <Tag cls="neutral" text={f.tipo} />}
                {f.region && <RegionTag region={f.region} />}
                {f.relacion && <RelacionTag relacion={f.relacion} />}
              </div>
              <div className="card-desc">{f.descripcion || ''}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
