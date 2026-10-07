import { useMemo } from 'react'
import { useLocation } from 'react-router'
import { BookOpen } from 'lucide-react'
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
import { CardTeaser, DetailHeading, DmBlock, DmDetailActions, EntityCard, EstadoTag, TextSection } from './EntityUi'
import { EntitySectionRoute, type EntityLabels, type EntityViewProps } from './EntitySectionRoute'
import { EntityTimestamps } from './EntityTimestamps'
import { canSee, str } from './format'
import { useUrlParam } from './listParams'
import { useMarkRead } from './useMarkRead'

const LABELS: EntityLabels = {
  loadError: 'No pudimos cargar la entrada',
  notFound: 'Entrada no encontrada',
  notFoundText: 'Esa entrada ya no existe o no podés verla.',
  invalidText: 'Esa dirección no corresponde a ninguna entrada de lore.',
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function LoreView({ entity, listPath }: EntityViewProps) {
  const { isDM } = useCampaign()
  const dm = useDmNotes('lore', entity.id, entity.updated_at)
  const { backBarRef, nameRef, showNameInHeader } = useStickyTitle()
  useMarkRead('lore', entity)

  const titulo = str(entity.titulo) || 'Sin título'
  const categoria = str(entity.categoria)
  const icon = <BookOpen size={18} className="inline mr-1 text-accent-bright" />

  return (
    <div>
      <DetailBackBar to={listPath} barRef={backBarRef} name={<>{icon}{titulo}</>} showName={showNameInHeader}>
        {isDM && <DmDetailActions table="lore" entity={entity} listPath={listPath} />}
      </DetailBackBar>

      <DetailHeading
        eyebrow={`Lore · ${categoria || 'General'}`}
        nameRef={nameRef}
        title={titulo}
        tags={
          <>
            {categoria && <Tag cls="neutral" text={categoria} />}
            <EstadoTag estado={entity.estado} />
          </>
        }
      />
      <EntityTimestamps createdAt={entity.created_at} updatedAt={entity.updated_at} />

      <TextSection title="Descripción" text={str(entity.descripcion)} />
      <DmBlock title="Secretos DM" text={isDM ? dm.fields.notas : ''} />
      {isDM && dm.status === 'error' && <DmNotice onRetry={dm.refresh}>No pudimos cargar las notas del DM.</DmNotice>}
      <PlayerNotes entityType="lore" entityId={entity.id} />
    </div>
  )
}

function LoreList() {
  const { campaign, isDM } = useCampaign()
  const { items, loading, error, reload } = useEntities('lore')
  const { openForm } = useEntityForm()
  const { search } = useLocation()
  const [filtro, setFiltro] = useUrlParam('cat', 'todos')

  const visible = useMemo(() => items.filter((l: FlatEntity) => canSee(l, isDM)), [items, isDM])
  const categorias = useMemo(() => [...new Set(visible.map((l) => str(l.categoria)).filter(Boolean))], [visible])
  const filtros = useMemo(() => [{ value: 'todos', label: 'Todos' }, ...categorias.map((c) => ({ value: c, label: capitalize(c) }))], [categorias])
  // the categories come from the data: a category that no longer exists (stale link) reads as "Todos"
  const activo = categorias.includes(filtro) ? filtro : 'todos'
  const lista = useMemo(() => (activo === 'todos' ? visible : visible.filter((l) => l.categoria === activo)), [visible, activo])

  return (
    <div>
      <PageHeader eyebrow="Historia y Conocimiento" title="Lore del Mundo" titleAs="h1">
        {isDM && (
          <button type="button" className={btnPrimary} onClick={() => openForm({ type: 'lore' })}>
            + Nueva Entrada
          </button>
        )}
      </PageHeader>

      <FilterPills options={filtros} value={activo} onChange={setFiltro} />

      {loading ? (
        <Loading />
      ) : error && items.length === 0 ? (
        <p role="alert" className="text-sm text-txt-secondary">
          No pudimos cargar el lore.{' '}
          <button type="button" className={btnSecondary} onClick={reload}>
            Reintentar
          </button>
        </p>
      ) : lista.length === 0 ? (
        <EmptyState icon={<BookOpen size={40} />} title="Sin entradas" text={`Agregá entradas de lore para documentar el mundo de ${campaign.name}.`} />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3.5">
          {lista.map((l) => (
            <EntityCard
              key={l.id}
              slug={campaign.slug}
              table="lore"
              entity={l}
              search={search}
              title={str(l.titulo) || 'Sin título'}
              icon={<BookOpen size={16} className="opacity-55 flex-shrink-0" aria-hidden="true" />}
              tags={
                <>
                  {str(l.categoria) && <Tag cls="neutral" text={str(l.categoria)} />}
                  <EstadoTag estado={l.estado} />
                </>
              }
            >
              <CardTeaser>{plainText(str(l.descripcion))}</CardTeaser>
            </EntityCard>
          ))}
        </div>
      )}
    </div>
  )
}

/** `/c/:slug/lore` (cards + category filter) and `/c/:slug/lore/:id` (detail). */
export function LorePage({ id }: SectionPageProps) {
  return <EntitySectionRoute id={id} table="lore" labels={LABELS} List={LoreList} View={LoreView} />
}
