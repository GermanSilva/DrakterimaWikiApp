import { useApp } from '../AppContext'
import DragonIcon from '../svgs/dragonIcon'

export default function Header() {
  const { toggleSidebar, syncStatus, loading } = useApp()
  return (
    <header id="app-header">
      <button className="hamburger-btn" onClick={toggleSidebar} aria-label="Menú">☰</button>
      <div className="header-emblem">
        <DragonIcon width={28} height={28} fill="var(--accent)" />
      </div>
      <div className="header-titles">
        <span className="header-supertitle">Leyendas de Drakterima</span>
        <span className="header-title">Dragones Revelados</span>
      </div>
      <div className="header-right">
        {loading && <span className="sync-badge sync-badge--saving">Sincronizando…</span>}
        {!loading && syncStatus === 'saving' && <span className="sync-badge sync-badge--saving">Guardando…</span>}
        {!loading && syncStatus === 'saved'  && <span className="sync-badge sync-badge--saved">✓ Guardado</span>}
        {!loading && syncStatus === 'error'  && <span className="sync-badge sync-badge--error">! Sin sync</span>}
        <span className="header-badge">Wiki del DM · D&D 5E</span>
      </div>
    </header>
  )
}
