import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Scroll } from 'lucide-react'
import ImageLightbox from '../../components/ImageLightbox'
import LazyImg from '../../components/LazyImg'
import PlayerNotes from '../../components/PlayerNotes'
import { EmptyState, PageHeader, Tag } from '../../components/Shared'
import UnreadDot from '../../components/UnreadDot'
import { COLLECTION_LETTER } from '../../components/wikiHelpers'
import WikiText from '../../components/WikiText'
import { btnPrimary, btnSecondary, detailTextCls, dmSectionCls, dmTitleCls, sectionTitleCls } from '../../constants'
import type { FlatEntity } from '../../data'
import useStickyTitle from '../../hooks/useStickyTitle'
import { plainText } from '../../helpers'
import { useCampaign } from '../CampaignContext'
import { useDmNotes } from '../entities/useDmNotes'
import { useEntities } from '../entities/useEntities'
import { useEntity } from '../entities/useEntity'
import { useEntityForm } from '../entityFormContext'
import { entityPath } from '../navigation'
import type { SectionPageProps } from '../sections'
import { DetailBackBar } from './DetailBackBar'
import { DmNotice } from './DmNotice'
import { useUrlParam, withSearch } from './listParams'
import { DetailNotice, Loading } from './DetailNotice'
import { EntityTimestamps } from './EntityTimestamps'
import { parseEntityRoute } from './entityRoute'
import { str } from './format'
import { useMarkRead } from './useMarkRead'

const TIPO_FILTERS = [
  { value: 'todos', label: 'Todos' },
  { value: 'sesion', label: 'Sesiones' },
  { value: 'avance', label: 'Avances' },
] as const

const isAvance = (s: FlatEntity) => s.tipo === 'avance'
/** A session without "momentos importantes" has not been played/written up yet. */
const isPlanned = (s: FlatEntity) => !isAvance(s) && str(s.logros).trim() === ''
const hasNumero = (s: FlatEntity) => s.numero !== null && s.numero !== undefined && s.numero !== ''
const kindLabel = (s: FlatEntity) => (isAvance(s) ? 'Avance' : hasNumero(s) ? `Sesión ${String(s.numero)}` : 'Sesión')

/**
 * Defense in depth: RLS already withholds drafts from players, but a draft that reached the client
 * (stale cache, misconfigured policy) is never rendered for a non-DM.
 */
const canSee = (s: FlatEntity, isDM: boolean) => isDM || s.estado !== 'borrador'

function EstadoTag({ estado }: { estado: unknown }) {
  if (estado === 'borrador') return <Tag cls="borrador" text="Borrador" />
  if (estado === 'secreto') return <Tag cls="secreto" text="Secreto" />
  return null
}

function SesionDetail({ id }: { id: number }) {
  const { campaign, isDM } = useCampaign()
  const { entity, loading, notFound, error, reload } = useEntity('sesiones', id)
  const { items } = useEntities('sesiones')
  const { search } = useLocation()
  const listPath = withSearch(entityPath(campaign.slug, 'sesiones'), search) // Volver keeps the list filters

  const visible = useMemo(() => items.filter((s) => canSee(s, isDM)), [items, isDM])
  const idx = visible.findIndex((s) => s.id === id)
  const prevId = idx > 0 ? visible[idx - 1].id : null
  const nextId = idx >= 0 && idx < visible.length - 1 ? visible[idx + 1].id : null

  if (loading) return <Loading />
  if (error && !entity) {
    return (
      <DetailNotice
        title="No pudimos cargar la sesión"
        to={listPath}
        alert
        action={
          <button type="button" className={btnSecondary} onClick={reload}>
            Reintentar
          </button>
        }
      >
        Hubo un problema de conexión. Volvé a intentar en unos segundos.
      </DetailNotice>
    )
  }
  if (notFound || !entity || !canSee(entity, isDM)) {
    return (
      <DetailNotice title="Sesión no encontrada" to={listPath}>
        Esa sesión ya no existe o no podés verla.
      </DetailNotice>
    )
  }

  return <SesionView entity={entity} prevId={prevId} nextId={nextId} listPath={listPath} search={search} />
}

/**
 * The loaded detail. Kept apart from the loading/not-found gate so `useStickyTitle` mounts together with
 * the title it observes (its effect runs once: a hook that mounted while the page still said
 * "Cargando…" would never see the h1).
 */
