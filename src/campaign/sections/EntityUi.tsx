import { useState, type ReactNode, type RefObject } from 'react'
import { Link, useNavigate } from 'react-router'
import { Lock } from 'lucide-react'
import ImageLightbox from '../../components/ImageLightbox'
import LazyImg from '../../components/LazyImg'
import { Tag } from '../../components/Shared'
import UnreadDot from '../../components/UnreadDot'
import { COLLECTION_LETTER } from '../../components/wikiHelpers'
import WikiText from '../../components/WikiText'
import { btnSecondary, detailSectionCls, entityCardCls, detailTextCls, dmSectionCls, dmTitleCls, sectionTitleCls } from '../../constants'
import type { EntityTable, FlatEntity } from '../../data'
import { useEntityForm, type EntityFormType } from '../entityFormContext'
import { entityPath } from '../navigation'
import { withSearch } from './listParams'
import { useRegionInfo } from './regions'

/** Players see "Secreto" on rows shared with them (legacy); published rows carry no estado tag. */
export function EstadoTag({ estado }: { estado: unknown }) {
  if (estado === 'borrador') return <Tag cls="borrador" text="Borrador" />
  if (estado === 'secreto') return <Tag cls="secreto" text="Secreto" />
  return null
}

/** Region tag: label and palette from the campaign config (unknown keys fall back to the legacy names, then the raw key). */
export function RegionTag({ region }: { region: string }) {
  const info = useRegionInfo()(region)
  return <Tag cls={info.tagClass} text={info.label} />
}

/** A titled public text block of a detail view (long text, wiki-links and Markdown rendered). */
export function TextSection({ title, text }: { title: string; text: string }) {
  if (!text) return null
  return (
    <div className={detailSectionCls}>
      <h2 className={sectionTitleCls}>{title}</h2>
      <div className={detailTextCls}>
        <WikiText text={text} />
      </div>
    </div>
  )
}

/** A DM-only block (lock + accent). Callers pass '' for players, so nothing is rendered. */
export function DmBlock({ title, text }: { title: string; text: string }) {
  if (!text) return null
  return (
    <div className={dmSectionCls}>
      <h2 className={dmTitleCls}>
        <Lock size={12} className="inline mr-1" aria-hidden="true" />
        {title}
      </h2>
      <div className={detailTextCls}>
        <WikiText text={text} />
      </div>
    </div>
  )
}

/** Detail image that opens the lightbox on click. The open state is local: the view is keyed by entity id. */
export function LightboxImage({ src, alt, className, containerCls }: { src: string; alt: string; className: string; containerCls: string }) {
  const [open, setOpen] = useState(false)
  if (!src) return null
  return (
    <>
      <LazyImg src={src} alt={alt} className={className} containerCls={containerCls} onClick={() => setOpen(true)} />
      {open && <ImageLightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  )
}

/**
 * DM controls of a detail bar: the `{idL}` wiki-link id (select-all, to paste into a text) and "Editar".
 * `formType` differs from `table` only for avances (a sesiones row edited with the avance form).
 */
export function DmDetailActions({
  table,
  entity,
  listPath,
  formType = table,
  showWikiId = true,
}: {
  table: EntityTable & EntityFormType
  entity: FlatEntity
  listPath: string
  formType?: EntityFormType
  showWikiId?: boolean
}) {
  const navigate = useNavigate()
  const { openForm } = useEntityForm()
  return (
    <>
      {showWikiId && (
        <span className="font-mono text-[11px] text-txt-muted select-all cursor-text opacity-50" title="ID para wiki-link">
          {`{${entity.id}${COLLECTION_LETTER[table as keyof typeof COLLECTION_LETTER]}}`}
        </span>
      )}
      <button
        type="button"
        className={btnSecondary}
        onClick={() => openForm({ type: formType, id: entity.id, onRemoved: () => navigate(listPath) })}
      >
        Editar
      </button>
    </>
  )
}

const CARD_CLS = `block ${entityCardCls}`

/** Card of a list grid: a real link to the detail URL (keeps the list's query), unread dot, title, icon, tags. */
export function EntityCard({
  slug,
  table,
  entity,
  search,
  title,
  icon,
  extra,
  tags,
  unread = true,
  children,
}: {
  slug: string
  table: EntityTable
  entity: FlatEntity
  search: string
  title: string
  icon: ReactNode
  /** Rendered next to the icon (the lock of a DM secret). */
  extra?: ReactNode
  tags: ReactNode
  /** False for tables without read tracking (homebrew_rules): no unread dot. */
  unread?: boolean
  children: ReactNode
}) {
  return (
    <Link to={withSearch(entityPath(slug, table, entity.id), search)} className={CARD_CLS}>
      {unread && <UnreadDot type={table} id={entity.id} updatedAt={entity.updated_at} className="absolute top-2 right-2" />}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="font-exo text-[13px] font-semibold text-txt-primary tracking-[0.03em]">{title}</div>
        <div className="flex items-center gap-1.5">
          {extra}
          {icon}
        </div>
      </div>
      <div className="flex flex-wrap gap-[5px] mb-2.5">{tags}</div>
      {children}
    </Link>
  )
}

/** Truncated plain-text teaser under a card's tags. */
export function CardTeaser({ children }: { children: string }) {
  return <div className="text-[13px] text-txt-secondary leading-relaxed italic line-clamp-3">{children}</div>
}

/** Full-width banner image of Lugares / Facciones / Ítems details (click opens the lightbox). */
export function HeroImage({ src, alt }: { src: string; alt: string }) {
  return (
    <LightboxImage
      src={src}
      alt={alt}
      className="max-w-full max-h-[280px] rounded-lg object-cover border border-border-base cursor-zoom-in"
      containerCls="my-4 h-[280px] flex items-center justify-center text-center"
    />
  )
}

/** Eyebrow + h1 (observed by `useStickyTitle` through `nameRef`) + optional subtitle + tags of a detail view. */
export function DetailHeading({
  eyebrow,
  eyebrowColor,
  nameRef,
  title,
  subtitle,
  tags,
}: {
  eyebrow: string
  eyebrowColor?: string
  nameRef: RefObject<HTMLHeadingElement>
  title: string
  subtitle?: string
  tags: ReactNode
}) {
  return (
    <div className="mb-8 pb-5 border-b border-border-base">
      <div
        className={`font-exo text-[10px] tracking-[0.3em] uppercase mb-1 font-medium ${eyebrowColor ? '' : 'text-txt-muted'}`}
        style={eyebrowColor ? { color: eyebrowColor } : undefined}
      >
        {eyebrow}
      </div>
      <h1 ref={nameRef} className="font-exo text-[26px] font-bold text-txt-primary tracking-[0.04em] uppercase">
        {title}
      </h1>
      {subtitle && <div className="font-exo text-[13px] text-txt-muted italic mt-1.5">{subtitle}</div>}
      <div className="flex flex-wrap gap-1.5 mt-2.5">{tags}</div>
    </div>
  )
}
