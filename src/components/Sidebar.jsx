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

function DMModal({ onClose, onUnlock }) {
  const [pwd, setPwd] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function handleSubmit() {
    if (!onUnlock(pwd)) {
      setError('Contraseña incorrecta.')
      setPwd('')
      inputRef.current?.focus()
    }
  }

  return (
    <div className="dm-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dm-modal">
        <div className="dm-modal-icon">🔒</div>
        <div className="dm-modal-title">Modo DM</div>
        <div className="dm-modal-subtitle">Ingresá la contraseña para acceder a la vista completa</div>
        <input
          ref={inputRef}
          className="dm-modal-input"
          type="password"
          placeholder="Contraseña"
          value={pwd}
          onChange={e => { setPwd(e.target.value); setError('') }}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        />
        {error && <div className="dm-modal-error">{error}</div>}
        <div className="dm-modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSubmit}>Entrar</button>
        </div>
      </div>
    </div>
  )
}

export default function Sidebar({ currentPage, counts }) {
  const { navigate, sidebarOpen, toggleSidebar, exportData, importData, isDM, unlockDM, lockDM } = useApp()
  const fileInputRef = useRef(null)
  const [showModal, setShowModal] = useState(false)

  function handleImportFile(e) {
    const file = e.target.files[0]
    if (file) importData(file)
    e.target.value = ''
  }

  function handleUnlock(pwd) {
    const ok = unlockDM(pwd)
    if (ok) setShowModal(false)
    return ok
  }

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
          {isDM ? (
            <button className="sidebar-dm-btn sidebar-dm-btn--active" onClick={lockDM}>
              <span className="sidebar-dm-btn-icon">🔓</span>
              <span>Salir modo DM</span>
            </button>
          ) : (
            <button className="sidebar-dm-btn" onClick={() => setShowModal(true)}>
              <span className="sidebar-dm-btn-icon">🔒</span>
              <span>Modo DM</span>
            </button>
          )}
        </div>
      </nav>

      {showModal && <DMModal onClose={() => setShowModal(false)} onUnlock={handleUnlock} />}
    </>
  )
}
