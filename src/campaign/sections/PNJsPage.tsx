import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Lock, Users } from 'lucide-react'
import ImageLightbox from '../../components/ImageLightbox'
import LazyImg from '../../components/LazyImg'
import PlayerNotes from '../../components/PlayerNotes'
import { EmptyState, FilterPills, PageHeader, RelacionTag, Tag } from '../../components/Shared'
import UnreadDot from '../../components/UnreadDot'
import WikiText from '../../components/WikiText'
import { btnPrimary, btnSecondary, detailSectionCls, detailTextCls, dmSectionCls, dmTitleCls, sectionTitleCls } from '../../constants'
import type { FlatEntity } from '../../data'
import useStickyTitle from '../../hooks/useStickyTitle'
import { plainText } from '../../helpers'
import { useCampaign } from '../CampaignContext'
import { useDmNotes } from '../entities/useDmNotes'
import { useDmSecretIds } from '../entities/useDmSecretIds'
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
import { useRegionInfo } from './regions'
import { useMarkRead } from './useMarkRead'

const FILTROS = [
  { value: 'todos', label: 'Todos' },
  { value: 'aliado', label: 'Aliados' },
  { value: 'neutral', label: 'Neutrales' },
  { value: 'enemigo', label: 'Enemigos' },
]

/** RLS already withholds drafts from players; a draft that reached the client is still never rendered for a non-DM. */
const canSee = (p: FlatEntity, isDM: boolean) => isDM || p.estado !== 'borrador'

function EstadoTag({ estado }: { estado: unknown }) {
  if (estado === 'borrador') return <Tag cls="borrador" text="Borrador" />
  if (estado === 'secreto') return <Tag cls="secreto" text="Secreto" />
  return null
}

function PnjTags({ p, withRol = false }: { p: FlatEntity; withRol?: boolean }) {
  const regionInfo = useRegionInfo()
  const region = str(p.region)
  const relacion = str(p.relacion)
  const faccion = str(p.faccion)
  const rol = str(p.rol)
  return (
    <>
      {withRol && rol && <Tag cls="neutral" text={rol} />}
      {region && <Tag cls={regionInfo(region).tagClass} text={regionInfo(region).label} />}
      {relacion && <RelacionTag relacion={relacion} />}
      {faccion && <Tag cls="orden" text={faccion} />}
      <EstadoTag estado={p.estado} />
    </>
  )
}

function PnjDetail({ id }: { id: number }) {
  const { campaign, isDM } = useCampaign()
  const { entity, loading, notFound, error, reload } = useEntity('pnjs', id)
  const { search } = useLocation()
  const listPath = withSearch(entityPath(campaign.slug, 'pnjs'), search) // Volver keeps the list filters

  if (loading) return <Loading />
  if (error && !entity) {
    return (
      <DetailNotice
        title="No pudimos cargar el PNJ"
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
      <DetailNotice title="PNJ no encontrado" to={listPath}>
        Ese PNJ ya no existe o no podés verlo.
      </DetailNotice>
    )
  }

  return <PnjView entity={entity} listPath={listPath} />
}

/**
 * The loaded detail. Kept apart from the loading/not-found gate so `useStickyTitle` mounts together with
 * the title it observes (its effect runs once: a hook that mounted while the page still said
 * "Cargando…" would never see the h1).
 */
