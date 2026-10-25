import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { BookOpen, Gem, Landmark, Map, type LucideIcon } from 'lucide-react'
import { RelacionTag } from '../../components/Shared'
import type { Disponibilidad, FlatEntity } from '../../data'
import { plainText } from '../../helpers'
import { entityPath } from '../navigation'
import { str } from '../sections/format'
import { formatDay, type Article, type ArticleTable } from './dashboardData'

const SUMMARY_MAX = 220

const formatStamp = (value: unknown): string => {
  const date = typeof value === 'string' ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
}

export function Divider({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="flex items-center gap-4 mb-4 font-exo text-[10px] font-medium tracking-[0.3em] uppercase text-txt-muted">
      <span aria-hidden="true" className="flex-1 h-px bg-border-base" />
      {children}
      <span aria-hidden="true" className="flex-1 h-px bg-border-base" />
    </h2>
  )
}

export function PanelSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mb-8">
      <Divider id={id}>{title}</Divider>
      {children}
    </section>
  )
}

const tileCls = 'block bg-bg-card border border-border-base px-5 py-4 transition-colors hover:border-accent-dim hover:bg-bg-card-hover'
const tileLabelCls = 'font-exo text-[9px] font-semibold tracking-[0.25em] uppercase text-txt-muted mb-2'

function EmptyTile({ label, text }: { label: string; text: string }) {
  return (
    <div className="bg-bg-card border border-dashed border-border-base px-5 py-4">
      <h3 className={tileLabelCls}>{label}</h3>
      <p className="text-[13px] text-txt-muted italic">{text}</p>
    </div>
  )
}

/** "Última sesión" and "Próxima sesión" side by side (stacked on a phone). */
export function SessionTiles({ slug, last, next, nextNumber }: { slug: string; last: FlatEntity | null; next: Disponibilidad | null; nextNumber: number }) {
  const summary = last ? plainText(str(last.resumen)) || 'Sin resumen.' : ''
  const title = last ? str(last.titulo) || `Sesión ${String(last.numero ?? '')}`.trim() : ''
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {last ? (
        <Link to={entityPath(slug, 'sesiones', last.id)} className={`${tileCls} border-l-[3px] border-l-accent-dim`}>
          <h3 className={tileLabelCls}>Última sesión</h3>
          <div data-testid="tile-title" className="font-exo text-[13px] font-semibold tracking-[0.05em] text-txt-primary uppercase mb-1.5">
            {title}
          </div>
          <p className="text-[13px] text-txt-secondary leading-[1.7]">{summary.length > SUMMARY_MAX ? `${summary.slice(0, SUMMARY_MAX)}…` : summary}</p>
        </Link>
      ) : (
        <EmptyTile label="Última sesión" text="Todavía no hay sesiones." />
      )}
      {next && next.fecha_inicio ? (
        <Link to={`/c/${encodeURIComponent(slug)}/calendario`} className={`${tileCls} border-l-[3px] border-l-accent`}>
          <h3 className={tileLabelCls}>Próxima sesión</h3>
          <div className="font-exo text-[13px] font-semibold tracking-[0.05em] text-txt-primary uppercase">
            {`Sesión ${nextNumber} — ${formatDay(next.fecha_inicio)}${next.hora_inicio ? ` · ${next.hora_inicio.slice(0, 5)}` : ''}`}
          </div>
        </Link>
      ) : (
        <EmptyTile label="Próxima sesión" text="No hay una próxima sesión agendada." />
      )}
    </div>
  )
}

export function PnjTiles({ slug, pnjs }: { slug: string; pnjs: FlatEntity[] }) {
  if (pnjs.length === 0) return <p className="text-[13px] text-txt-muted italic text-center py-2">Todavía no hay PNJs.</p>
  return (
    <div className="flex flex-wrap gap-3">
      {pnjs.map((pnj) => (
        <Link key={pnj.id} to={entityPath(slug, 'pnjs', pnj.id)} className={`${tileCls} flex-1 basis-[200px] max-w-[300px]`}>
          <div data-testid="tile-title" className="font-exo text-[13px] font-semibold text-txt-primary tracking-[0.04em] mb-1">
            {str(pnj.nombre)}
          </div>
          {str(pnj.rol) && <div className="text-[12px] text-txt-secondary">{str(pnj.rol)}</div>}
          {str(pnj.relacion) && (
            <div className="mt-2">
              <RelacionTag relacion={str(pnj.relacion)} />
            </div>
          )}
        </Link>
      ))}
    </div>
  )
}

const ARTICLE_KIND: Record<ArticleTable, { label: string; Icon: LucideIcon }> = {
  lugares: { label: 'Lugar', Icon: Map },
  facciones: { label: 'Facción', Icon: Landmark },
  lore: { label: 'Lore', Icon: BookOpen },
  items: { label: 'Ítem', Icon: Gem },
}

export function ArticleList({ slug, articles }: { slug: string; articles: Article[] }) {
  if (articles.length === 0) return <p className="text-[13px] text-txt-muted italic text-center py-2">Sin artículos recientes.</p>
  return (
    <div className="flex flex-col gap-2">
      {articles.map(({ table, entity }) => {
        const { label, Icon } = ARTICLE_KIND[table]
        const preview = plainText(str(entity.descripcion))
        return (
          <Link key={`${table}-${entity.id}`} to={entityPath(slug, table, entity.id)} className={`${tileCls} !py-3.5`}>
            <div className="flex items-center justify-between gap-3 mb-1">
              <span className="flex items-center gap-1.5 text-txt-muted">
                <Icon size={11} aria-hidden="true" />
                <span className="font-exo text-[9px] font-semibold tracking-[0.2em] uppercase">{label}</span>
              </span>
              <span className="font-exo text-[10px] text-txt-muted flex-shrink-0">{formatStamp(entity.created_at)}</span>
            </div>
            <div data-testid="tile-title" className="font-exo text-[13px] font-semibold text-txt-primary tracking-[0.03em]">
              {str(entity.nombre) || str(entity.titulo) || `#${entity.id}`}
            </div>
            {preview && <div className="text-[12px] text-txt-secondary mt-0.5 line-clamp-1">{preview}</div>}
          </Link>
        )
      })}
    </div>
  )
}
