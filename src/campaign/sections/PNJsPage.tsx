import { useMemo } from 'react'
import { useLocation } from 'react-router'
import { Lock, Users } from 'lucide-react'
import PlayerNotes from '../../components/PlayerNotes'
import { EmptyState, FilterPills, PageHeader, RelacionTag, Tag } from '../../components/Shared'
import { btnPrimary, btnSecondary } from '../../constants'
import type { FlatEntity } from '../../data'
import useStickyTitle from '../../hooks/useStickyTitle'
import { plainText } from '../../helpers'
import { useCampaign } from '../CampaignContext'
import { useDmNotes } from '../entities/useDmNotes'
import { useDmSecretIds } from '../entities/useDmSecretIds'
import { useEntities } from '../entities/useEntities'
import { useEntityForm } from '../entityFormContext'
import type { SectionPageProps } from '../sections'
import { DetailBackBar } from './DetailBackBar'
import { DmNotice } from './DmNotice'
import { Loading } from './DetailNotice'
import { CardTeaser, DmBlock, DmDetailActions, EntityCard, EstadoTag, LightboxImage, RegionTag, TextSection } from './EntityUi'
import { EntitySectionRoute, type EntityLabels, type EntityViewProps } from './EntitySectionRoute'
import { EntityTimestamps } from './EntityTimestamps'
import { canSee, str } from './format'
import { useUrlParam } from './listParams'
import { useRegionInfo } from './regions'
import { useMarkRead } from './useMarkRead'

const FILTROS = [
  { value: 'todos', label: 'Todos' },
  { value: 'aliado', label: 'Aliados' },
  { value: 'neutral', label: 'Neutrales' },
  { value: 'enemigo', label: 'Enemigos' },
]

const LABELS: EntityLabels = {
  loadError: 'No pudimos cargar el PNJ',
  notFound: 'PNJ no encontrado',
  notFoundText: 'Ese PNJ ya no existe o no podés verlo.',
  invalidText: 'Esa dirección no corresponde a ningún PNJ.',
}

function PnjTags({ p, withRol = false }: { p: FlatEntity; withRol?: boolean }) {
  const region = str(p.region)
  const relacion = str(p.relacion)
  const faccion = str(p.faccion)
  const rol = str(p.rol)
  return (
    <>
      {withRol && rol && <Tag cls="neutral" text={rol} />}
      {region && <RegionTag region={region} />}
      {relacion && <RelacionTag relacion={relacion} />}
      {faccion && <Tag cls="orden" text={faccion} />}
      <EstadoTag estado={p.estado} />
    </>
  )
}

function PnjView({ entity, listPath }: EntityViewProps) {
  const { isDM } = useCampaign()
  const dm = useDmNotes('pnjs', entity.id, entity.updated_at)
  const regionInfo = useRegionInfo()
  const { backBarRef, nameRef, showNameInHeader } = useStickyTitle()
  useMarkRead('pnjs', entity)

  const nombre = str(entity.nombre)
  const imagen = str(entity.imagen_url)
  const icon = <Users size={18} className="inline mr-1 text-accent-bright" />

  return (
    <div>
      <DetailBackBar to={listPath} barRef={backBarRef} name={<>{icon}{nombre}</>} showName={showNameInHeader}>
        {isDM && <DmDetailActions table="pnjs" entity={entity} listPath={listPath} showWikiId={false} />}
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

        <LightboxImage
          src={imagen}
          alt={nombre}
          className="w-full h-full rounded-lg object-contain border border-border-base cursor-zoom-in"
          containerCls="h-[150px] min-w-[100px] max-w-fit flex items-center justify-center text-center"
        />
      </div>

      <div className="flex flex-col">
        <div>
          <TextSection title="Descripción" text={str(entity.descripcion)} />
          <TextSection title="Historia" text={str(entity.historia)} />
        </div>
        <div>
          <DmBlock title="Motivaciones secretas" text={isDM ? dm.fields.secreto : ''} />
          <DmBlock title="Notas DM" text={isDM ? dm.fields.notas : ''} />
        </div>
      </div>
      {isDM && dm.status === 'error' && <DmNotice onRetry={dm.refresh}>No pudimos cargar las notas del DM.</DmNotice>}
      <PlayerNotes entityType="pnjs" entityId={entity.id} />
    </div>
  )
}

function PnjCard({ p, slug, hasSecret, search }: { p: FlatEntity; slug: string; hasSecret: boolean; search: string }) {
  return (
    <EntityCard
      slug={slug}
      table="pnjs"
      entity={p}
      search={search}
      title={str(p.nombre)}
      icon={<Users size={16} className="opacity-55" aria-hidden="true" />}
      extra={
        hasSecret && (
          <span title="Tiene secreto DM" className="inline-flex">
            <Lock size={10} className="opacity-45" aria-label="Tiene secreto DM" role="img" />
          </span>
        )
      }
      tags={<PnjTags p={p} withRol />}
    >
      <CardTeaser>{plainText(str(p.descripcion)) || 'Sin descripción.'}</CardTeaser>
    </EntityCard>
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
  return <EntitySectionRoute id={id} table="pnjs" labels={LABELS} List={PnjList} View={PnjView} />
}