function PnjView({ entity, listPath }: { entity: FlatEntity; listPath: string }) {
  const { isDM } = useCampaign()
  const navigate = useNavigate()
  const dm = useDmNotes('pnjs', entity.id, entity.updated_at)
  const regionInfo = useRegionInfo()
  const { openForm } = useEntityForm()
  const [lightbox, setLightbox] = useState(false)
  const { backBarRef, nameRef, showNameInHeader } = useStickyTitle()
  useMarkRead('pnjs', entity)

  const nombre = str(entity.nombre)
  const imagen = str(entity.imagen_url)
  const descripcion = str(entity.descripcion)
  const historia = str(entity.historia)
  const secreto = isDM ? dm.fields.secreto : ''
  const notas = isDM ? dm.fields.notas : ''
  const icon = <Users size={18} className="inline mr-1 text-accent-bright" />

  return (
    <div>
      <DetailBackBar to={listPath} barRef={backBarRef} name={<>{icon}{nombre}</>} showName={showNameInHeader}>
        {isDM && (
          <button
            type="button"
            className={btnSecondary}
            onClick={() => openForm({ type: 'pnjs', id: entity.id, onRemoved: () => navigate(listPath) })}
          >
            Editar
          </button>
        )}
      </DetailBackBar>

      <div className="flex w-full gap-4 max-sm:flex-col">
        <div className="flex-1 flex flex-col gap-2 h-fit">
          <div className="pb-5 border-b border-border-base">
            <div
              className="font-exo text-[10px] tracking-[0.3em] uppercase mb-1 font-medium"
              style={{ color: regionInfo(str(entity.region)).color || '#6e6e6e' }}
            >
              PNJ · {str(entity.rol) || 'Personaje'}
            </div>
            <h1 ref={nameRef} className="font-exo text-[26px] font-bold text-txt-primary tracking-[0.04em] uppercase">
              {nombre}
            </h1>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              <PnjTags p={entity} />
            </div>
          </div>
          <EntityTimestamps createdAt={entity.created_at} updatedAt={entity.updated_at} />
        </div>

        {imagen && (
          <LazyImg
            src={imagen}
            alt={nombre}
            className="w-full h-full rounded-lg object-contain border border-border-base cursor-zoom-in"
            containerCls="h-[150px] min-w-[100px] max-w-fit flex items-center justify-center text-center"
            onClick={() => setLightbox(true)}
          />
        )}
        {lightbox && <ImageLightbox src={imagen} alt={nombre} onClose={() => setLightbox(false)} />}
      </div>

      <div className="flex flex-col">
        <div>
          {descripcion && (
            <div className={detailSectionCls}>
              <h2 className={sectionTitleCls}>Descripción</h2>
              <div className={detailTextCls}>
                <WikiText text={descripcion} />
              </div>
            </div>
          )}
          {historia && (
            <div className={detailSectionCls}>
              <h2 className={sectionTitleCls}>Historia</h2>
              <div className={detailTextCls}>
                <WikiText text={historia} />
              </div>
            </div>
          )}
        </div>
        <div>
          {secreto && (
            <div className={dmSectionCls}>
              <h2 className={dmTitleCls}>
                <Lock size={12} className="inline mr-1" aria-hidden="true" />
                Motivaciones secretas
              </h2>
              <div className={detailTextCls}>
                <WikiText text={secreto} />
              </div>
            </div>
          )}
          {notas && (
            <div className={dmSectionCls}>
              <h2 className={dmTitleCls}>
                <Lock size={12} className="inline mr-1" aria-hidden="true" />
                Notas DM
              </h2>
              <div className={detailTextCls}>
                <WikiText text={notas} />
              </div>
            </div>
          )}
        </div>
      </div>
      {isDM && dm.status === 'error' && <DmNotice onRetry={dm.refresh}>No pudimos cargar las notas del DM.</DmNotice>}
      <PlayerNotes entityType="pnjs" entityId={entity.id} />
    </div>
  )
}

function PnjCard({ p, slug, hasSecret, search }: { p: FlatEntity; slug: string; hasSecret: boolean; search: string }) {
  return (
    <Link
      to={withSearch(entityPath(slug, 'pnjs', p.id), search)}
      className="block bg-bg-card border border-border-base p-[18px] cursor-pointer transition-all relative overflow-hidden animate-card-in before:absolute before:top-0 before:left-0 before:right-0 before:h-0.5 before:content-[''] before:bg-border-light before:transition-colors hover:bg-bg-card-hover hover:border-accent-dim hover:before:bg-accent"
    >
      <UnreadDot type="pnjs" id={p.id} updatedAt={p.updated_at} className="absolute top-2 right-2" />
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="font-exo text-[13px] font-semibold text-txt-primary tracking-[0.03em]">{str(p.nombre)}</div>
        <div className="flex items-center gap-1.5">
          {hasSecret && (
            <span title="Tiene secreto DM" className="inline-flex">
              <Lock size={10} className="opacity-45" aria-label="Tiene secreto DM" role="img" />
            </span>
          )}
          <Users size={16} className="opacity-55" aria-hidden="true" />
        </div>
      </div>
      <div className="flex flex-wrap gap-[5px] mb-2.5">
        <PnjTags p={p} withRol />
      </div>
      <div className="text-[13px] text-txt-secondary leading-relaxed italic line-clamp-3">
        {plainText(str(p.descripcion)) || 'Sin descripción.'}
      </div>
    </Link>
  )
}

