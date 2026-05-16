import { useState } from 'react'
import { useApp } from '../AppContext'
import { Tag, RegionTag, PageHeader, FilterPills, EmptyState } from '../components/Shared'
import { nl2br, regionLabel, regionOptions } from '../helpers'
import PlayerNotes from '../components/PlayerNotes'

const REGION_COLOR = {
  magral:  '#7aad82',
  nezor:   '#c4834a',
  heladas: '#7aaad0',
  islas:   '#9090c0',
}

const DM_STYLE = { borderTopColor: 'var(--accent)' }
const DM_TITLE_STYLE = { color: 'var(--accent-bright)' }

const FILTROS = [
  { value: 'todos', label: 'Todos' },
  ...regionOptions.map(r => ({ value: r, label: regionLabel[r] })),
]

function LugarDetailInline({ lugar, onBack }) {
  const { openForm, isDM } = useApp()
  return (
    <div>
      <div className="sesion-detail-nav">
        <button className="btn btn-secondary" onClick={onBack}>← Volver</button>
        {isDM && <button className="btn btn-secondary" onClick={() => openForm('lugares', lugar.id)}>Editar</button>}
      </div>

      <div className="sesion-detail-header">
        <div className="page-eyebrow" style={{ color: REGION_COLOR[lugar.region] || undefined }}>
          {lugar.tipo || 'Lugar'} · {regionLabel[lugar.region] || lugar.region}
        </div>
        <div className="page-title">{lugar.nombre}</div>
        {lugar.subtitulo && (
          <div style={{ fontFamily: "'Exo 2', sans-serif", fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 6 }}>
            {lugar.subtitulo}
          </div>
        )}
        <div className="detail-tags" style={{ marginTop: 10 }}>
          <RegionTag region={lugar.region} />
          {lugar.tipo && <Tag cls="neutral" text={lugar.tipo} />}
        </div>
      </div>

      {lugar.descripcion && (
        <div className="detail-section">
          <div className="detail-section-title">Descripción</div>
          <div className="detail-text" dangerouslySetInnerHTML={nl2br(lugar.descripcion)} />
        </div>
      )}
      {isDM && lugar.notas && (
        <div className="detail-section" style={DM_STYLE}>
          <div className="detail-section-title" style={DM_TITLE_STYLE}>🔒 Notas DM</div>
          <div className="detail-text" dangerouslySetInnerHTML={nl2br(lugar.notas)} />
        </div>
      )}
      <PlayerNotes entityType="lugares" entityId={lugar.id} />
    </div>
  )
}

export default function Lugares() {
  const { db, openForm, isDM } = useApp()
  const [filtro, setFiltro] = useState('todos')
  const [selectedId, setSelectedId] = useState(null)

  if (selectedId !== null) {
    const lugar = db.lugares.find(l => l.id === selectedId)
    if (lugar) return <LugarDetailInline lugar={lugar} onBack={() => setSelectedId(null)} />
  }

  const lista = filtro === 'todos' ? db.lugares : db.lugares.filter(l => l.region === filtro)

  return (
    <div>
      <PageHeader eyebrow="Geografía" title="Lugares">
        {isDM && <button className="btn btn-primary" onClick={() => openForm('lugares')}>+ Nuevo Lugar</button>}
      </PageHeader>

      <FilterPills options={FILTROS} value={filtro} onChange={setFiltro} />

      {lista.length === 0 ? (
        <EmptyState icon="🗺️" title="Sin lugares" text="Agregá lugares para poblar el mundo de Drakterima." />
      ) : (
        <div className="cards-grid">
          {lista.map(l => (
            <div key={l.id} className="card" onClick={() => setSelectedId(l.id)}>
              <div className="card-header">
                <div className="card-title">{l.nombre}</div>
                <span className="card-icon">🗺️</span>
              </div>
              <div className="card-tags">
                {l.tipo && <Tag cls="neutral" text={l.tipo} />}
                <RegionTag region={l.region} />
              </div>
              {l.subtitulo && (
                <div style={{ fontFamily: "'Exo 2', sans-serif", fontSize: 11, color: 'var(--accent-dim)', marginBottom: 8, fontStyle: 'italic' }}>
                  {l.subtitulo}
                </div>
              )}
              <div className="card-desc">{l.descripcion || ''}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
