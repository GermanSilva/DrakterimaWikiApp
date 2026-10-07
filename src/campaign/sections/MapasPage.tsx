import { useCallback, useMemo } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { Map as MapIcon } from 'lucide-react'
import { EmptyState, PageHeader, Tag } from '../../components/Shared'
import { btnPrimary, btnSecondary } from '../../constants'
import type { FlatEntity } from '../../data'
import { parseHttpsUrl } from '../branding'
import { useCampaign } from '../CampaignContext'
import { useEntities } from '../entities/useEntities'
import { useEntityForm } from '../entityFormContext'
import { mapPath, mapsGridPath, parseTrail, trailForOpening } from '../maps/mapGeometry'
import { MapViewerPanel, type Crumb } from '../maps/MapViewerPanel'
import type { SectionPageProps } from '../sections'
import { DetailNotice, Loading } from './DetailNotice'
import { parseEntityRoute } from './entityRoute'
import { EstadoTag } from './EntityUi'
import { canSee, str } from './format'

/** Full-bleed section: everything that is not the viewer brings its own page padding. */
const PAD = 'px-10 max-md:px-5'

function MapCard({ slug, mapa }: { slug: string; mapa: FlatEntity }) {
  const image = parseHttpsUrl(mapa.imagen_url)
  const nombre = str(mapa.nombre)
  const descripcion = str(mapa.descripcion)
  return (
    <Link to={mapPath(slug, mapa.id)} className="block bg-bg-mid border border-border-base rounded hover:border-accent transition-colors overflow-hidden">
      {image ? (
        <img
          src={image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="w-full h-32 object-cover"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
      ) : (
        <div aria-hidden="true" className="w-full h-32 bg-[#111] flex items-center justify-center text-3xl">
          🗺
        </div>
      )}
      <div className="px-3 py-2">
        <div className="font-exo text-sm font-semibold text-txt-primary">{nombre || `Mapa #${mapa.id}`}</div>
        {descripcion && <div className="text-xs text-txt-muted mt-0.5 line-clamp-1">{descripcion}</div>}
        <div className="flex flex-wrap gap-1 mt-1.5">
          {Boolean(mapa.is_default) && <Tag cls="neutral" text="Por defecto" />}
          <EstadoTag estado={mapa.estado} />
        </div>
      </div>
    </Link>
  )
}

/** `/c/:slug/mapas`: opens the default map unless `?todos=1`; otherwise the grid of every map the viewer can see. */
function MapsIndex() {
  const { campaign, isDM } = useCampaign()
  const { items, loading, error, reload } = useEntities('mapas')
  const { openForm } = useEntityForm()
  const [params] = useSearchParams()
  const visible = useMemo(() => items.filter((m) => canSee(m, isDM)), [items, isDM])
  const wantsGrid = params.get('todos') !== null

  const def = visible.find((m) => m.is_default === true)
  if (!loading && !error && !wantsGrid && def) return <Navigate to={mapPath(campaign.slug, def.id)} replace />

  return (
    <div className={PAD}>
      <PageHeader eyebrow="Mundo · Cartografía" title="Mapas" titleAs="h1">
        {isDM && (
          <button type="button" className={btnPrimary} onClick={() => openForm({ type: 'mapas' })}>
            + Nuevo mapa
          </button>
        )}
      </PageHeader>
      {loading ? (
        <Loading />
      ) : error && items.length === 0 ? (
        <p role="alert" className="text-sm text-txt-secondary">
          No pudimos cargar los mapas.{' '}
          <button type="button" className={btnSecondary} onClick={reload}>
            Reintentar
          </button>
        </p>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<MapIcon size={40} />}
          title="Sin mapas"
          text={isDM ? 'Todavía no hay mapas. Creá el primero.' : 'No hay mapas disponibles.'}
        />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {visible.map((m) => (
            <MapCard key={m.id} slug={campaign.slug} mapa={m} />
          ))}
        </div>
      )}
    </div>
  )
}

/** `/c/:slug/mapas/:id[?trail=3,7]`: the viewer. Everything it shows comes from the viewer's own (RLS-filtered) lists. */
function MapDetail({ mapId }: { mapId: number }) {
  const { campaign, isDM } = useCampaign()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const maps = useEntities('mapas')
  const points = useEntities('map_points')
  const slug = campaign.slug
  const gridPath = mapsGridPath(slug)

  const visibleMaps = useMemo(() => maps.items.filter((m) => canSee(m, isDM)), [maps.items, isDM])
  const map = visibleMaps.find((m) => m.id === mapId) ?? null
  const rawTrail = params.get('trail')

  // Ancestors the viewer can actually see, in order; unknown / hidden ids silently drop out of the trail.
  const ancestors = useMemo(() => {
    const byId = new Map(visibleMaps.map((m) => [m.id, m]))
    return parseTrail(rawTrail)
      .filter((id) => id !== mapId)
      .flatMap((id) => {
        const found = byId.get(id)
        return found ? [found] : []
      })
  }, [rawTrail, visibleMaps, mapId])
  const crumbs = useMemo<Crumb[]>(
    () =>
      ancestors.map((a, i) => ({
        id: a.id,
        nombre: str(a.nombre),
        to: mapPath(
          slug,
          a.id,
          ancestors.slice(0, i).map((x) => x.id),
        ),
      })),
    [ancestors, slug],
  )

  const mapPoints = useMemo(() => points.items.filter((p) => p.map_id === mapId), [points.items, mapId])
  const visibleTargets = visibleMaps

  const openMap = useCallback(
    (targetId: number) => {
      const next = trailForOpening(
        ancestors.map((a) => a.id),
        mapId,
        targetId,
      )
      if (next) navigate(mapPath(slug, targetId, next))
    },
    [ancestors, mapId, navigate, slug],
  )
  const onMapRemoved = useCallback(() => navigate(gridPath), [navigate, gridPath])

  if (maps.loading && !map) {
    return (
      <div className={PAD}>
        <Loading />
      </div>
    )
  }
  if (maps.error && !map) {
    return (
      <div className={PAD}>
        <DetailNotice
          title="No pudimos cargar el mapa"
          to={gridPath}
          alert
          action={
            <button type="button" className={btnSecondary} onClick={maps.reload}>
              Reintentar
            </button>
          }
        >
          Hubo un problema de conexión. Volvé a intentar en unos segundos.
        </DetailNotice>
      </div>
    )
  }
  if (!map) {
    return (
      <div className={PAD}>
        <DetailNotice title="Mapa no encontrado" to={gridPath}>
          Ese mapa ya no existe o no podés verlo.
        </DetailNotice>
      </div>
    )
  }
  return (
    <MapViewerPanel
      key={map.id}
      map={map}
      points={mapPoints}
      pointsError={!!points.error && points.items.length === 0}
      onRetryPoints={points.reload}
      maps={visibleTargets}
      crumbs={crumbs}
      allMapsTo={gridPath}
      onOpenMap={openMap}
      onMapRemoved={onMapRemoved}
    />
  )
}

/** `/c/:slug/mapas` (default map or grid) and `/c/:slug/mapas/:id` (viewer); the URL is the only navigation state. */
export function MapasPage({ id }: SectionPageProps) {
  const route = parseEntityRoute(id)
  const { campaign } = useCampaign()
  if (route.kind === 'list') return <MapsIndex />
  if (route.kind === 'invalid') {
    return (
      <div className={PAD}>
        <DetailNotice title="Mapa no encontrado" to={mapsGridPath(campaign.slug)}>
          Esa dirección no corresponde a ningún mapa.
        </DetailNotice>
      </div>
    )
  }
  return <MapDetail mapId={route.id} />
}
