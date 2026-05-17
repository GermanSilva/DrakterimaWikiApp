import { useRef, useState, useEffect } from 'react'
import { useApp } from '../AppContext'
import DragonIcon from '../svgs/dragonIcon'

const NAV = [
  { section: 'Principal', items: [
    { id: 'dashboard', icon: '⚔️', label: 'Panel' },
    { id: 'sesiones', icon: '📜', label: 'Sesiones', count: true },
  ]},
  { section: 'Personajes', items: [
    { id: 'pjs', icon: '🛡️', label: 'Jugadores (PJ)', count: true },
    { id: 'pnjs', icon: '🎭', label: 'PNJs', count: true },
  ]},
  { section: 'Mundo', items: [
    { id: 'lugares', icon: '🗺️', label: 'Lugares', count: true },
    { id: 'facciones', icon: '⚜️', label: 'Facciones', count: true },
    { id: 'lore', icon: '📖', label: 'Lore', count: true },
  ]},
  { section: 'Homebrew', items: [
    { id: 'items', icon: '💎', label: 'Ítems', count: true },
  ]},
]

function EyeToggle({ show, onToggle }) {
  return (
    <button type="button" className="pwd-toggle" onClick={onToggle} tabIndex={-1} title={show ? 'Ocultar' : 'Mostrar'}>
      {show ? '🙈' : '👁'}
    </button>
  )
}

function AccessModal({ onClose, onAccess }) {
  const [pwd, setPwd] = useState('')
  const [error, setError] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function handleAccess() {
    const result = onAccess(pwd)
    if (!result.success) {
      setError('Contraseña incorrecta.')
      setPwd('')
      inputRef.current?.focus()
      return
    }
    onClose()
  }

  return (
    <div className="dm-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dm-modal">
        <div className="dm-modal-icon">
          <DragonIcon width={150} height={150} fill="var(--accent)" />
        </div>
        <div className="dm-modal-title">Drakterima</div>
        <div className="dm-modal-subtitle">Ingresá tu contraseña para acceder</div>
        <div className="pwd-field">
          <input
            ref={inputRef}
            className="dm-modal-input"
            type={showPwd ? 'text' : 'password'}
            placeholder="Contraseña"
            value={pwd}
            onChange={e => { setPwd(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleAccess()}
          />
          <EyeToggle show={showPwd} onToggle={() => setShowPwd(v => !v)} />
        </div>
        {error && <div className="dm-modal-error">{error}</div>}
        <div className="dm-modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleAccess}>Entrar</button>
        </div>
      </div>
    </div>
  )
}

export default function Sidebar({ currentPage, counts }) {
  const {
    navigate, sidebarOpen, toggleSidebar,
    exportData, importData,
    isDM, lockDM,
    currentPlayer, logoutPlayer,
    tryAccess,
  } = useApp()
  const fileInputRef = useRef(null)
  const [showModal, setShowModal] = useState(false)

  function handleImportFile(e) {
    const file = e.target.files[0]
    if (file) importData(file)
    e.target.value = ''
  }

  const isAuthenticated = isDM || currentPlayer

  return (
    <>
      <nav id="sidebar">
        {NAV.map(({ section, items }) => (
          <div key={section}>
            <div className="nav-section-label">{section}</div>
            {items.map(item => (
              <div
                key={item.id}
                className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
                onClick={() => { navigate(item.id); if (sidebarOpen) toggleSidebar() }}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
                {item.count && <span className="nav-count">{counts[item.id] || 0}</span>}
              </div>
            ))}
          </div>
        ))}

        <div className="sidebar-footer">
          {isDM && (
            <>
              <div className="nav-section-label">Datos</div>
              <button className="sidebar-action-btn" onClick={exportData}>
                <span>↑</span> Exportar JSON
              </button>
              <button className="sidebar-action-btn" onClick={() => fileInputRef.current.click()}>
                <span>↓</span> Importar JSON
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={handleImportFile}
              />
            </>
          )}

          {!isAuthenticated && (
            <button className="sidebar-dm-btn" onClick={() => setShowModal(true)}>
              <span className="sidebar-dm-btn-icon">🔑</span>
              <span>Acceder</span>
            </button>
          )}
          {isDM && (
            <button className="sidebar-dm-btn sidebar-dm-btn--active" onClick={lockDM}>
              <span className="sidebar-dm-btn-icon">🔓</span>
              <span>Salir modo DM</span>
            </button>
          )}
          {currentPlayer && (
            <div className="sidebar-player-session">
              <div className="sidebar-player-name">👤 {currentPlayer.nombre}</div>
              <button className="sidebar-action-btn" onClick={logoutPlayer}>Cerrar sesión</button>
            </div>
          )}
        </div>
      </nav>

      {showModal && (
        <AccessModal
          onClose={() => setShowModal(false)}
          onAccess={tryAccess}
        />
      )}
    </>
  )
}
