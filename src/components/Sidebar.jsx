import { useApp } from '../AppContext'
import {
  LayoutDashboard, Scroll, Shield, Users, Map,
  Landmark, BookOpen, Gem, NotebookPen, SlidersHorizontal, Dices,
} from 'lucide-react'

const NAV = [
  {
    section: 'Principal', items: [
      { id: 'dashboard', icon: LayoutDashboard, label: 'Panel' },
      { id: 'zonaDM', icon: SlidersHorizontal, label: 'Zona DM', dmOnly: true },
      { id: 'notas', icon: NotebookPen, label: 'Notas', count: true },
      { id: 'sesiones', icon: Scroll, label: 'Sesiones', count: true },
    ]
  },
  {
    section: 'Personajes', items: [
      { id: 'pjs', icon: Shield, label: 'Jugadores (PJ)', count: true },
      { id: 'pnjs', icon: Users, label: 'PNJs', count: true },
    ]
  },
  {
    section: 'Mundo', items: [
      { id: 'lugares', icon: Map, label: 'Lugares', count: true },
      { id: 'facciones', icon: Landmark, label: 'Facciones', count: true },
      { id: 'lore', icon: BookOpen, label: 'Lore', count: true },
    ]
  },
  {
    section: 'Homebrew', items: [
      { id: 'items', icon: Gem, label: 'Ítems', count: true },
      { id: 'juegos', icon: Dices, label: 'Juegos' },
    ]
  },
]

export default function Sidebar({ currentPage, counts }) {
  const { navigate, sidebarOpen, toggleSidebar, isDM } = useApp()

  return (
    <nav
      className={[
        'fixed left-0 top-[60px] w-[240px] h-[calc(100vh-60px)]',
        'bg-bg-mid border-r border-border-base py-5 z-[200] overflow-y-auto flex flex-col',
        'transition-transform duration-[250ms] ease-in-out',
        sidebarOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full',
        'md:translate-x-0',
      ].join(' ')}
    >
      {NAV.map(({ section, items }) => (
        <div key={section} className='mt-5 first:mt-0'>
          <div className="font-exo text-[9px] tracking-[0.3em] text-txt-muted uppercase px-[18px] pb-2 font-semibold">
            {section}
          </div>
          {items.filter(item => !item.dmOnly || isDM).map(item => {
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

      <div className="mt-auto pt-3 border-t border-border-base">
        <div className="font-exo text-[10px] text-center tracking-[0.12em] text-txt-muted uppercase font-medium opacity-60">
          Drakterima 2026 · D&D 5E
        </div>
      </div>
    </nav>
  )
}
