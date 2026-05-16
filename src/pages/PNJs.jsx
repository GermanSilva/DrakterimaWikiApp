import { useState, useEffect } from 'react'
import { useApp } from '../AppContext'
import { Tag, RegionTag, RelacionTag, PageHeader, EmptyState, FilterPills } from '../components/Shared'
import { nl2br } from '../helpers'

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
  { value: 'aliado', label: 'Aliados' },
  { value: 'neutral', label: 'Neutrales' },
  { value: 'enemigo', label: 'Enemigos' },
]

function PNJDetailInline({ pnj, onBack }) {
  const { openForm, isDM } = useApp()
  return (
    <div>
      <div className="sesion-detail-nav">
        <button className="btn btn-secondary" onClick={onBack}>← Volver</button>
        {isDM && <button className="btn btn-secondary" onClick={() => openForm('pnjs', pnj.id)}>Editar</button>}
      </div>

      <div className="sesion-detail-header">
        <div className="page-eyebrow" style={{ color: REGION_COLOR[pnj.region] || undefined }}>
          PNJ · {pnj.rol || 'Personaje'}
        </div>
        <div className="page-title">{pnj.nombre}</div>
        <div className="detail-tags" style={{ marginTop: 10 }}>
          {pnj.region && <RegionTag region={pnj.region} />}
          {pnj.relacion && <RelacionTag relacion={pnj.relacion} />}
          {pnj.faccion && <Tag cls="orden" text={pnj.faccion} />}
        </div>
      </div>

      <div className="char-detail-grid">
        <div>
          {pnj.descripcion && (
            <div className="detail-section">
              <div className="detail-section-title">Descripción</div>
              <div className="detail-text" dangerouslySetInnerHTML={nl2br(pnj.descripcion)} />
            </div>
          )}
          {pnj.historia && (
            <div className="detail-section">
              <div className="detail-section-title">Historia</div>
              <div className="detail-text" dangerouslySetInnerHTML={nl2br(pnj.historia)} />
            </div>
          )}
        </div>
        <div>
          {isDM && pnj.secreto && (
            <div className="detail-section" style={DM_STYLE}>
              <div className="detail-section-title" style={DM_TITLE_STYLE}>🔒 Motivaciones secretas</div>
              <div className="detail-text" dangerouslySetInnerHTML={nl2br(pnj.secreto)} />
            </div>
          )}
          {isDM && pnj.notas && (
            <div className="detail-section" style={DM_STYLE}>
              <div className="detail-section-title" style={DM_TITLE_STYLE}>🔒 Notas DM</div>
              <div className="detail-text" dangerouslySetInnerHTML={nl2br(pnj.notas)} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function PNJs() {
  const { db, openForm, pendingDetail, consumePendingDetail, isDM } = useApp()
  const [filtro, setFiltro] = useState('todos')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(() => pendingDetail?.id ?? null)

  useEffect(() => {
    if (pendingDetail?.id != null) consumePendingDetail()
  }, [])

  if (selectedId !== null) {
    const pnj = db.pnjs.find(p => p.id === selectedId)
    if (pnj) return <PNJDetailInline pnj={pnj} onBack={() => setSelectedId(null)} />
  }

  const lista = db.pnjs
    .filter(p => filtro === 'todos' || p.relacion === filtro)
    .filter(p => {
      if (!query.trim()) return true
      const q = query.toLowerCase()
      return [p.nombre, p.rol, p.faccion].some(v => (v || '').toLowerCase().includes(q))
    })

  return (
    <div>
      <PageHeader eyebrow="Personajes No Jugadores" title="PNJs">
        {isDM && <button className="btn btn-primary" onClick={() => openForm('pnjs')}>+ Nuevo PNJ</button>}
      </PageHeader>

      <FilterPills options={FILTROS} value={filtro} onChange={setFiltro} />

      <div className="search-bar">
        <input
          placeholder="Buscar por nombre, rol o facción…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {lista.length === 0 ? (
        <EmptyState
          icon="🎭"
          title="Sin resultados"
          text={query ? 'No hay PNJs que coincidan con la búsqueda.' : 'Agregá personajes no jugadores para poblar Drakterima.'}
        />
      ) : (
        <div className="cards-grid">
          {lista.map(p => (
            <div key={p.id} className="card" onClick={() => setSelectedId(p.id)}>
              <div className="card-header">
                <div className="card-title">{p.nombre}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isDM && p.secreto && <span style={{ fontSize: 10, opacity: 0.45 }} title="Tiene secreto DM">🔒</span>}
                  <span className="card-icon">🎭</span>
                </div>
              </div>
              <div className="card-tags">
                {p.rol && <Tag cls="neutral" text={p.rol} />}
                {p.region && <RegionTag region={p.region} />}
                {p.relacion && <RelacionTag relacion={p.relacion} />}
                {p.faccion && <Tag cls="orden" text={p.faccion} />}
              </div>
              <div className="card-desc">{p.descripcion || 'Sin descripción.'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
