import { useMemo } from 'react'
import { useLocation } from 'react-router'
import { Map } from 'lucide-react'
import PlayerNotes from '../../components/PlayerNotes'
import { EmptyState, FilterPills, PageHeader, Tag } from '../../components/Shared'
import { btnPrimary, btnSecondary } from '../../constants'
import type { FlatEntity } from '../../data'
import useStickyTitle from '../../hooks/useStickyTitle'
import { plainText } from '../../helpers'
import { useCampaign } from '../CampaignContext'
import { useDmNotes } from '../entities/useDmNotes'
import { useEntities } from '../entities/useEntities'
import { useEntityForm } from '../entityFormContext'
import type { SectionPageProps } from '../sections'
import { DetailBackBar } from './DetailBackBar'
import { Loading } from './DetailNotice'
import { DmNotice } from './DmNotice'
import { CardTeaser, DetailHeading, DmBlock, DmDetailActions, EntityCard, EstadoTag, HeroImage, RegionTag, TextSection } from './EntityUi'
import { EntitySectionRoute, type EntityLabels, type EntityViewProps } from './EntitySectionRoute'
import { EntityTimestamps } from './EntityTimestamps'
import { canSee, str } from './format'
import { useUrlParam } from './listParams'
import { useRegionInfo, useRegionOptions } from './regions'
import { useMarkRead } from './useMarkRead'

const LABELS: EntityLabels = {
  loadError: 'No pudimos cargar el lugar',
  notFound: 'Lugar no encontrado',
  notFoundText: 'Ese lugar ya no existe o no podés verlo.',
  invalidText: 'Esa dirección no corresponde a ningún lugar.',
}

function LugarTags({ l }: { l: FlatEntity }) {
  const tipo = str(l.tipo)
  const region = str(l.region)
  return (
    <>
      {tipo && <Tag cls="neutral" text={tipo} />}
      {region && <RegionTag region={region} />}
      <EstadoTag estado={l.estado} />
    </>
  )
}

function LugarView({ entity, listPath }: EntityViewProps) {
  const { isDM } = useCampaign()
  const dm = useDmNotes('lugares', entity.id, entity.updated_at)
  const regionInfo = useRegionInfo()
  const { backBarRef, nameRef, showNameInHeader } = useStickyTitle()
  useMarkRead('lugares', entity)

  const nombre = str(entity.nombre)
  const region = str(entity.region)
  const icon = <Map size={18} className="inline mr-1 text-accent-bright" />

  return (
    <div>
      <DetailBackBar to={listPath} barRef={backBarRef} name={<>{icon}{nombre}</>} showName={showNameInHeader}>
        {isDM && <DmDetailActions table="lugares" entity={entity} listPath={listPath} />}
      </DetailBackBar>

      <DetailHeading
        eyebrow={[str(entity.tipo) || 'Lugar', region ? regionInfo(region).label : ''].filter(Boolean).join(' · ')}
        eyebrowColor={regionInfo(region).color || '#6e6e6e'}
        nameRef={nameRef}
        title={nombre}
        subtitle={str(entity.subtitulo)}
        tags={<LugarTags l={entity} />}
      />
      <EntityTimestamps createdAt={entity.created_at} updatedAt={entity.updated_at} />

      <HeroImage src={str(entity.imagen_url)} alt={nombre} />
      <TextSection title="Descripción" text={str(entity.descripcion)} />
      <DmBlock title="Notas DM" text={isDM ? dm.fields.notas : ''} />
      {isDM && dm.status === 'error' && <DmNotice onRetry={dm.refresh}>No pudimos cargar las notas del DM.</DmNotice>}
      <PlayerNotes entityType="lugares" entityId={entity.id} />
    </div>
  )
}

function LugaresList() {
  const { campaign, isDM } = useCampaign()
  const { items, loading, error, reload } = useEntities('lugares')
  const { openForm } = useEntityForm()
  const { search } = useLocation()
  const regions = useRegionOptions()
  const filtros = useMemo(() => [{ value: 'todos', label: 'Todos' }, ...regions.map((r) => ({ value: r.key, label: r.label }))], [regions])
  const [filtro, setFiltro] = useUrlParam('region', 'todos', filtros.map((f) => f.value))

  const visible = useMemo(() => items.filter((l) => canSee(l, isDM)), [items, isDM])
  const lista = useMemo(() => visible.filter((l) => filtro === 'todos' || l.region === filtro), [visible, filtro])

  return (
    <div>
      <PageHeader eyebrow="Geografía" title="Lugares" titleAs="h1">
        {isDM && (
          <button type="button" className={btnPrimary} onClick={() => openForm({ type: 'lugares' })}>
            + Nuevo Lugar
          </button>
        )}
      </PageHeader>

      <FilterPills options={filtros} value={filtro} onChange={setFiltro} />

      {loading ? (
        <Loading />
      ) : error && items.length === 0 ? (
        <p role="alert" className="text-sm text-txt-secondary">
          No pudimos cargar los lugares.{' '}
          <button type="button" className={btnSecondary} onClick={reload}>
            Reintentar
          </button>
        </p>
      ) : lista.length === 0 ? (
        <EmptyState icon={<Map size={40} />} title="Sin lugares" text={`Agregá lugares para poblar el mundo de ${campaign.name}.`} />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3.5">
          {lista.map((l) => (
            <EntityCard
              key={l.id}
              slug={campaign.slug}
              table="lugares"
              entity={l}
              search={search}
              title={str(l.nombre)}
              icon={<Map size={16} className="opacity-55 flex-shrink-0" aria-hidden="true" />}
              tags={<LugarTags l={l} />}
            >
              {str(l.subtitulo) && <div className="font-exo text-[11px] text-accent-dim italic mb-2">{str(l.subtitulo)}</div>}
              <CardTeaser>{plainText(str(l.descripcion))}</CardTeaser>
            </EntityCard>
          ))}
        </div>
      )}
    </div>
  )
}

/** `/c/:slug/lugares` (cards + region filter) and `/c/:slug/lugares/:id` (detail). */
export function LugaresPage({ id }: SectionPageProps) {
  return <EntitySectionRoute id={id} table="lugares" labels={LABELS} List={LugaresList} View={LugarView} />
}
