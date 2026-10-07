import type { ComponentType } from 'react'
import { useLocation } from 'react-router'
import { btnSecondary } from '../../constants'
import type { EntityTable, FlatEntity } from '../../data'
import { useCampaign, type CampaignContextValue } from '../CampaignContext'
import { useEntity } from '../entities/useEntity'
import { entityPath } from '../navigation'
import { DetailNotice, Loading } from './DetailNotice'
import { parseEntityRoute } from './entityRoute'
import { canSee } from './format'
import { withSearch } from './listParams'

export interface EntityLabels {
  /** "No pudimos cargar el PNJ" */
  loadError: string
  /** "PNJ no encontrado" */
  notFound: string
  /** "Ese PNJ ya no existe o no podés verlo." */
  notFoundText: string
  /** "Esa dirección no corresponde a ningún PNJ." */
  invalidText: string
}

/** Whether the viewer may be shown this row (defense in depth on top of RLS). Default: not a draft unless DM. */
export type CanView = (entity: FlatEntity, viewer: CampaignContextValue) => boolean

const defaultCanView: CanView = (entity, { isDM }) => canSee(entity, isDM)

export interface EntityViewProps {
  entity: FlatEntity
  /** The list URL with its current query: "← Volver" keeps the filters. */
  listPath: string
}

/**
 * Loading / load-error / not-found gate of a detail URL. The view mounts only with a loaded, visible
 * entity (so `useStickyTitle`, which observes the h1 once, mounts together with it) and is keyed by id,
 * so local state (lightbox, ...) never leaks from one entity to the next.
 */
function EntityDetailGate({
  table,
  id,
  labels,
  View,
  canView,
}: {
  table: EntityTable
  id: number
  labels: EntityLabels
  View: ComponentType<EntityViewProps>
  canView: CanView
}) {
  const viewer = useCampaign()
  const { campaign } = viewer
  const { entity, loading, notFound, error, reload } = useEntity(table, id)
  const { search } = useLocation()
  const listPath = withSearch(entityPath(campaign.slug, table), search)

  if (loading) return <Loading />
  if (error && !entity) {
    return (
      <DetailNotice
        title={labels.loadError}
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
  if (notFound || !entity || !canView(entity, viewer)) {
    return (
      <DetailNotice title={labels.notFound} to={listPath}>
        {labels.notFoundText}
      </DetailNotice>
    )
  }
  return <View key={entity.id} entity={entity} listPath={listPath} />
}

/**
 * `/c/:slug/<section>` (list) and `/c/:slug/<section>/:id` (detail): the URL is the only navigation
 * state. A segment that is not an id never reaches a query.
 */
export function EntitySectionRoute({
  id,
  table,
  labels,
  List,
  View,
  canView = defaultCanView,
}: {
  id: string | undefined
  table: EntityTable
  labels: EntityLabels
  List: ComponentType
  View: ComponentType<EntityViewProps>
  /** Rows the viewer may open by URL; a page widens it when RLS shows more (a player's own draft character). */
  canView?: CanView
}) {
  const route = parseEntityRoute(id)
  const { campaign } = useCampaign()
  const { search } = useLocation()
  if (route.kind === 'list') return <List />
  if (route.kind === 'invalid') {
    return (
      <DetailNotice title={labels.notFound} to={withSearch(entityPath(campaign.slug, table), search)}>
        {labels.invalidText}
      </DetailNotice>
    )
  }
  return <EntityDetailGate table={table} id={route.id} labels={labels} View={View} canView={canView} />
}
