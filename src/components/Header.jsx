import { useState } from 'react'
import { useApp } from '../AppContext'
import DragonIcon from '../svgs/dragonIcon'
import AccessModal from './AccessModal'
import { Menu, Key, LockOpen, LogOut } from 'lucide-react'

function HeaderSession() {
  const { isDM, lockDM, currentPlayer, logoutPlayer, tryAccess, db } = useApp()
  const [showModal, setShowModal] = useState(false)

  if (!isDM && !currentPlayer) {
    return (
      <>
        <button
          className="flex items-center gap-1.5 border border-border-light text-txt-secondary text-[11px] font-exo font-semibold tracking-[0.08em] uppercase cursor-pointer px-3 py-1.5 rounded-md transition-colors hover:text-accent hover:border-accent-dim hover:bg-accent/[.06] whitespace-nowrap"
          onClick={() => setShowModal(true)}
        >
          <Key size={13} />
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
      <div className="flex items-center gap-2.5">
        <span className="font-exo text-[11px] font-semibold tracking-[0.05em] text-txt-secondary flex items-center gap-1.5 whitespace-nowrap">
          <LockOpen size={13} />
          Modo DM
        </span>
        <button
          className="flex items-center gap-1.5 border border-border-light text-txt-secondary text-[11px] font-exo font-semibold tracking-[0.08em] uppercase cursor-pointer px-3 py-1.5 rounded-md transition-colors hover:text-accent hover:border-accent-dim hover:bg-accent/[.06]"
          onClick={lockDM}
        >
          <LogOut size={13} />
          Salir
        </button>
      </div>
    )
  }

  const pj = db.pjs.find(p => p.id === currentPlayer.id)
  const displayName = pj
    ? `${pj.nombre}${pj.jugador ? ` [${pj.jugador}]` : ''}`
    : currentPlayer.nombre

  return (
    <div className="flex items-center gap-2.5">
      {pj?.imagen_url && (
        <img
          src={pj.imagen_url}
          alt={pj.nombre}
          className="w-[26px] h-[26px] rounded-full object-cover border border-border-base flex-shrink-0"
          onError={e => e.target.style.display = 'none'}
        />
      )}
      <span className="font-exo text-[11px] font-semibold tracking-[0.05em] text-txt-secondary whitespace-nowrap">
        {displayName}
      </span>
      <button
        className="flex items-center gap-1.5 border border-border-light text-txt-secondary text-[11px] font-exo font-semibold tracking-[0.08em] uppercase cursor-pointer px-3 py-1.5 rounded-md transition-colors hover:text-accent hover:border-accent-dim hover:bg-accent/[.06]"
        onClick={logoutPlayer}
      >
        <LogOut size={13} />
        Salir
      </button>
    </div>
  )
}

export default function Header() {
  const { toggleSidebar } = useApp()
  return (
    <header className="fixed top-0 left-0 right-0 h-[60px] bg-bg-mid border-b border-border-base flex items-center px-6 z-[100] gap-4 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:content-[''] after:bg-gradient-to-r after:from-transparent after:via-accent-dim after:to-transparent">
      <button
        className="md:hidden bg-transparent border-none text-txt-secondary cursor-pointer p-1 hover:text-txt-primary"
        onClick={toggleSidebar}
        aria-label="Menú"
      >
        <Menu size={20} />
      </button>
      <div className="flex items-center leading-none">
        <DragonIcon width={28} height={28} fill="#dc2626" />
      </div>
      <div className="flex flex-col">
        <span className="font-exo text-[9px] tracking-[0.3em] text-txt-muted uppercase font-medium">
          Leyendas de Drakterima
        </span>
        <span className="font-exo text-[17px] font-bold text-accent-bright tracking-[0.08em] uppercase">
          Dragones Revelados
        </span>
      </div>
      <div className="ml-auto flex items-center gap-2.5">
        <HeaderSession />
      </div>
    </header>
  )
}
