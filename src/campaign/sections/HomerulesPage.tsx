import { useLocation } from 'react-router'
import { Hammer } from 'lucide-react'
import { EmptyState, PageHeader } from '../../components/Shared'
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
import { CardTeaser, DetailHeading, DmDetailActions, EntityCard, EstadoTag, TextSection } from './EntityUi'
import { EntitySectionRoute, type EntityLabels, type EntityViewProps } from './EntitySectionRoute'
import { canSee, str } from './format'

const LABELS: EntityLabels = {
  loadError: 'No pudimos cargar la regla',
  notFound: 'Regla no encontrada',
  notFoundText: 'Esa regla ya no existe o no podés verla.',
  invalidText: 'Esa dirección no corresponde a ninguna regla.',
}

/**
 * `homebrew_rules` has only `nombre`, `texto` and `estado`: no DM notes, no player notes and no read
 * tracking, so this page never reads those tables and shows no unread dot, not even for the DM.
 */
function HomeruleView({ entity, listPath }: EntityViewProps) {
  const { isDM } = useCampaign()
  const { backBarRef, nameRef, showNameInHeader } = useStickyTitle()
  const nombre = str(entity.nombre)
  const icon = <Hammer size={18} className="inline mr-1 text-accent-bright" />

  return (
    <div>
      <DetailBackBar to={listPath} barRef={backBarRef} name={<>{icon}{nombre}</>} showName={showNameInHeader}>
        {isDM && <DmDetailActions table="homebrew_rules" entity={entity} listPath={listPath} />}
      </DetailBackBar>
      <DetailHeading eyebrow="Homebrew · Regla" nameRef={nameRef} title={nombre} tags={<EstadoTag estado={entity.estado} />} />
      <TextSection title="Texto" text={str(entity.texto)} />
    </div>
  )
}

function HomerulesList() {
  const { campaign, isDM } = useCampaign()
  const { items, loading, error, reload } = useEntities('homebrew_rules')
  const { openForm } = useEntityForm()
  const { search } = useLocation()
  const lista = items.filter((r: FlatEntity) => canSee(r, isDM))

  return (
    <div>
      <PageHeader eyebrow="Homebrew" title="Homerules" titleAs="h1">
        {isDM && (
          <button type="button" className={btnPrimary} onClick={() => openForm({ type: 'homebrew_rules' })}>
            + Nueva Regla
          </button>
        )}
      </PageHeader>

      {loading ? (
        <Loading />
      ) : error && items.length === 0 ? (
        <p role="alert" className="text-sm text-txt-secondary">
          No pudimos cargar las reglas.{' '}
          <button type="button" className={btnSecondary} onClick={reload}>
            Reintentar
          </button>
        </p>
      ) : lista.length === 0 ? (
        <EmptyState
          icon={<Hammer size={40} />}
          title="Sin reglas"
          text={`Agregá reglas homebrew para documentar las variantes de la mesa de ${campaign.name}.`}
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3.5">
          {lista.map((r) => (
            <EntityCard
              key={r.id}
              slug={campaign.slug}
              table="homebrew_rules"
              entity={r}
              search={search}
              unread={false}
              title={str(r.nombre)}
              icon={<Hammer size={16} className="opacity-55 flex-shrink-0" aria-hidden="true" />}
              tags={<EstadoTag estado={r.estado} />}
            >
              <CardTeaser>{plainText(str(r.texto))}</CardTeaser>
            </EntityCard>
          ))}
        </div>
      )}
    </div>
  )
}

/** `/c/:slug/homerules` (cards) and `/c/:slug/homerules/:id` (inline detail, like the other sections). */
export function HomerulesPage({ id }: SectionPageProps) {
  return <EntitySectionRoute id={id} table="homebrew_rules" labels={LABELS} List={HomerulesList} View={HomeruleView} />
}
