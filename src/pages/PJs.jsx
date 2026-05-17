import { useState } from 'react'
import { useApp } from '../AppContext'
import { Tag, RegionTag, PageHeader, EmptyState } from '../components/Shared'
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

function PJDetailInline({ pj, onBack }) {
  const { openForm, isDM } = useApp()
  return (
    <div>
      <div className="sesion-detail-nav">
        <button className="btn btn-secondary" onClick={onBack}>← Volver</button>
        {isDM && <button className="btn btn-secondary" onClick={() => openForm('pjs', pj.id)}>Editar</button>}
      </div>

      <div className="sesion-detail-header">
        <div className="page-eyebrow" style={{ color: REGION_COLOR[pj.region] || undefined }}>
          Personaje Jugador · Nv. {pj.nivel || 1}
        </div>
        <div className="page-title">{pj.nombre}</div>
        <div className="detail-tags" style={{ marginTop: 10 }}>
          <Tag cls="pj" text={pj.clase || '?'} />
          {pj.raza && <Tag cls="neutral" text={pj.raza} />}
          {pj.region && <RegionTag region={pj.region} />}
          {pj.estado === 'borrador' && <Tag cls="borrador" text="Borrador" />}
          {pj.estado === 'secreto' && <Tag cls="secreto" text="Secreto" />}
        </div>
      </div>

      {pj.imagen_url && (
        <div style={{ margin: '16px 0', textAlign: 'center' }}>
          <img src={pj.imagen_url} alt={pj.nombre} style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border)' }} onError={e => e.target.style.display = 'none'} />
        </div>
      )}

      <div className="detail-fields-grid" style={{ marginBottom: 24 }}>
        <div className="detail-field"><label>Jugador</label><value>{pj.jugador || '—'}</value></div>
        <div className="detail-field"><label>Nivel</label><value>{pj.nivel || 1}</value></div>
      </div>

      <div className="char-detail-grid">
        <div>
          {pj.trasfondo && (
            <div className="detail-section">
              <div className="detail-section-title">Trasfondo</div>
              <div className="detail-text"><WikiText text={pj.trasfondo} /></div>
            </div>
          )}
          {pj.motivo && (
            <div className="detail-section">
              <div className="detail-section-title">Motivación · Gremio</div>
              <div className="detail-text">{pj.motivo}</div>
            </div>
          )}
        </div>
        <div>
          {pj.magralita && (
            <div className="detail-section">
              <div className="detail-section-title">Relación con la Magralita</div>
              <div className="detail-text">{pj.magralita}</div>
            </div>
          )}
          {isDM && pj.notas && (
            <div className="detail-section" style={DM_STYLE}>
              <div className="detail-section-title" style={DM_TITLE_STYLE}>🔒 Notas DM</div>
              <div className="detail-text"><WikiText text={pj.notas} /></div>
            </div>
          )}
        </div>
      </div>
      <PlayerNotes entityType="pjs" entityId={pj.id} />
    </div>
  )
}

export default function PJs() {
  const { db, openForm, isDM, currentPlayer } = useApp()
  const [selectedId, setSelectedId] = useState(null)
  const [query, setQuery] = useState('')

  if (selectedId !== null) {
    const pj = db.pjs.find(p => p.id === selectedId)
    if (pj) return <PJDetailInline pj={pj} onBack={() => setSelectedId(null)} />
  }

  const visible = db.pjs.filter(p => isVisible(p, isDM, currentPlayer))
  const lista = query.trim()
    ? visible.filter(p =>
        [p.nombre, p.clase, p.raza, p.jugador].some(v =>
          (v || '').toLowerCase().includes(query.toLowerCase())
        )
      )
    : visible

  return (
    <div>
      <PageHeader eyebrow="Personajes Jugadores" title="El Grupo">
        {isDM && <button className="btn btn-primary" onClick={() => openForm('pjs')}>+ Nuevo PJ</button>}
      </PageHeader>

      <div className="search-bar">
        <input
          placeholder="Buscar por nombre, clase, raza o jugador…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {lista.length === 0 ? (
        <EmptyState
          icon="🛡️"
          title="Sin resultados"
          text={query ? 'No hay PJs que coincidan con la búsqueda.' : 'Agregá los personajes jugadores creados en la sesión cero.'}
        />
      ) : (
        <div className="cards-grid">
          {lista.map(p => (
            <div key={p.id} className="card" onClick={() => setSelectedId(p.id)}>
              <div className="card-header">
                <div className="card-title">{p.nombre}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isDM && p.notas && <span style={{ fontSize: 10, opacity: 0.45 }} title="Tiene notas DM">🔒</span>}
                  <span className="card-icon">🛡️</span>
                </div>
              </div>
              <div className="card-tags">
                <Tag cls="pj" text={p.clase || 'Clase'} />
                {p.raza && <Tag cls="neutral" text={p.raza} />}
                {p.region && <RegionTag region={p.region} />}
                {p.estado === 'borrador' && <Tag cls="borrador" text="Borrador" />}
                {p.estado === 'secreto' && <Tag cls="secreto" text="Secreto" />}
              </div>
              <div className="card-desc">{p.trasfondo || 'Sin trasfondo registrado.'}</div>
              <div className="card-footer">
                <span className="card-meta">
                  Nv. {p.nivel || 1} ·{' '}
                  {p.jugador || <span style={{ color: 'var(--text-muted)' }}>Sin asignar</span>}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
