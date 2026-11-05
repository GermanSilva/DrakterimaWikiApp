import { useMemo } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { Shield } from 'lucide-react'
import { EmptyState, PageHeader } from '../../components/Shared'
import UnreadDot from '../../components/UnreadDot'
import { btnPrimary, btnSecondary, entityCardCls } from '../../constants'
import type { FlatEntity } from '../../data'
import { isPjUnreadVia } from '../../helpers/pjSections'
import PJDetail from '../../pages/pj/PJDetail'
import { PJCardContent } from '../../pages/pj/PJCardContent'
import { searchableLabels, searchableTags, storedSheet, type SearchableTag } from '../system/sheet/searchable'
import { validateSheet } from '../system/sheet/sheetModel'
import { useSystem } from '../system/useSystem'
import type { SystemProfile } from '../system/systemProfile'
import { useUnreadPort } from '../../ports'
import { parseCharacterFields } from '../adapters/hubFormPort'
import { useCampaign, type CampaignContextValue } from '../CampaignContext'
import { useDmNotes } from '../entities/useDmNotes'
import { useDmSecretIds } from '../entities/useDmSecretIds'
import { useEntities } from '../entities/useEntities'
import { useEntityActions } from '../entities/useEntityActions'
import { useEntityForm } from '../entityFormContext'
import { entityPath } from '../navigation'
import type { SectionPageProps } from '../sections'
import { Loading } from './DetailNotice'
import { DmNotice } from './DmNotice'
import { EntitySectionRoute, type EntityLabels, type EntityViewProps } from './EntitySectionRoute'
import { RegionTag } from './EntityUi'
import { str } from './format'
import { useUrlParam, withSearch } from './listParams'
import { useRegionInfo } from './regions'

const LABELS: EntityLabels = {
  loadError: 'No pudimos cargar el personaje',
  notFound: 'Personaje no encontrado',
  notFoundText: 'Ese personaje ya no existe o no podés verlo.',
  invalidText: 'Esa dirección no corresponde a ningún personaje.',
}

/**
 * RLS lets a player read their own character in any `estado`, so the page must not hide an owner's own draft
 * (the generic rule hides every draft from non-DMs).
 */
const canViewPj = (pj: FlatEntity, { isDM, myCharacterIds }: CampaignContextValue): boolean =>
  isDM || pj.estado !== 'borrador' || myCharacterIds.includes(pj.id)

/** The search box says which of the built-in fields it reads (the ones the campaign's system uses). */
function searchPlaceholder(system: SystemProfile, extra: string[]): string {
  const { clase, raza } = system.character.builtins
  const fields = ['nombre', ...(clase.enabled ? ['clase'] : []), ...(raza.enabled ? ['raza'] : []), 'jugador', ...extra]
  return `Buscar por ${fields.slice(0, -1).join(', ')} o ${fields[fields.length - 1]}…`
}

function PjView({ entity, listPath }: EntityViewProps) {
  const { campaign, isDM, myCharacterIds } = useCampaign()
  const navigate = useNavigate()
  const { openForm } = useEntityForm()
  const actions = useEntityActions('pjs')
  const dm = useDmNotes('pjs', entity.id, entity.updated_at)
  const regionInfo = useRegionInfo()
  const customFields = useMemo(() => parseCharacterFields(campaign.character_custom_fields), [campaign.character_custom_fields])
  const system = useSystem()
  const [params] = useSearchParams()
  // The sheet renderer is opt-in (?sheet=1) until it reaches parity and the data is migrated; an invalid sheet never gets here
  const sheet = useMemo(() => {
    if (params.get('sheet') !== '1' || !system.sheet) return null
    const result = validateSheet(system.sheet)
    return result.ok ? result.sheet : null
  }, [params, system.sheet])
  const isOwnPlayer = !isDM && myCharacterIds.includes(entity.id)

  const edit = () => openForm({ type: 'pjs', id: entity.id, onRemoved: () => navigate(listPath) })
  async function remove() {
    if (!confirm('¿Eliminar este registro?')) return
    if (await actions.remove(entity.id)) navigate(listPath)
  }

  return (
    <>
      <PJDetail
        pj={entity}
        notas={isDM ? dm.fields.notas : ''}
        dmStamp={isDM ? (dm.row?.updated_at ?? null) : null}
        isDM={isDM}
        back={
          <Link to={listPath} className={btnSecondary}>
            ← Volver
          </Link>
        }
        actions={
          isDM ? (
            <>
              <button type="button" className={btnSecondary} onClick={remove}>
                Eliminar
              </button>
              <button type="button" className={btnSecondary} onClick={edit}>
                Editar
              </button>
            </>
          ) : isOwnPlayer ? (
            <button type="button" className={btnSecondary} onClick={edit}>
              Editar
            </button>
          ) : null
        }
        regionTag={<RegionTag region={str(entity.region)} />}
        regionColor={regionInfo(str(entity.region)).color}
        customFields={customFields}
        system={system}
        sheet={sheet}
      />
      {isDM && dm.status === 'error' && <DmNotice onRetry={dm.refresh}>No pudimos cargar las notas del DM.</DmNotice>}
    </>
  )
}