function SesionView({
  entity,
  prevId,
  nextId,
  listPath,
  search,
}: {
  entity: FlatEntity
  prevId: number | null
  nextId: number | null
  listPath: string
  search: string
}) {
  const { campaign, isDM } = useCampaign()
  const navigate = useNavigate()
  const dm = useDmNotes('sesiones', entity.id, entity.updated_at)
  const { openForm } = useEntityForm()
  const [lightbox, setLightbox] = useState(false)
  const { backBarRef, nameRef, showNameInHeader } = useStickyTitle()
  useMarkRead('sesiones', entity)

  const avance = isAvance(entity)
  const planned = isPlanned(entity)
  const title = str(entity.titulo) || 'Sin título'
  const imagen = str(entity.imagen_url)
  const texto = str(entity.texto)
  const resumen = str(entity.resumen)
  const logros = str(entity.logros)
  const fecha = str(entity.fecha)
  const dmNotas = isDM ? dm.fields.notas : ''
  const dmGanchos = isDM ? dm.fields.ganchos : ''
  const icon = <Scroll size={18} className="inline mr-1 text-accent-bright" />

  return (
    <div>
      <DetailBackBar to={listPath} barRef={backBarRef} name={<>{icon}{title}</>} showName={showNameInHeader}>
        {isDM && (
          <>
            <span className="font-mono text-[11px] text-txt-muted select-all cursor-text opacity-50" title="ID para wiki-link">
              {`{${entity.id}${COLLECTION_LETTER.sesiones}}`}
            </span>
            <button
              type="button"
              className={btnSecondary}
              onClick={() =>
                openForm({ type: avance ? 'avances' : 'sesiones', id: entity.id, onRemoved: () => navigate(listPath) })
              }
            >
              Editar
            </button>
          </>
        )}
        {prevId !== null && (
          <Link className={btnSecondary} to={withSearch(entityPath(campaign.slug, 'sesiones', prevId), search)}>
            ← Ant
          </Link>
        )}
        {nextId !== null && (
          <Link className={btnSecondary} to={withSearch(entityPath(campaign.slug, 'sesiones', nextId), search)}>
            Sig →
          </Link>
        )}
      </DetailBackBar>

      <div className="flex w-full gap-4 max-sm:flex-col">
        <div className="flex-1 flex flex-col gap-2 h-fit">
          <div className="pb-4 border-b border-border-base">
            <div className="font-exo text-[10px] tracking-[0.3em] text-txt-muted uppercase mb-1 font-medium">
              {kindLabel(entity)}
              {fecha && <> · {fecha}</>}
              {!avance && planned && (
                <span className="font-exo text-[9px] font-semibold tracking-[0.15em] uppercase text-txt-muted border border-border-light px-2 py-0.5 ml-2.5 align-middle">
                  Planificada
                </span>
              )}
              {(entity.estado === 'borrador' || entity.estado === 'secreto') && (
                <>
                  {' '}
                  <EstadoTag estado={entity.estado} />
                </>
              )}
            </div>
            <h1 ref={nameRef} className="font-exo text-[26px] font-bold text-txt-primary tracking-[0.04em] uppercase">
              {title}
            </h1>
          </div>
          <EntityTimestamps createdAt={entity.created_at} updatedAt={entity.updated_at} />
        </div>
        {imagen && (
          <LazyImg
            src={imagen}
            alt={str(entity.titulo)}
            className="max-w-full max-h-[120px] rounded-lg object-cover border border-border-base cursor-zoom-in"
            containerCls="my-1 shrink-0 max-w-[200px] h-[120px] flex items-center justify-center"
            onClick={() => setLightbox(true)}
          />
        )}
        {lightbox && <ImageLightbox src={imagen} alt={str(entity.titulo)} onClose={() => setLightbox(false)} />}
      </div>

      {avance ? (
        <>
          {texto && (
            <div className="mb-7 pb-6 border-b border-border-base mt-6">
              <h2 className={sectionTitleCls}>Contenido</h2>
              <div className={detailTextCls}>
                <WikiText text={texto} />
              </div>
            </div>
          )}
          {dmNotas && (
            <div className={`mb-7 pb-6 ${dmSectionCls}`}>
              <h2 className={dmTitleCls}>Notas del DM</h2>
              <div className={detailTextCls}>
                <WikiText text={dmNotas} />
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {resumen && (
            <div className="mb-7 pb-6 border-b border-border-base">
              <h2 className={sectionTitleCls}>Resumen</h2>
              <div className={detailTextCls}>
                <WikiText text={resumen} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-6 max-md:grid-cols-1">
            {logros && (
              <div className="mb-7 pb-6">
                <h2 className={sectionTitleCls}>Momentos importantes</h2>
                <div className={detailTextCls}>
                  <WikiText text={logros} />
                </div>
              </div>
            )}
            {dmGanchos && (
              <div className="mb-7 pb-6">
                <h2 className={sectionTitleCls}>Ganchos pendientes</h2>
                <div className={detailTextCls}>
                  <WikiText text={dmGanchos} />
                </div>
              </div>
            )}
          </div>
        </>
      )}
      {isDM && dm.status === 'error' && <DmNotice onRetry={dm.refresh}>No pudimos cargar las notas del DM.</DmNotice>}
      <PlayerNotes entityType="sesiones" entityId={entity.id} />
    </div>
  )
}

function SesionCard({ s, slug, search }: { s: FlatEntity; slug: string; search: string }) {
  const avance = isAvance(s)
  const planned = isPlanned(s)
  const text = plainText(avance ? str(s.texto) : str(s.resumen))
  const imagen = str(s.imagen_url)
  return (
    <Link to={withSearch(entityPath(slug, 'sesiones', s.id), search)} className="relative mb-5 cursor-pointer flex gap-3">
      <div
        aria-hidden="true"
        className={`absolute left-[-21px] top-[5px] w-2.5 h-2.5 border-2 border-bg-mid ${
          avance ? 'bg-accent/40 border-accent-dim rotate-45' : planned ? 'bg-transparent border-txt-muted' : 'bg-border-light'
        }`}
      />
      <div className="w-32 shrink-0 self-stretch min-h-[64px] bg-bg-mid overflow-hidden">
        {imagen && (
          <img
            src={imagen}
            alt={str(s.titulo)}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        )}
      </div>
      <div className="flex-1 min-w-0 relative">
        <div className="font-exo text-[10px] font-medium text-txt-muted mb-1.5 tracking-[0.1em] uppercase">
          {kindLabel(s)}
          {str(s.fecha) && ` · ${str(s.fecha)}`}
          {(s.estado === 'borrador' || s.estado === 'secreto') && (
            <>
              {' '}
              <EstadoTag estado={s.estado} />
            </>
          )}
          <UnreadDot type="sesiones" id={s.id} updatedAt={s.updated_at} className="absolute ml-1 mt-0.5" />
        </div>
        <div
          className={`font-exo text-[12px] font-semibold tracking-[0.04em] mb-1 uppercase ${
            avance ? 'text-accent-dim italic' : planned ? 'text-txt-secondary' : 'text-txt-primary'
          }`}
        >
          {str(s.titulo) || 'Sin título'}
        </div>
        <div className="text-[13px] text-txt-secondary leading-relaxed">{text.length > 180 ? `${text.substring(0, 180)}…` : text}</div>
      </div>
    </Link>
  )
}

function SesionesList() {
  const { campaign, isDM } = useCampaign()
  const { items, loading, error, reload } = useEntities('sesiones')
  const { openForm } = useEntityForm()
  const { search } = useLocation()
  const [tipoFilter, setTipoFilter] = useUrlParam('tipo', 'todos', TIPO_FILTERS.map((f) => f.value))

  // newest first, as the legacy timeline (the store sorts by timeline position, oldest first)
  const shown = useMemo(
    () =>
      items
        .filter((s) => canSee(s, isDM))
        .filter((s) => tipoFilter === 'todos' || String(s.tipo ?? 'sesion') === tipoFilter)
        .reverse(),
    [items, isDM, tipoFilter],
  )
  const total = useMemo(() => items.filter((s) => canSee(s, isDM)).length, [items, isDM])

  return (
    <div>
      <PageHeader eyebrow="Crónica" title="Sesiones" titleAs="h1">
        {isDM && (
          <div className="flex gap-2">
            <button type="button" className={btnSecondary} onClick={() => openForm({ type: 'avances' })}>
              + Nuevo Avance
            </button>
            <button type="button" className={btnPrimary} onClick={() => openForm({ type: 'sesiones' })}>
              + Nueva Sesión
            </button>
          </div>
        )}
      </PageHeader>

      {loading ? (
        <Loading />
      ) : error && items.length === 0 ? (
        <p role="alert" className="text-sm text-txt-secondary">
          No pudimos cargar las sesiones.{' '}
          <button type="button" className={btnSecondary} onClick={reload}>
            Reintentar
          </button>
        </p>
      ) : total === 0 ? (
        <EmptyState
          icon={<Scroll size={40} />}
          title="Sin sesiones registradas"
          text={`Registrá tu primera sesión para comenzar la crónica de ${campaign.name}.`}
        />
      ) : (
        <>
          <div className="flex gap-1 mb-6" role="group" aria-label="Filtrar por tipo">
            {TIPO_FILTERS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={tipoFilter === value}
                className={`font-exo text-[10px] tracking-[0.1em] uppercase px-3 py-1.5 border transition-colors cursor-pointer ${
                  tipoFilter === value
                    ? 'border-accent bg-accent/10 text-txt-primary'
                    : 'border-border-base text-txt-muted hover:border-border-light hover:text-txt-secondary'
                }`}
                onClick={() => setTipoFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative pl-6 timeline-wrap">
            {shown.map((s) => (
              <SesionCard key={s.id} s={s} slug={campaign.slug} search={search} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** `/c/:slug/sesiones` (timeline) and `/c/:slug/sesiones/:id` (detail): the URL is the only navigation state. */
export function SesionesPage({ id }: SectionPageProps) {
  const route = parseEntityRoute(id)
  const { campaign } = useCampaign()
  const { search } = useLocation()
  if (route.kind === 'list') return <SesionesList />
  if (route.kind === 'invalid') {
    return (
      <DetailNotice title="Sesión no encontrada" to={withSearch(entityPath(campaign.slug, 'sesiones'), search)}>
        Esa dirección no corresponde a ninguna sesión.
      </DetailNotice>
    )
  }
  return <SesionDetail id={route.id} />
}
