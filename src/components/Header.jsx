import { useApp } from '../AppContext'
import DragonIcon from '../svgs/dragonIcon'

export default function Header() {
  const { toggleSidebar } = useApp()
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
        <span className="header-badge">Wiki del DM · D&D 5E</span>
      </div>
    </header>
  )
}
