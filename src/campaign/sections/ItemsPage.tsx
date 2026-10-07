import { useLocation } from 'react-router'
import { Gem } from 'lucide-react'
import PlayerNotes from '../../components/PlayerNotes'
import { EmptyState, PageHeader, Tag } from '../../components/Shared'
import { btnPrimary, btnSecondary } from '../../constants'
import type { FlatEntity } from '../../data'
import useStickyTitle from '../../hooks/useStickyTitle'
import { plainText } from '../../helpers'
import { useCampaign } from '../CampaignContext'
import { useEntities } from '../entities/useEntities'
import { useEntityForm } from '../entityFormContext'
import type { SectionPageProps } from '../sections'
import { DetailBackBar } from './DetailBackBar'
import { Loading } from './DetailNotice'
import { CardTeaser, DetailHeading, DmDetailActions, EntityCard, EstadoTag, HeroImage, TextSection } from './EntityUi'
import { EntitySectionRoute, type EntityLabels, type EntityViewProps } from './EntitySectionRoute'
import { EntityTimestamps } from './EntityTimestamps'
import { canSee, str } from './format'
import { useMarkRead } from './useMarkRead'

const LABELS: EntityLabels = {
  loadError: 'No pudimos cargar el ítem',
  notFound: 'Ítem no encontrado',
  notFoundText: 'Ese ítem ya no existe o no podés verlo.',
  invalidText: 'Esa dirección no corresponde a ningún ítem.',
}

function ItemTags({ it }: { it: FlatEntity }) {
  const rareza = str(it.rareza)
  const tipo = str(it.tipo)
  return (
    <>
      {rareza && <Tag cls="neutral" text={rareza} />}
      {tipo && <Tag cls="orden" text={tipo} />}
      {/* truthy like legacy: imported data may carry "true" / 1 */}
      {Boolean(it.requiere_sintonia) && <Tag cls="culto" text="Sintonía" />}
      <EstadoTag estado={it.estado} />
    </>
  )
}

/**
 * Items have no DM-only fields in the legacy app (the item form has no notes), so this page never reads
 * the DM tables, not even for the DM.
 */
function ItemView({ entity, listPath }: EntityViewProps) {
  const { isDM } = useCampaign()
  const { backBarRef, nameRef, showNameInHeader } = useStickyTitle()
  useMarkRead('items', entity)

  const nombre = str(entity.nombre)
  const poseedor = str(entity.poseedor)
  const icon = <Gem size={18} className="inline mr-1 text-accent-bright" />

  return (
    <div>
      <DetailBackBar to={listPath} barRef={backBarRef} name={<>{icon}{nombre}</>} showName={showNameInHeader}>
        {isDM && <DmDetailActions table="items" entity={entity} listPath={listPath} />}
      </DetailBackBar>

      <DetailHeading
        eyebrow={[str(entity.tipo) || 'Ítem', str(entity.rareza)].filter(Boolean).join(' · ')}
        nameRef={nameRef}
        title={nombre}
        tags={<ItemTags it={entity} />}
      />
      <EntityTimestamps createdAt={entity.created_at} updatedAt={entity.updated_at} />

      <HeroImage src={str(entity.imagen_url)} alt={nombre} />

      {poseedor && (
        <div className="mb-3 mt-3">
          <span className="block font-exo text-[9px] font-medium tracking-[0.2em] text-txt-muted uppercase mb-0.5">Poseedor actual</span>
          <span className="text-sm text-txt-primary">{poseedor}</span>
        </div>
      )}
      <TextSection title="Propiedades" text={str(entity.descripcion)} />
      <TextSection title="Historia" text={str(entity.lore)} />
      <PlayerNotes entityType="items" entityId={entity.id} />
    </div>
  )
}

function ItemsList() {
  const { campaign, isDM } = useCampaign()
  const { items, loading, error, reload } = useEntities('items')
  const { openForm } = useEntityForm()
  const { search } = useLocation()
  const lista = items.filter((it) => canSee(it, isDM))

  return (
    <div>
      <PageHeader eyebrow="Homebrew · Tesoros" title="Ítems" titleAs="h1">
        {isDM && (
          <button type="button" className={btnPrimary} onClick={() => openForm({ type: 'items' })}>
            + Nuevo Ítem
          </button>
        )}
      </PageHeader>

      {loading ? (
        <Loading />
      ) : error && items.length === 0 ? (
        <p role="alert" className="text-sm text-txt-secondary">
          No pudimos cargar los ítems.{' '}
          <button type="button" className={btnSecondary} onClick={reload}>
            Reintentar
          </button>
        </p>
      ) : lista.length === 0 ? (
        <EmptyState
          icon={<Gem size={40} />}
          title="Sin ítems registrados"
          text={`Agregá ítems mágicos, objetos especiales o reglas homebrew de ${campaign.name}.`}
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3.5">
          {lista.map((it) => (
            <EntityCard
              key={it.id}
              slug={campaign.slug}
              table="items"
              entity={it}
              search={search}
              title={str(it.nombre)}
              icon={<Gem size={16} className="opacity-55 flex-shrink-0" aria-hidden="true" />}
              tags={<ItemTags it={it} />}
            >
              <CardTeaser>{plainText(str(it.descripcion))}</CardTeaser>
            </EntityCard>
          ))}
        </div>
      )}
    </div>
  )
}

/** `/c/:slug/items` (cards) and `/c/:slug/items/:id` (inline detail, like the other sections). */
export function ItemsPage({ id }: SectionPageProps) {
  return <EntitySectionRoute id={id} table="items" labels={LABELS} List={ItemsList} View={ItemView} />
}
