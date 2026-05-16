import { useRef, useState, useEffect } from 'react'
import { useApp } from '../AppContext'

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

function AccessModal({ onClose, onAccess, onChangePassword }) {
  const [step, setStep] = useState('password')
  const [pwd, setPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [error, setError] = useState('')
  const [pendingPj, setPendingPj] = useState(null)
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
    if (result.mustChange) {
      setPendingPj(result.pj)
      setStep('change')
      setError('')
      return
    }
    onClose()
  }

  function handleChangePassword() {
    if (!newPwd.trim()) { setError('Ingresá una nueva contraseña.'); return }
    if (newPwd !== confirmPwd) { setError('Las contraseñas no coinciden.'); return }
    onChangePassword(pendingPj.id, newPwd)
    onClose()
  }

  if (step === 'change') {
    return (
      <div className="dm-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="dm-modal">
          <div className="dm-modal-icon">🔑</div>
          <div className="dm-modal-title">Bienvenido/a, {pendingPj.nombre}</div>
          <div className="dm-modal-subtitle">Este es tu primer acceso. Elegí una contraseña nueva para continuar.</div>
          <input
            className="dm-modal-input"
            type="password"
            placeholder="Nueva contraseña"
            value={newPwd}
            onChange={e => { setNewPwd(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && confirmPwd && handleChangePassword()}
            autoFocus
          />
          <input
            className="dm-modal-input"
            type="password"
            placeholder="Confirmar contraseña"
            value={confirmPwd}
            onChange={e => { setConfirmPwd(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
            style={{ marginTop: 8 }}
          />
          {error && <div className="dm-modal-error">{error}</div>}
          <div className="dm-modal-actions">
            <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleChangePassword}>Confirmar</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="dm-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dm-modal">
        <div className="dm-modal-icon">🐉</div>
        <div className="dm-modal-title">Drakterima</div>
        <div className="dm-modal-subtitle">Ingresá tu contraseña para acceder</div>
        <input
          ref={inputRef}
          className="dm-modal-input"
          type="password"
          placeholder="Contraseña"
          value={pwd}
          onChange={e => { setPwd(e.target.value); setError('') }}
          onKeyDown={e => e.key === 'Enter' && handleAccess()}
        />
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
    tryAccess, changePlayerPassword,
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
          onChangePassword={changePlayerPassword}
        />
      )}
    </>
  )
}
