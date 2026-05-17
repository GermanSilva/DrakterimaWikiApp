import { useApp } from '../AppContext'
import { RelacionTag } from '../components/Shared'
import { isVisible } from '../helpers'
import { Scroll, Shield, Users, Map, Landmark, BookOpen } from 'lucide-react'

const STAT_ITEMS = [
  { key: 'sesiones', Icon: Scroll,    label: 'Sesiones' },
  { key: 'pjs',      Icon: Shield,    label: 'Jugadores' },
  { key: 'pnjs',     Icon: Users,     label: 'PNJs' },
  { key: 'lugares',  Icon: Map,       label: 'Lugares' },
  { key: 'facciones',Icon: Landmark,  label: 'Facciones' },
  { key: 'lore',     Icon: BookOpen,  label: 'Lore' },
]

export default function Dashboard() {
  const { db, navigate, goToDetail, isDM, currentPlayer } = useApp()
  const visibleSesiones = db.sesiones.filter(s => isVisible(s, isDM, currentPlayer))
  const lastSesion = visibleSesiones.length ? visibleSesiones[visibleSesiones.length - 1] : null
  const nextSesion = visibleSesiones.find(s => !s.logros?.trim()) ?? null
  const recentPNJs = db.pnjs.filter(p => isVisible(p, isDM, currentPlayer)).slice(-3).reverse()

  return (
    <div>
      <div className="mb-7 pb-5 border-b border-border-base">
        <div className="font-exo text-[10px] tracking-[0.3em] text-txt-muted uppercase mb-1 font-medium">
          Vista General
        </div>
        <div className="font-exo text-[26px] font-bold text-txt-primary tracking-[0.04em] uppercase">
          Panel de Campaña
        </div>
        <div className="text-sm text-txt-secondary italic mt-1">
          Leyendas de Drakterima · D&D 5E Homebrew
        </div>
      </div>

      <div className="bg-[rgba(220,38,38,0.04)] border border-accent-dim px-5 py-4 mb-6">
        <div className="font-exo text-[11px] font-semibold tracking-[0.2em] text-accent uppercase mb-2">
          🐉 Conflicto Central
        </div>
        <div className="text-sm text-txt-secondary leading-[1.65] italic">
          Dos dragones milenarios —Argan y Ragon— libran una guerra de influencia sobre Drakterima. La Orden de Argan (diplomacia, estructura) y el Culto de Ragon (conquista, poder) son sus brazos. Los aventureros del Gremio, con sede en Kardevir, podrían cambiar el equilibrio del continente.
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(155px,1fr))] gap-3 mb-8">
        {STAT_ITEMS.map(({ key, Icon, label }) => (
          <div
            key={key}
            className="bg-bg-card border border-border-base px-5 py-[18px] cursor-pointer transition-all relative overflow-hidden before:absolute before:top-0 before:left-0 before:right-0 before:h-px before:content-[''] before:bg-border-light before:transition-colors hover:border-accent-dim hover:bg-bg-card-hover hover:before:bg-accent"
            onClick={() => navigate(key)}
          >
            <div className="text-[18px] mb-2.5 opacity-55">
              <Icon size={18} />
            </div>
            <div className="font-exo text-[34px] font-bold text-accent leading-none">
              {(db[key] || []).filter(e => isVisible(e, isDM, currentPlayer)).length}
            </div>
            <div className="font-exo text-[9px] font-medium tracking-[0.2em] text-txt-muted uppercase mt-1.5">
              {label}
            </div>
          </div>
        ))}
      </div>

      {isDM && nextSesion && (
        <>
          <Divider>Próxima Sesión</Divider>
          <div
            className="bg-bg-card border border-border-base border-l-[3px] border-l-accent px-[22px] py-[18px] mb-3.5 cursor-pointer"
            onClick={() => goToDetail('sesiones', nextSesion.id)}
          >
            <div className="font-exo text-[12px] font-semibold tracking-[0.05em] text-txt-primary mb-2 uppercase">
              📋 Sesión {nextSesion.numero} — {nextSesion.titulo || 'Sin título'}
            </div>
            {nextSesion.ganchos && (
              <div className="text-[13px] text-txt-secondary leading-[1.7]">
                <span className="text-txt-muted text-[11px] tracking-[0.1em] uppercase font-exo">Ganchos</span>
                <br />
                {nextSesion.ganchos.substring(0, 280)}{nextSesion.ganchos.length > 280 ? '…' : ''}
              </div>
            )}
          </div>
        </>
      )}

      {recentPNJs.length > 0 && (
        <>
          <Divider>PNJs Recientes</Divider>
          <div className="flex gap-3 mb-7 flex-wrap">
            {recentPNJs.map(p => (
              <div
                key={p.id}
                className="flex-1 min-w-[160px] max-w-[240px] bg-bg-card border border-border-base px-4 py-3.5 cursor-pointer transition-colors hover:border-accent-dim hover:bg-bg-card-hover"
                onClick={() => goToDetail('pnjs', p.id)}
              >
                <div className="font-exo text-[13px] font-semibold text-txt-primary tracking-[0.04em] mb-1">
                  {p.nombre}
                </div>
                {p.rol && <div className="text-[12px] text-txt-secondary">{p.rol}</div>}
                {p.relacion && (
                  <div className="mt-1.5">
                    <RelacionTag relacion={p.relacion} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <Divider>Lore del Mundo</Divider>

      <LoreBlock title="🏔️ Regiones de Drakterima">
        <strong className="text-txt-primary">Magral</strong> · Corazón fértil del sur. Capital: Genesia. Gobernada por la Orden de Argan.<br />
        <strong className="text-txt-primary">Nezor</strong> · Desierto del este. Organizado en clanes y confederaciones de caudillos del Culto de Ragon.<br />
        <strong className="text-txt-primary">Tierras Heladas</strong> · Norte implacable. Dominado por los Goliath. Independientes de Magral.<br />
        <strong className="text-txt-primary">Islas Pétreas</strong> · Archipiélago suroeste. Neutral. Industria minera, metalúrgica y naval.<br />
        <strong className="text-txt-primary">Kardevir</strong> · Ciudad del Paso. Centro geográfico. Sede del Gremio de Aventureros.
      </LoreBlock>

      <LoreBlock title="💎 La Magralita — Sangre del Mundo" accent>
        Mineral mágico de alto valor estratégico. Potencia objetos arcanos y estabiliza conjuros complejos. Su manipulación indebida genera inestabilidad peligrosa. Controlar sus yacimientos implica poder económico, militar y político.
      </LoreBlock>

      {lastSesion && (
        <>
          <Divider>Última Sesión</Divider>
          <div
            className="bg-bg-card border border-border-base border-l-[3px] border-l-accent-dim px-[22px] py-[18px] mb-3.5 cursor-pointer"
            onClick={() => navigate('sesiones')}
          >
            <div className="font-exo text-[12px] font-semibold tracking-[0.05em] text-txt-primary mb-2 uppercase">
              📜 {lastSesion.titulo || `Sesión ${lastSesion.numero}`}
            </div>
            <div className="text-[13px] text-txt-secondary leading-[1.7]">
              {(lastSesion.resumen || 'Sin resumen.').substring(0, 220)}
              {lastSesion.resumen?.length > 220 ? '...' : ''}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Divider({ children }) {
  return (
    <div className="flex items-center gap-3 my-6 text-txt-muted font-exo text-[10px] font-medium tracking-[0.2em] uppercase before:content-[''] before:flex-1 before:h-px before:bg-border-base after:content-[''] after:flex-1 after:h-px after:bg-border-base">
      {children}
    </div>
  )
}

function LoreBlock({ title, children, accent = false }) {
  return (
    <div className={`bg-bg-card border border-border-base border-l-[3px] px-[22px] py-[18px] mb-3.5 ${accent ? 'border-l-accent' : 'border-l-accent-dim'}`}>
      <div className="font-exo text-[12px] font-semibold tracking-[0.05em] text-txt-primary mb-2 uppercase">
        {title}
      </div>
      <div className="text-[13px] text-txt-secondary leading-[1.7]">
        {children}
      </div>
    </div>
  )
}
