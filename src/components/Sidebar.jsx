import { useRef } from 'react'
import { useApp } from '../AppContext'
import {
  LayoutDashboard, Scroll, Shield, Users, Map,
  Landmark, BookOpen, Gem, Upload, Download,
} from 'lucide-react'

const NAV = [
  { section: 'Principal', items: [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Panel' },
    { id: 'sesiones', icon: Scroll, label: 'Sesiones', count: true },
  ]},
  { section: 'Personajes', items: [
    { id: 'pjs', icon: Shield, label: 'Jugadores (PJ)', count: true },
    { id: 'pnjs', icon: Users, label: 'PNJs', count: true },
  ]},
  { section: 'Mundo', items: [
    { id: 'lugares', icon: Map, label: 'Lugares', count: true },
    { id: 'facciones', icon: Landmark, label: 'Facciones', count: true },
    { id: 'lore', icon: BookOpen, label: 'Lore', count: true },
  ]},
  { section: 'Homebrew', items: [
    { id: 'items', icon: Gem, label: 'Ítems', count: true },
  ]},
]

export default function Sidebar({ currentPage, counts }) {
  const {
    navigate, sidebarOpen, toggleSidebar,
    exportData, importData,
    isDM,
  } = useApp()
  const fileInputRef = useRef(null)

  function handleImportFile(e) {
    const file = e.target.files[0]
    if (file) importData(file)
    e.target.value = ''
  }

  return (
    <nav
      className={[
        'fixed left-0 top-[60px] w-[240px] h-[calc(100vh-60px)]',
        'bg-bg-mid border-r border-border-base py-5 z-[200] overflow-y-auto flex flex-col',
        'transition-transform duration-[250ms] ease-in-out',
        'max-md:' + (sidebarOpen ? 'translate-x-0' : '-translate-x-full'),
        'md:translate-x-0',
      ].join(' ')}
    >
      {NAV.map(({ section, items }) => (
        <div key={section}>
          <div className="font-exo text-[9px] tracking-[0.3em] text-txt-muted uppercase px-[18px] pb-2 mt-5 first:mt-0 font-semibold">
            {section}
          </div>
          {items.map(item => {
            const Icon = item.icon
            const active = currentPage === item.id
            return (
              <div
                key={item.id}
                className={[
                  'flex items-center gap-2.5 px-[18px] py-[9px] cursor-pointer transition-all border-l-2 text-[13px]',
                  active
                    ? 'bg-accent/[.1] text-accent-bright border-l-accent'
                    : 'border-l-transparent text-txt-secondary hover:bg-accent/[.06] hover:text-txt-primary hover:border-l-accent-dim',
                ].join(' ')}
                onClick={() => { navigate(item.id); if (sidebarOpen) toggleSidebar() }}
              >
                <Icon size={15} className="w-5 text-center flex-shrink-0" />
                <span className="font-exo text-[11px] tracking-[0.06em] font-medium uppercase">
                  {item.label}
                </span>
                {item.count && (
                  <span className={[
                    'ml-auto text-[10px] font-exo px-1.5 py-0 rounded-sm min-w-[20px] text-center font-semibold',
                    active
                      ? 'bg-accent-subtle text-accent-bright'
                      : 'bg-border-light text-txt-muted',
                  ].join(' ')}>
                    {counts[item.id] || 0}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      ))}

      <div className="mt-auto pt-3 pb-2 border-t border-border-base">
        {isDM && (
          <>
            <div className="font-exo text-[9px] tracking-[0.3em] text-txt-muted uppercase px-[18px] pb-2 mt-5 font-semibold">
              Datos
            </div>
            <button
              className="flex items-center gap-2 w-full bg-transparent border-none text-txt-secondary text-[12px] font-exo tracking-[0.04em] cursor-pointer px-4 py-[7px] text-left rounded-md transition-colors hover:text-txt-primary hover:bg-white/[.04]"
              onClick={exportData}
            >
              <Upload size={14} className="opacity-70" />
              Exportar JSON
            </button>
            <button
              className="flex items-center gap-2 w-full bg-transparent border-none text-txt-secondary text-[12px] font-exo tracking-[0.04em] cursor-pointer px-4 py-[7px] text-left rounded-md transition-colors hover:text-txt-primary hover:bg-white/[.04]"
              onClick={() => fileInputRef.current.click()}
            >
              <Download size={14} className="opacity-70" />
              Importar JSON
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleImportFile}
            />
          </>
        )}
        <div className="font-exo text-[10px] tracking-[0.12em] text-txt-muted uppercase font-medium px-4 pt-2.5 opacity-60">
          Wiki del DM · D&D 5E
        </div>
      </div>
    </nav>
  )
}
