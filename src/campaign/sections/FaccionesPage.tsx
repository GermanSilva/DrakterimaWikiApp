import { useLocation } from 'react-router'
import { Landmark } from 'lucide-react'
import PlayerNotes from '../../components/PlayerNotes'
import { EmptyState, PageHeader, RelacionTag, Tag } from '../../components/Shared'
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
import { useRegionInfo } from './regions'
import { useMarkRead } from './useMarkRead'

const LABELS: EntityLabels = {
  loadError: 'No pudimos cargar la facción',
  notFound: 'Facción no encontrada',
  notFoundText: 'Esa facción ya no existe o no podés verla.',
  invalidText: 'Esa dirección no corresponde a ninguna facción.',
}

function FaccionTags({ f }: { f: FlatEntity }) {
  const region = str(f.region)
  const relacion = str(f.relacion)
  const tipo = str(f.tipo)
  return (
    <>
      {region && <RegionTag region={region} />}
      {relacion && <RelacionTag relacion={relacion} />}
      {tipo && <Tag cls="neutral" text={tipo} />}
      <EstadoTag estado={f.estado} />
    </>
  )
}

/** 'Facción' once: legacy data stores tipo 'facción' (the old form default), which would repeat the word. */
function faccionEyebrow(tipo: string): string {
  const t = tipo.trim()
  const plain = t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (plain === 'faccion') return 'Facción'
  return `Facción · ${t || 'Organización'}`
}

function FaccionView({ entity, listPath }: EntityViewProps) {
  const { isDM } = useCampaign()
  const dm = useDmNotes('facciones', entity.id, entity.updated_at)
  const regionInfo = useRegionInfo()
  const { backBarRef, nameRef, showNameInHeader } = useStickyTitle()
  useMarkRead('facciones', entity)

  const nombre = str(entity.nombre)
  const icon = <Landmark size={18} className="inline mr-1 text-accent-bright" />

  return (
    <div>
      <DetailBackBar to={listPath} barRef={backBarRef} name={<>{icon}{nombre}</>} showName={showNameInHeader}>
        {isDM && <DmDetailActions table="facciones" entity={entity} listPath={listPath} />}
      </DetailBackBar>

      <DetailHeading
        eyebrow={faccionEyebrow(str(entity.tipo))}
        eyebrowColor={regionInfo(str(entity.region)).color || '#6e6e6e'}
        nameRef={nameRef}
        title={nombre}
        tags={<FaccionTags f={entity} />}
      />
      <EntityTimestamps createdAt={entity.created_at} updatedAt={entity.updated_at} />

      <HeroImage src={str(entity.imagen_url)} alt={nombre} />

      <div className="grid grid-cols-2 gap-0 gap-x-8 max-md:grid-cols-1">
        <div>
          <TextSection title="Descripción" text={str(entity.descripcion)} />
        </div>
        <div>
          <DmBlock title="Objetivos secretos" text={isDM ? dm.fields.secreto : ''} />
          <DmBlock title="Notas DM" text={isDM ? dm.fields.notas : ''} />
        </div>
      </div>
      {isDM && dm.status === 'error' && <DmNotice onRetry={dm.refresh}>No pudimos cargar las notas del DM.</DmNotice>}
      <PlayerNotes entityType="facciones" entityId={entity.id} />
    </div>
  )
}

function FaccionesList() {
  const { campaign, isDM } = useCampaign()
  const { items, loading, error, reload } = useEntities('facciones')
  const { openForm } = useEntityForm()
  const { search } = useLocation()
  const lista = items.filter((f) => canSee(f, isDM))

  return (
    <div>
      <PageHeader eyebrow="Política y Poder" title="Facciones" titleAs="h1">
        {isDM && (
          <button type="button" className={btnPrimary} onClick={() => openForm({ type: 'facciones' })}>
            + Nueva Facción
          </button>
        )}
      </PageHeader>

      {loading ? (
        <Loading />
      ) : error && items.length === 0 ? (
        <p role="alert" className="text-sm text-txt-secondary">
          No pudimos cargar las facciones.{' '}
          <button type="button" className={btnSecondary} onClick={reload}>
            Reintentar
          </button>
        </p>
      ) : lista.length === 0 ? (
        <EmptyState icon={<Landmark size={40} />} title="Sin facciones" text={`Agregá facciones para definir el poder en ${campaign.name}.`} />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3.5">
          {lista.map((f) => (
            <EntityCard
              key={f.id}
              slug={campaign.slug}
              table="facciones"
              entity={f}
              search={search}
              title={str(f.nombre)}
              icon={<Landmark size={16} className="opacity-55 flex-shrink-0" aria-hidden="true" />}
              tags={
                <>
                  {str(f.tipo) && <Tag cls="neutral" text={str(f.tipo)} />}
                  {str(f.region) && <RegionTag region={str(f.region)} />}
                  {str(f.relacion) && <RelacionTag relacion={str(f.relacion)} />}
                  <EstadoTag estado={f.estado} />
                </>
              }
            >
              <CardTeaser>{plainText(str(f.descripcion))}</CardTeaser>
            </EntityCard>
          ))}
        </div>
      )}
    </div>
  )
}

/** `/c/:slug/facciones` (cards) and `/c/:slug/facciones/:id` (detail). */
export function FaccionesPage({ id }: SectionPageProps) {
  return <EntitySectionRoute id={id} table="facciones" labels={LABELS} List={FaccionesList} View={FaccionView} />
}
