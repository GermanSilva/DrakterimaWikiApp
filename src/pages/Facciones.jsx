import { useState } from 'react'
import { useApp } from '../AppContext'
import { Tag, RegionTag, RelacionTag, PageHeader, EmptyState } from '../components/Shared'
import { isVisible } from '../helpers'
import PlayerNotes from '../components/PlayerNotes'
import WikiText from '../components/WikiText'

const REGION_COLOR = {
  magral:  '#7aad82',
  nezor:   '#c4834a',
  heladas: '#7aaad0',
  islas:   '#9090c0',
}

const DM_STYLE = { borderTopColor: 'var(--accent)' }
const DM_TITLE_STYLE = { color: 'var(--accent-bright)' }

function FaccionDetailInline({ faccion, onBack }) {
  const { openForm, isDM } = useApp()
  return (
    <div>
      <div className="sesion-detail-nav">
        <button className="btn btn-secondary" onClick={onBack}>← Volver</button>
        {isDM && <button className="btn btn-secondary" onClick={() => openForm('facciones', faccion.id)}>Editar</button>}
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
          {faccion.estado === 'borrador' && <Tag cls="borrador" text="Borrador" />}
          {faccion.estado === 'secreto' && <Tag cls="secreto" text="Secreto" />}
        </div>
      </div>

      {faccion.imagen_url && (
        <div style={{ margin: '16px 0', textAlign: 'center' }}>
          <img src={faccion.imagen_url} alt={faccion.nombre} style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border)' }} onError={e => e.target.style.display = 'none'} />
        </div>
      )}

      <div className="char-detail-grid">
        <div>
          {faccion.descripcion && (
            <div className="detail-section">
              <div className="detail-section-title">Descripción</div>
              <div className="detail-text"><WikiText text={faccion.descripcion} /></div>
            </div>
          )}
        </div>
        <div>
          {isDM && faccion.secreto && (
            <div className="detail-section" style={DM_STYLE}>
              <div className="detail-section-title" style={DM_TITLE_STYLE}>🔒 Objetivos secretos</div>
              <div className="detail-text"><WikiText text={faccion.secreto} /></div>
            </div>
          )}
          {isDM && faccion.notas && (
            <div className="detail-section" style={DM_STYLE}>
              <div className="detail-section-title" style={DM_TITLE_STYLE}>🔒 Notas DM</div>
              <div className="detail-text"><WikiText text={faccion.notas} /></div>
            </div>
          )}
        </div>
      </div>
      <PlayerNotes entityType="facciones" entityId={faccion.id} />
    </div>
  )
}

export default function Facciones() {
  const { db, openForm, isDM, currentPlayer } = useApp()
  const [selectedId, setSelectedId] = useState(null)

  if (selectedId !== null) {
    const faccion = db.facciones.find(f => f.id === selectedId)
    if (faccion) return <FaccionDetailInline faccion={faccion} onBack={() => setSelectedId(null)} />
  }

  const lista = db.facciones.filter(f => isVisible(f, isDM, currentPlayer))

  return (
    <div>
      <PageHeader eyebrow="Política y Poder" title="Facciones">
        {isDM && <button className="btn btn-primary" onClick={() => openForm('facciones')}>+ Nueva Facción</button>}
      </PageHeader>

      {lista.length === 0 ? (
        <EmptyState icon="⚜️" title="Sin facciones" text="Agregá facciones para definir el poder en Drakterima." />
      ) : (
        <div className="cards-grid">
          {lista.map(f => (
            <div key={f.id} className="card" onClick={() => setSelectedId(f.id)}>
              <div className="card-header">
                <div className="card-title">{f.nombre}</div>
                <span className="card-icon">⚜️</span>
              </div>
              <div className="card-tags">
                {f.tipo && <Tag cls="neutral" text={f.tipo} />}
                {f.region && <RegionTag region={f.region} />}
                {f.relacion && <RelacionTag relacion={f.relacion} />}
                {f.estado === 'borrador' && <Tag cls="borrador" text="Borrador" />}
                {f.estado === 'secreto' && <Tag cls="secreto" text="Secreto" />}
              </div>
              <div className="card-desc">{f.descripcion || ''}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