function PjCard({ pj, slug, hasDmNotes, dmStamp, search, tags }: { pj: FlatEntity; slug: string; hasDmNotes: boolean; dmStamp: string | null; search: string; tags: SearchableTag[] }) {
  const unread = isPjUnreadVia(useUnreadPort(), pj, hasDmNotes, dmStamp)
  const system = useSystem()
  return (
    <Link to={withSearch(entityPath(slug, 'pjs', pj.id), search)} className={`block ${entityCardCls}`}>
      <UnreadDot unread={unread} className="absolute top-2 right-2" />
      <PJCardContent pj={pj} hasDmNotes={hasDmNotes} regionTag={<RegionTag region={str(pj.region)} />} system={system} tags={tags} />
    </Link>
  )
}

function PjList() {
  const viewer = useCampaign()
  const { campaign, isDM } = viewer
  const { items, loading, error, reload } = useEntities('pjs')
  const { openForm } = useEntityForm()
  const system = useSystem()
  const { search } = useLocation()
  const [query, setQuery] = useUrlParam('q', '')

  const visible = useMemo(() => items.filter((p) => canViewPj(p, viewer)), [items, viewer])
  const notes = useDmSecretIds('pjs', useMemo(() => visible.map((p) => p.id), [visible]), 'notas')
  // Searchable sheet fields (S27): tags per visible character, none without a valid stored sheet
  const sheet = useMemo(() => storedSheet(system), [system])
  const tagsOf = useMemo(() => {
    const map = new Map<number, SearchableTag[]>()
    if (sheet) for (const p of visible) map.set(p.id, searchableTags(sheet, p))
    return map
  }, [sheet, visible])
  const lista = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return visible
    const { clase, raza } = system.character.builtins
    return visible.filter((p) =>
      [p.nombre, clase.enabled ? p.clase : '', raza.enabled ? p.raza : '', p.jugador, ...(tagsOf.get(p.id) ?? []).map((t) => t.text)].some((v) => str(v).toLowerCase().includes(q)),
    )
  }, [visible, query, system, tagsOf])

  return (
    <div>
      <PageHeader eyebrow="Personajes Jugadores" title="El Grupo" titleAs="h1">
        {isDM && (
          <button type="button" className={btnPrimary} onClick={() => openForm({ type: 'pjs' })}>
            + Nuevo PJ
          </button>
        )}
      </PageHeader>

      <div className="mb-5">
        <input
          type="search"
          aria-label="Buscar PJs"
          className="w-full bg-bg-card border border-border-light text-txt-primary px-3.5 py-2.5 font-barlow text-[13px] outline-none transition-colors focus:border-accent-dim placeholder:text-txt-muted"
          placeholder={searchPlaceholder(system, sheet ? searchableLabels(sheet) : [])}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {isDM && notes.status === 'error' && <DmNotice onRetry={notes.refresh}>No pudimos cargar las notas del DM (candados).</DmNotice>}

      {loading ? (
        <Loading />
      ) : error && items.length === 0 ? (
        <p role="alert" className="text-sm text-txt-secondary">
          No pudimos cargar los personajes.{' '}
          <button type="button" className={btnSecondary} onClick={reload}>
            Reintentar
          </button>
        </p>
      ) : lista.length === 0 ? (
        <EmptyState
          icon={<Shield size={40} />}
          title="Sin resultados"
          text={query ? 'No hay PJs que coincidan con la búsqueda.' : `Agregá los personajes jugadores de ${campaign.name}.`}
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3.5">
          {lista.map((p) => (
            <PjCard key={p.id} pj={p} slug={campaign.slug} hasDmNotes={isDM && notes.ids.has(p.id)} dmStamp={isDM ? (notes.stamps.get(p.id) ?? null) : null} search={search} tags={tagsOf.get(p.id) ?? []} />
          ))}
        </div>
      )}
    </div>
  )
}

/** `/c/:slug/pjs` (cards + search) and `/c/:slug/pjs/:id` (character sheet): the URL is the only navigation state. */
export function PJsPage({ id }: SectionPageProps) {
  return <EntitySectionRoute id={id} table="pjs" labels={LABELS} List={PjList} View={PjView} canView={canViewPj} />
}
