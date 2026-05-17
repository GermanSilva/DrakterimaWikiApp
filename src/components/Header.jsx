import { useState } from 'react'
import { useApp } from '../AppContext'
import DragonIcon from '../svgs/dragonIcon'
import AccessModal from './AccessModal'

function HeaderSession() {
  const { isDM, lockDM, currentPlayer, logoutPlayer, tryAccess, db } = useApp()
  const [showModal, setShowModal] = useState(false)

  if (!isDM && !currentPlayer) {
    return (
      <>
        <button className="header-session-btn" onClick={() => setShowModal(true)}>
          <span className="header-session-btn-icon">🔑</span>
          Acceder
        </button>
        {showModal && (
          <AccessModal onClose={() => setShowModal(false)} onAccess={tryAccess} />
        )}
      </>
    )
  }

  if (isDM) {
    return (
      <div className="header-session">
        <span className="header-session-label">🔓 Modo DM</span>
        <button className="header-session-btn" onClick={lockDM}>Salir</button>
      </div>
    )
  }

  // Jugador autenticado
  const pj = db.pjs.find(p => p.id === currentPlayer.id)
  const displayName = pj
    ? `${pj.nombre}${pj.jugador ? ` [${pj.jugador}]` : ''}`
    : currentPlayer.nombre

  return (
    <div className="header-session">
      {pj?.imagen_url && (
        <img
          src={pj.imagen_url}
          alt={pj.nombre}
          className="header-session-avatar"
          onError={e => e.target.style.display = 'none'}
        />
      )}
      <span className="header-session-label">{displayName}</span>
      <button className="header-session-btn" onClick={logoutPlayer}>Cerrar sesión</button>
    </div>
  )
}

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
        <HeaderSession />
      </div>
    </header>
  )
}
