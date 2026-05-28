import { useApp } from '../AppContext'
import { RelacionTag } from '../components/Shared'
import { isVisible, plainText } from '../helpers'
import { Scroll, Shield, Users, Map, Landmark, BookOpen, Gem } from 'lucide-react'

const ARTICLE_COLLECTIONS = [
  { key: 'lugares', label: 'Lugar', Icon: Map },
  { key: 'facciones', label: 'Facción', Icon: Landmark },
  { key: 'lore', label: 'Lore', Icon: BookOpen },
  { key: 'items', label: 'Ítem', Icon: Gem },
]

function entityName(e) { return e.nombre || e.titulo || `#${e.id}` }

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}

const STAT_ITEMS = [
  { key: 'sesiones', Icon: Scroll, label: 'Sesiones' },
  { key: 'pjs', Icon: Shield, label: 'Jugadores' },
  { key: 'pnjs', Icon: Users, label: 'PNJs' },
  { key: 'lugares', Icon: Map, label: 'Lugares' },
  { key: 'facciones', Icon: Landmark, label: 'Facciones' },
  { key: 'lore', Icon: BookOpen, label: 'Lore' },
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
                {(() => { const t = plainText(nextSesion.ganchos); return t.length > 280 ? t.substring(0, 280) + '…' : t })()}
              </div>
            )}
          </div>
        </>
      )}

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
              {(() => { const t = plainText(lastSesion.resumen) || 'Sin resumen.'; return t.length > 220 ? t.substring(0, 220) + '…' : t })()}
            </div>
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
                className="flex-1 min-w-[160px] max-w-[240px] bg-bg-card border border-border-base px-4 py-3.5 cursor-pointer transition-colors hover:border-accent-dim hover:bg-bg-card-hover "
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

      {(() => {
        const articles = ARTICLE_COLLECTIONS.flatMap(({ key, label, Icon }) =>
          (db[key] || [])
            .filter(e => isVisible(e, isDM, currentPlayer) && e.createdAt)
            .map(e => ({ ...e, _coll: key, _label: label, _Icon: Icon }))
        ).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6)

        return (
          <>
            <Divider>Últimos Artículos</Divider>
            {articles.length === 0 ? (
              <div className="text-[13px] text-txt-muted italic text-center py-4">
                Sin artículos recientes. Ejecutá "Actualizar timestamps" en Zona DM para ver los existentes.
              </div>
            ) : (
              <div className="flex flex-col gap-2 mb-4">
                {articles.map(e => {
                  const Icon = e._Icon
                  const preview = plainText(e.descripcion)
                  return (
                    <div
                      key={`${e._coll}-${e.id}`}
                      className="bg-bg-card border border-border-base px-[18px] py-[14px] cursor-pointer transition-all hover:border-accent-dim hover:bg-bg-card-hover"
                      onClick={() => goToDetail(e._coll, e.id)}
                    >
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <div className="flex items-center gap-1.5 text-txt-muted">
                          <Icon size={11} />
                          <span className="font-exo text-[9px] font-semibold tracking-[0.2em] uppercase">{e._label}</span>
                        </div>
                        <span className="font-exo text-[10px] text-txt-muted flex-shrink-0">{formatDate(e.createdAt)}</span>
                      </div>
                      <div className="font-exo text-[13px] font-semibold text-txt-primary tracking-[0.03em]">
                        {entityName(e)}
                      </div>
                      {preview && (
                        <div className="text-[12px] text-txt-secondary mt-0.5 line-clamp-1">{preview}</div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )
      })()}
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
