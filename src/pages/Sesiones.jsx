import { useState, useEffect } from 'react'
import { useApp } from '../AppContext'
import { PageHeader, EmptyState } from '../components/Shared'
import { nl2br } from '../helpers'

function renderResumen(text) {
  if (!text) return null
  return text.split('\n').map((line, i) => {
    if (/^\d+\./.test(line.trim())) {
      return <div key={i} className="scene-item">{line}</div>
    }
    return <span key={i}>{line}<br /></span>
  })
}

function SesionDetailInline({ sesion, onBack }) {
  const { openForm } = useApp()
  const isPlanned = !sesion.logros?.trim()

  return (
    <div>
      <div className="sesion-detail-nav">
        <button className="btn btn-secondary" onClick={onBack}>← Volver</button>
        <button className="btn btn-secondary" onClick={() => openForm('sesiones', sesion.id)}>Editar</button>
      </div>

      <div className="sesion-detail-header">
        <div className="page-eyebrow">
          Sesión {sesion.numero}
          {sesion.fecha && <> · {sesion.fecha}</>}
          {isPlanned && <span className="sesion-planned-badge">Planificada</span>}
        </div>
        <div className="page-title">{sesion.titulo || 'Sin título'}</div>
      </div>

      {sesion.resumen && (
        <div className="sesion-section">
          <div className="sesion-section-title">Resumen</div>
          <div className="detail-text sesion-resumen">{renderResumen(sesion.resumen)}</div>
        </div>
      )}

      <div className="sesion-two-col">
        {sesion.logros && (
          <div className="sesion-section">
            <div className="sesion-section-title">Momentos importantes</div>
            <div className="detail-text" dangerouslySetInnerHTML={nl2br(sesion.logros)} />
          </div>
        )}
        {sesion.ganchos && (
          <div className="sesion-section">
            <div className="sesion-section-title">Ganchos pendientes</div>
            <div className="detail-text" dangerouslySetInnerHTML={nl2br(sesion.ganchos)} />
          </div>
        )}
      </div>
    </div>
  )
}

export default function Sesiones() {
  const { db, openForm, pendingDetail, consumePendingDetail } = useApp()
  const [selectedId, setSelectedId] = useState(() => pendingDetail?.id ?? null)

  useEffect(() => {
    if (pendingDetail?.id != null) consumePendingDetail()
  }, [])

  if (selectedId !== null) {
    const sesion = db.sesiones.find(s => s.id === selectedId)
    if (sesion) {
      return <SesionDetailInline sesion={sesion} onBack={() => setSelectedId(null)} />
    }
  }

  return (
    <div>
      <PageHeader eyebrow="Crónica" title="Sesiones">
        <button className="btn btn-primary" onClick={() => openForm('sesiones')}>+ Nueva Sesión</button>
      </PageHeader>

      {db.sesiones.length === 0 ? (
        <EmptyState icon="📜" title="Sin sesiones registradas" text="Registrá tu primera sesión para comenzar la crónica de Drakterima." />
      ) : (
        <div className="timeline">
          {[...db.sesiones].reverse().map(s => (
            <div
              key={s.id}
              className={`timeline-item${!s.logros?.trim() ? ' planned' : ''}`}
              onClick={() => setSelectedId(s.id)}
            >
              <div className="timeline-dot" />
              <div className="timeline-date">Sesión {s.numero} · {s.fecha || 'Sin fecha'}</div>
              <div className="timeline-title">{s.titulo || 'Sin título'}</div>
              <div className="timeline-text">
                {(s.resumen || '').substring(0, 180)}{(s.resumen || '').length > 180 ? '...' : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
