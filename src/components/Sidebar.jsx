import { useRef } from 'react'
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

export default function Sidebar({ currentPage, counts }) {
  const { navigate, sidebarOpen, toggleSidebar, exportData, importData } = useApp()
  const fileInputRef = useRef(null)

  function handleImportFile(e) {
    const file = e.target.files[0]
    if (file) importData(file)
    e.target.value = ''
  }

  return (
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
      </div>
    </nav>
  )
}