function PnjList() {
  const { campaign, isDM } = useCampaign()
  const { items, loading, error, reload } = useEntities('pnjs')
  const { openForm } = useEntityForm()
  const { search } = useLocation()
  const [filtro, setFiltro] = useUrlParam('rel', 'todos', FILTROS.map((f) => f.value))
  const [query, setQuery] = useUrlParam('q', '')

  const visible = useMemo(() => items.filter((p) => canSee(p, isDM)), [items, isDM])
  const secrets = useDmSecretIds('pnjs', useMemo(() => visible.map((p) => p.id), [visible]))
  const lista = useMemo(() => {
    const q = query.trim().toLowerCase()
    return visible
      .filter((p) => filtro === 'todos' || p.relacion === filtro)
      .filter((p) => q === '' || [p.nombre, p.rol, p.faccion].some((v) => str(v).toLowerCase().includes(q)))
  }, [visible, filtro, query])

  return (
    <div>
      <PageHeader eyebrow="Personajes No Jugadores" title="PNJs" titleAs="h1">
        {isDM && (
          <button type="button" className={btnPrimary} onClick={() => openForm({ type: 'pnjs' })}>
            + Nuevo PNJ
          </button>
        )}
      </PageHeader>

      <FilterPills options={FILTROS} value={filtro} onChange={setFiltro} />

      <div className="mb-5">
        <input
          type="search"
          aria-label="Buscar PNJs"
          className="w-full bg-bg-card border border-border-light text-txt-primary px-3.5 py-2.5 font-barlow text-[13px] outline-none transition-colors focus:border-accent-dim placeholder:text-txt-muted"
          placeholder="Buscar por nombre, rol o facción…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {isDM && secrets.status === 'error' && <DmNotice onRetry={secrets.refresh}>No pudimos cargar los secretos del DM (candados).</DmNotice>}

      {loading ? (
        <Loading />
      ) : error && items.length === 0 ? (
        <p role="alert" className="text-sm text-txt-secondary">
          No pudimos cargar los PNJs.{' '}
          <button type="button" className={btnSecondary} onClick={reload}>
            Reintentar
          </button>
        </p>
      ) : lista.length === 0 ? (
        <EmptyState
          icon={<Users size={40} />}
          title="Sin resultados"
          text={query ? 'No hay PNJs que coincidan con la búsqueda.' : `Agregá personajes no jugadores para poblar ${campaign.name}.`}
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3.5">
          {lista.map((p) => (
            <PnjCard key={p.id} p={p} slug={campaign.slug} hasSecret={isDM && secrets.ids.has(p.id)} search={search} />
          ))}
        </div>
      )}
    </div>
  )
}

/** `/c/:slug/pnjs` (cards + filters) and `/c/:slug/pnjs/:id` (detail): the URL is the only navigation state. */
export function PNJsPage({ id }: SectionPageProps) {
  const route = parseEntityRoute(id)
  const { campaign } = useCampaign()
  const { search } = useLocation()
  if (route.kind === 'list') return <PnjList />
  if (route.kind === 'invalid') {
    return (
      <DetailNotice title="PNJ no encontrado" to={withSearch(entityPath(campaign.slug, 'pnjs'), search)}>
        Esa dirección no corresponde a ningún PNJ.
      </DetailNotice>
    )
  }
  return <PnjDetail id={route.id} />
}
