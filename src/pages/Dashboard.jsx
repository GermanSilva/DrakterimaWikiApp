import { useApp } from '../AppContext'
import { RelacionTag } from '../components/Shared'

export default function Dashboard() {
  const { db, navigate, goToDetail, isDM } = useApp()
  const lastSesion = db.sesiones.length ? db.sesiones[db.sesiones.length - 1] : null
  const nextSesion = db.sesiones.find(s => !s.logros?.trim()) ?? null
  const recentPNJs = db.pnjs.slice(-3).reverse()

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Vista General</div>
          <div className="page-title">Panel de Campaña</div>
          <div className="page-subtitle">Leyendas de Drakterima · D&D 5E Homebrew</div>
        </div>
      </div>

      <div className="info-box">
        <div className="info-box-title">🐉 Conflicto Central</div>
        <div className="info-box-text">
          Dos dragones milenarios —Argan y Ragon— libran una guerra de influencia sobre Drakterima. La Orden de Argan (diplomacia, estructura) y el Culto de Ragon (conquista, poder) son sus brazos. Los aventureros del Gremio, con sede en Kardevir, podrían cambiar el equilibrio del continente.
        </div>
      </div>

      <div className="dashboard-grid">
        {[
          { key: 'sesiones', icon: '📜', label: 'Sesiones' },
          { key: 'pjs', icon: '🛡️', label: 'Jugadores' },
          { key: 'pnjs', icon: '🎭', label: 'PNJs' },
          { key: 'lugares', icon: '🗺️', label: 'Lugares' },
          { key: 'facciones', icon: '⚜️', label: 'Facciones' },
          { key: 'lore', icon: '📖', label: 'Lore' },
        ].map(({ key, icon, label }) => (
          <div key={key} className="stat-card" onClick={() => navigate(key)}>
            <div className="stat-icon">{icon}</div>
            <div className="stat-number">{(db[key] || []).length}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>

      {isDM && nextSesion && (
        <>
          <div className="divider">Próxima Sesión</div>
          <div
            className="lore-block"
            style={{ borderLeftColor: 'var(--accent)', cursor: 'pointer' }}
            onClick={() => goToDetail('sesiones', nextSesion.id)}
          >
            <div className="lore-block-title">
              📋 Sesión {nextSesion.numero} — {nextSesion.titulo || 'Sin título'}
            </div>
            {nextSesion.ganchos && (
              <div className="lore-block-text" style={{ marginTop: 6 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'Exo 2', sans-serif" }}>Ganchos</span>
                <br />
                {nextSesion.ganchos.substring(0, 280)}{nextSesion.ganchos.length > 280 ? '…' : ''}
              </div>
            )}
          </div>
        </>
      )}

      {recentPNJs.length > 0 && (
        <>
          <div className="divider">PNJs Recientes</div>
          <div className="dashboard-pnj-row">
            {recentPNJs.map(p => (
              <div
                key={p.id}
                className="dashboard-pnj-card"
                onClick={() => goToDetail('pnjs', p.id)}
              >
                <div className="dashboard-pnj-name">{p.nombre}</div>
                {p.rol && <div className="dashboard-pnj-rol">{p.rol}</div>}
                {p.relacion && (
                  <div style={{ marginTop: 6 }}>
                    <RelacionTag relacion={p.relacion} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="divider">Lore del Mundo</div>

      <div className="lore-block">
        <div className="lore-block-title">🏔️ Regiones de Drakterima</div>
        <div className="lore-block-text">
          <strong style={{ color: 'var(--text-primary)' }}>Magral</strong> · Corazón fértil del sur. Capital: Genesia. Gobernada por la Orden de Argan.<br />
          <strong style={{ color: 'var(--text-primary)' }}>Nezor</strong> · Desierto del este. Organizado en clanes y confederaciones de caudillos del Culto de Ragon.<br />
          <strong style={{ color: 'var(--text-primary)' }}>Tierras Heladas</strong> · Norte implacable. Dominado por los Goliath. Independientes de Magral.<br />
          <strong style={{ color: 'var(--text-primary)' }}>Islas Pétreas</strong> · Archipiélago suroeste. Neutral. Industria minera, metalúrgica y naval.<br />
          <strong style={{ color: 'var(--text-primary)' }}>Kardevir</strong> · Ciudad del Paso. Centro geográfico. Sede del Gremio de Aventureros.
        </div>
      </div>

      <div className="lore-block" style={{ borderLeftColor: 'var(--accent)' }}>
        <div className="lore-block-title">💎 La Magralita — Sangre del Mundo</div>
        <div className="lore-block-text">
          Mineral mágico de alto valor estratégico. Potencia objetos arcanos y estabiliza conjuros complejos. Su manipulación indebida genera inestabilidad peligrosa. Controlar sus yacimientos implica poder económico, militar y político.
        </div>
      </div>

      {lastSesion && (
        <>
          <div className="divider">Última Sesión</div>
          <div
            className="lore-block"
            style={{ borderLeftColor: 'var(--accent-dim)', cursor: 'pointer' }}
            onClick={() => navigate('sesiones')}
          >
            <div className="lore-block-title">📜 {lastSesion.titulo || `Sesión ${lastSesion.numero}`}</div>
            <div className="lore-block-text">
              {(lastSesion.resumen || 'Sin resumen.').substring(0, 220)}
              {lastSesion.resumen?.length > 220 ? '...' : ''}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
